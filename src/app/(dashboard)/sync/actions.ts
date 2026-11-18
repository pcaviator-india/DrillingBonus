"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  createJob,
  runJobInBackground,
  updateJobProgress,
  recordSyncUnit,
  type SyncUnitReport,
} from "@/lib/jobs/service";
import {
  syncEmployeesFromWorkera,
  syncAttendanceFromWorkera,
  retryAttendanceUnits,
  importOrgUnitsFromWorkera,
  setBranchSelected,
  setDepartmentSelected,
} from "@/lib/workera/sync";

const backgroundNote =
  " started in the background — you can keep working. Watch the bubble at the bottom right for the result.";

export type SyncState = {
  error?: string;
  message?: string;
};

const periodSchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "From must be a date (yyyy-MM-dd)"),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "To must be a date (yyyy-MM-dd)"),
  })
  .refine((v) => v.from <= v.to, {
    message: "From date must be on or before To date",
    path: ["from"],
  });

// Max units per background task to stay under Vercel's 300s serverless timeout.
// Each unit fetches Workera + upserts DB rows; ~5 units keeps us well under the limit.
const UNITS_PER_TASK = 5;

export async function syncEmployeesAction(): Promise<SyncState> {
  const session = await auth();
  if (!session?.user) return { error: "Not authenticated" };

  const job = await createJob({ type: "sync_employees", label: "Employees", source: "workera" });

  runJobInBackground({
    jobId: job.id,
    run: async () => {
      const result = await syncEmployeesFromWorkera(
        async (label, done, total) => {
          await updateJobProgress(job.id, Math.round((done / total) * 100), label);
        },
      );
      return {
        message: `Employees synced: ${result.employeesUpdated} upserted${result.failed ? ` · ${result.failed} failed` : ""}.`,
        revalidatePaths: ["/employees", "/sites"],
      };
    },
  });

  return { message: `Employee sync${backgroundNote}` };
}
export async function importOrgUnitsAction(): Promise<SyncState> {
  const session = await auth();
  if (!session?.user) return { error: "Not authenticated" };

  const job = await createJob({
    type: "sync_org_units",
    label: "Branch offices & departments",
    source: "workera",
  });

  runJobInBackground({
    jobId: job.id,
    run: async () => {
      const res = await importOrgUnitsFromWorkera();
      return {
        message: `Imported ${res.branchesImported} branch office(s) and ${res.departmentsImported} department(s). Select which ones to use below.`,
        revalidatePaths: ["/sync"],
      };
    },
  });

  return { message: `Org-unit import${backgroundNote}` };
}

export async function toggleBranchAction(code: string, selected: boolean): Promise<SyncState> {
  const session = await auth();
  if (!session?.user) return { error: "Not authenticated" };
  await setBranchSelected(code, selected);
  revalidatePath("/sync");
  return { message: `Branch ${code} ${selected ? "selected" : "deselected"}.` };
}

export async function toggleDepartmentAction(code: string, selected: boolean): Promise<SyncState> {
  const session = await auth();
  if (!session?.user) return { error: "Not authenticated" };
  await setDepartmentSelected(code, selected);
  revalidatePath("/sync");
  return { message: `Department ${code} ${selected ? "selected" : "deselected"}.` };
}

export async function syncAttendanceAction(
  _prev: SyncState,
  formData: FormData,
): Promise<SyncState> {
  const session = await auth();
  if (!session?.user) return { error: "Not authenticated" };

  const parsed = periodSchema.safeParse({
    from: formData.get("from"),
    to: formData.get("to"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid period" };
  }

  const job = await createJob({
    type: "sync_attendance",
    label: `Attendance ${parsed.data.from} → ${parsed.data.to}`,
    source: "workera",
  });

  runJobInBackground({
    jobId: job.id,
    run: async () => {
      // Process units in chunks to stay under the 300s serverless timeout.
      // Each chunk runs as a separate background task; when one finishes,
      // it triggers the next via the internal /api/sync/continue endpoint.
      let unitsDone = 0;
      let unitsFailed = 0;
      let startUnitIndex = 0;
      let lastResult: Awaited<ReturnType<typeof syncAttendanceFromWorkera>> | null = null;

      for (;;) {
        const result = await syncAttendanceFromWorkera(
          parsed.data.from,
          parsed.data.to,
          async (windowLabel, done, total) => {
            await updateJobProgress(
              job.id,
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
        lastResult = result;

        // If there are remaining units, chain the next task via internal fetch.
        if (result.remainingUnits && result.remainingUnits > 0) {
          startUnitIndex += UNITS_PER_TASK;
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
                body: JSON.stringify({ jobId: job.id, startUnitIndex }),
              });
            }
          } catch {
            // If chaining fails, the remaining units can be retried via the
            // "Retry failed sites" action on the sync page.
          }
          break;
        }

        break;
      }

      const result = lastResult!;
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
        message: `Attendance ${parsed.data.from} → ${parsed.data.to}: ${details}.${unitSummary}`,
        revalidatePaths: ["/attendance"],
      };
    },
  });

  return { message: `Attendance sync${backgroundNote}` };
}

/**
 * Retries only the failed units of an existing attendance sync job. Creates a
 * child-style job (type sync_attendance_retry) that re-runs the selected/error
 * units via retryAttendanceUnits — the original job's unit rows are updated in
 * place so the details modal shows the fresh status.
 */
export async function retrySyncAction(
  jobId: string,
  unitIds?: string[],
): Promise<SyncState> {
  const session = await auth();
  if (!session?.user) return { error: "Not authenticated" };

  const original = await db.job.findUnique({ where: { id: jobId } });
  if (!original) return { error: "Job not found" };
  if (!original.type.startsWith("sync_attendance")) {
    return { error: "Only attendance sync jobs support unit retry" };
  }

  const job = await createJob({
    type: "sync_attendance_retry",
    label: `Retry failed sites — ${original.label}`,
    source: "workera",
  });

  runJobInBackground({
    jobId: job.id,
    run: async () => {
      const res = await retryAttendanceUnits(
        jobId,
        unitIds,
        async (windowLabel, done, total) => {
          await updateJobProgress(
            job.id,
            Math.round((done / total) * 100),
            `Retrying ${windowLabel}…`,
          );
        },
      );
      const message =
        res.failed === 0
          ? `Retry complete: ${res.succeeded}/${res.retried} unit(s) now synced.`
          : `Retry partial: ${res.succeeded} recovered, ${res.failed} still failing.`;
      return {
        message,
        revalidatePaths: ["/attendance", "/sync"],
      };
    },
  });

  return { message: `Retrying failed sites${backgroundNote}` };
}