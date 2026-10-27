import { after } from "next/server";
import { db } from "@/lib/db";

export type JobStatusValue = "PENDING" | "RUNNING" | "DONE" | "ERROR";

export type CreateJobInput = {
  type: string;
  label: string;
  source?: string;
};

/** Insert a new background job so the bubble can pick it up immediately. */
export async function createJob(input: CreateJobInput) {
  return db.job.create({
    data: {
      type: input.type,
      label: input.label,
      source: input.source ?? "server",
      status: "PENDING",
    },
  });
}

export async function markJobRunning(jobId: string) {
  return db.job.update({
    where: { id: jobId },
    data: { status: "RUNNING", updatedAt: new Date() },
  });
}

type FinishJobInput = {
  status: "DONE" | "ERROR";
  message?: string;
  error?: string;
  revalidatePaths?: string[];
};

/** Mark a job finished (DONE or ERROR) and optionally revalidate cached routes. */
export async function finishJob(jobId: string, input: FinishJobInput) {
  if (input.revalidatePaths && input.revalidatePaths.length > 0) {
    const { revalidatePath } = await import("next/cache");
    for (const p of input.revalidatePaths) revalidatePath(p);
  }
  return db.job.update({
    where: { id: jobId },
    data: {
      status: input.status,
      message: input.status === "DONE" ? (input.message ?? null) : null,
      error: input.status === "ERROR" ? (input.error ?? null) : null,
      updatedAt: new Date(),
      finishedAt: new Date(),
    },
  });
}

/** Update a job's progress message while it runs (keeps the bubble truthful). */
export async function updateJobProgress(jobId: string, progress: number, message?: string) {
  return db.job
    .update({
      where: { id: jobId },
      data: {
        progress,
        ...(message ? { message } : {}),
        updatedAt: new Date(),
      },
    })
    .catch(() => null);
}

export type SyncUnitPlan = {
  siteCode: string | null;
  siteName: string | null;
  windowFrom: string;
  windowTo: string;
};

/** A report emitted by the sync as each (site × window) unit progresses. */
export type SyncUnitReport = {
  siteCode: string | null;
  siteName: string | null;
  windowFrom: string;
  windowTo: string;
  status: "RUNNING" | "DONE" | "ERROR";
  marks?: number;
  days?: number;
  upserted?: number;
  error?: string;
};

/**
 * Bulk-create the full work plan up front so the detailed progress modal can
 * render every (site × window) unit immediately, before any of them run.
 */
export async function createSyncUnits(jobId: string, units: SyncUnitPlan[]) {
  if (units.length === 0) return;
  await db.syncUnit.createMany({
    data: units.map((u) => ({
      jobId,
      // Compound unique lookups can't take null; normalize to "" so the
      // upsert in recordSyncUnit matches the row created here.
      siteCode: u.siteCode ?? "",
      siteName: u.siteName,
      windowFrom: u.windowFrom,
      windowTo: u.windowTo,
      status: "PENDING" as const,
    })),
    skipDuplicates: true,
  });
}

/**
 * Record progress for a single (site × window) unit. Upsert keyed by the natural
 * (jobId, siteCode, windowFrom, windowTo) so re-runs and retries are idempotent.
 * Never throws — progress reporting must not break the sync.
 */
export async function recordSyncUnit(jobId: string, report: SyncUnitReport) {
  const now = new Date();
  const base = {
    status: report.status,
    marks: report.marks ?? undefined,
    days: report.days ?? undefined,
    upserted: report.upserted ?? undefined,
    error: report.status === "ERROR" ? (report.error ?? "unknown error") : null,
    updatedAt: now,
    ...(report.status === "RUNNING" ? { startedAt: now } : {}),
    ...(report.status === "DONE" || report.status === "ERROR" ? { finishedAt: now } : {}),
  };
  return db.syncUnit
    .upsert({
      where: {
        jobId_siteCode_windowFrom_windowTo: {
          jobId,
          siteCode: report.siteCode ?? "",
          windowFrom: report.windowFrom,
          windowTo: report.windowTo,
        },
      },
      create: {
        jobId,
        siteCode: report.siteCode ?? "",
        siteName: report.siteName,
        windowFrom: report.windowFrom,
        windowTo: report.windowTo,
        status: report.status,
        marks: report.marks ?? null,
        days: report.days ?? null,
        upserted: report.upserted ?? null,
        error: base.error,
        startedAt: report.status === "RUNNING" ? now : null,
        finishedAt:
          report.status === "DONE" || report.status === "ERROR" ? now : null,
      },
      update: base,
    })
    .catch(() => null);
}

export type SyncUnitRow = {
  id: string;
  siteCode: string | null;
  siteName: string | null;
  windowFrom: string;
  windowTo: string;
  status: "PENDING" | "RUNNING" | "DONE" | "ERROR";
  marks: number | null;
  days: number | null;
  upserted: number | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

/** Read all units for a job, ordered site-then-date, for the progress modal. */
export async function getSyncUnits(jobId: string): Promise<SyncUnitRow[]> {
  const rows = await db.syncUnit.findMany({
    where: { jobId },
    orderBy: [{ siteCode: "asc" }, { windowFrom: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    siteCode: r.siteCode,
    siteName: r.siteName,
    windowFrom: r.windowFrom,
    windowTo: r.windowTo,
    status: r.status,
    marks: r.marks,
    days: r.days,
    upserted: r.upserted,
    error: r.error,
    startedAt: r.startedAt ? r.startedAt.toISOString() : null,
    finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
  }));
}

/** Reset the given units (or all ERROR units) back to RUNNING for a retry. */
export async function resetSyncUnitsForRetry(jobId: string, unitIds?: string[]) {
  await db.syncUnit.updateMany({
    where: {
      jobId,
      ...(unitIds && unitIds.length > 0 ? { id: { in: unitIds } } : { status: "ERROR" }),
    },
    data: {
      status: "RUNNING",
      error: null,
      startedAt: new Date(),
      finishedAt: null,
      updatedAt: new Date(),
    },
  });
}

export type BackgroundTask = {
  jobId: string;
  run: () => Promise<{ message?: string; revalidatePaths?: string[] }>;
};

/**
 * Runs the task in the background AFTER the current response has been sent,
 * so the server action returns to the user immediately and they can keep
 * working. Requires a Node runtime (`next start`) — comparable to `waitUntil`.
 * Progress is surfaced through the /api/jobs endpoint + the bottom bubble.
 */
export function runJobInBackground(task: BackgroundTask) {
  after(async () => {
    try {
      await markJobRunning(task.jobId);
      const result = await task.run();
      await finishJob(task.jobId, {
        status: "DONE",
        message: result.message,
        revalidatePaths: result.revalidatePaths,
      });
    } catch (err) {
      await finishJob(task.jobId, {
        status: "ERROR",
        error: err instanceof Error ? err.message : "unknown error",
      }).catch(() => {});
    }
  });
}