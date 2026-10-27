import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { JobDto } from "@/app/api/jobs/route";

export type SyncUnitDto = {
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

/**
 * Full detail for one job: the job row plus (for attendance syncs) every
 * per-site × per-window sync unit so the details modal can render the grid
 * and offer retry of failed units. Any signed-in user may watch progress.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const job = await db.job.findUnique({ where: { id } });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const jobDto: JobDto = {
    id: job.id,
    type: job.type,
    label: job.label,
    status: job.status,
    message: job.message,
    error: job.error,
    progress: job.progress,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    finishedAt: job.finishedAt ? job.finishedAt.toISOString() : null,
  };

  const units = job.type.startsWith("sync_attendance")
    ? await db.syncUnit.findMany({
        where: { jobId: job.id },
        orderBy: [{ siteName: "asc" }, { siteCode: "asc" }, { windowFrom: "asc" }],
      })
    : [];

  const unitDtos: SyncUnitDto[] = units.map((u) => ({
    id: u.id,
    siteCode: u.siteCode,
    siteName: u.siteName,
    windowFrom: u.windowFrom,
    windowTo: u.windowTo,
    status: u.status as SyncUnitDto["status"],
    marks: u.marks,
    days: u.days,
    upserted: u.upserted,
    error: u.error,
    startedAt: u.startedAt ? u.startedAt.toISOString() : null,
    finishedAt: u.finishedAt ? u.finishedAt.toISOString() : null,
  }));

  return NextResponse.json({ job: jobDto, units: unitDtos });
}