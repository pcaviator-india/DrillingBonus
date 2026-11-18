import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  createJob,
  runJobInBackground,
  updateJobProgress,
  recordSyncUnit,
  type SyncUnitReport,
} from "@/lib/jobs/service";
import { syncAttendanceFromWorkera } from "@/lib/workera/sync";

/**
 * Internal continuation endpoint for chunked attendance syncs.
 *
 * Called by the background task when it approaches the 300s serverless
 * timeout and needs to hand off remaining units to a new task.
 *
 * Body: { jobId: string, startUnitIndex: number }
 */
export async function POST(req: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Verify cron secret for internal calls
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { jobId?: string; startUnitIndex?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const { jobId, startUnitIndex } = body;
  if (!jobId || startUnitIndex === undefined) {
    return NextResponse.json({ error: "missing jobId or startUnitIndex" }, { status: 400 });
  }

  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) {
    return NextResponse.json({ error: "job not found" }, { status: 404 });
  }

  // Read the original period from the job label, e.g. "Attendance 2026-09-30 → 2026-10-30"
  const label = job.label;
  const match = label.match(/Attendance (\d{4}-\d{2}-\d{2}) → (\d{4}-\d{2}-\d{2})/);
  if (!match) {
    return NextResponse.json({ error: "cannot parse period from job label" }, { status: 400 });
  }
  const [, from, to] = match;

  const UNITS_PER_TASK = 5;

  const continuationJob = await createJob({
    type: "sync_attendance_continue",
    label: `Attendance continue ${from} → ${to} (unit ${startUnitIndex})`,
    source: "workera",
  });

  runJobInBackground({
    jobId: continuationJob.id,
    run: async () => {
      let unitsDone = 0;
      let unitsFailed = 0;

      const result = await syncAttendanceFromWorkera(
        from,
        to,
        async (windowLabel, done, total) => {
          await updateJobProgress(
            continuationJob.id,
            Math.round((done / total) * 100),
            `Syncing ${windowLabel}…`,
          );
        },
        job.id,
        async (report: SyncUnitReport) => {
          await recordSyncUnit(job.id, report);
          if (report.status === "DONE") unitsDone += 1;
          if (report.status === "ERROR") unitsFailed += 1;
        },
        { startUnitIndex, maxUnits: UNITS_PER_TASK },
      );

      // If there are still remaining units, chain yet another task.
      if (result.remainingUnits && result.remainingUnits > 0) {
        const nextIndex = startUnitIndex + UNITS_PER_TASK;
        try {
          const baseUrl =
            process.env.NEXTAUTH_URL ??
            (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
          const continueUrl = `${baseUrl}/api/sync/continue`;
          if (continueUrl) {
            await fetch(continueUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}`,
              },
              body: JSON.stringify({ jobId: job.id, startUnitIndex: nextIndex }),
            });
          }
        } catch {
          // Chaining failed; remaining units can be retried via the UI.
        }
      }

      const details = [
        `${result.attendanceUpserted} day-records saved`,
        `${result.rawMarks ?? 0} raw marks fetched`,
        `${result.daysAggregated ?? 0} employee-days paired (IN→OUT)`,
        `${result.autoCreated ?? 0} employees auto-created from Workera`,
        `${result.skippedUnknown ?? 0} skipped (unknown employee)`,
        `${result.autoApproved ?? 0} GPS auto-approved`,
      ].join(" · ");
      const unitSummary =
        unitsDone + unitsFailed > 0
          ? ` Sites: ${unitsDone} synced${unitsFailed > 0 ? ` · ${unitsFailed} failed (retryable)` : ""}.`
          : "";
      return {
        message: `Attendance continue ${from} → ${to}: ${details}.${unitSummary}`,
        revalidatePaths: ["/attendance"],
      };
    },
  });

  return NextResponse.json({
    message: `Attendance continuation started (unit ${startUnitIndex})`,
    jobId: continuationJob.id,
  });
}
