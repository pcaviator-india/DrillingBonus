import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export type JobDto = {
  id: string;
  type: string;
  label: string;
  status: "PENDING" | "RUNNING" | "DONE" | "ERROR";
  message: string | null;
  error: string | null;
  progress: number | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
};

/**
 * Polled by the bottom job bubble. Returns active (pending/running) jobs plus
 * recently finished ones so the UI can show progress and completion toasts.
 *
 * Stale guard: `after()` background work is best-effort — if the server
 * restarts/deploys mid-task the job row stays PENDING/RUNNING forever and the
 * bubble never clears (refresh doesn't help since the row is still "running").
 * Any job still unfinished after STALE_MS is auto-marked ERROR on poll so the
 * bubble resolves to a dismissible failure toast instead of a permanent spinner.
 */
const STALE_MS = 30 * 60 * 1000;

export async function GET() {
  const session = await auth();
  // Any signed-in user may watch job progress (bubble). Only admins may dismiss.
  if (!session?.user) {
    return NextResponse.json({ jobs: [] }, { status: 401 });
  }

  // Fail stale zombies so they stop showing as "running" forever.
  const staleCutoff = new Date(Date.now() - STALE_MS);
  await db.job.updateMany({
    where: {
      status: { in: ["RUNNING", "PENDING"] },
      updatedAt: { lt: staleCutoff },
    },
    data: {
      status: "ERROR",
      error:
        "Background worker did not finish in time (server may have restarted). The work may or may not have completed — check the page, then retry or dismiss this task.",
      updatedAt: new Date(),
      finishedAt: new Date(),
    },
  });

  const since = new Date(Date.now() - 10 * 60 * 1000);
  const jobs = await db.job.findMany({
    where: {
      OR: [
        { status: { in: ["RUNNING", "PENDING"] } },
        { finishedAt: { gte: since } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const data: JobDto[] = jobs.map((j) => ({
    id: j.id,
    type: j.type,
    label: j.label,
    status: j.status,
    message: j.message,
    error: j.error,
    progress: j.progress,
    createdAt: j.createdAt.toISOString(),
    updatedAt: j.updatedAt.toISOString(),
    finishedAt: j.finishedAt ? j.finishedAt.toISOString() : null,
  }));

  return NextResponse.json({ jobs: data });
}

/**
 * Dismiss a stuck/old job from the bubble (e.g. a zombie PENDING/RUNNING row
 * whose worker died). Deleting the row removes it from poll results instantly.
 */
export async function DELETE(req: Request) {
  const session = await auth();
  if (session?.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    // Dismiss-all: clear every unfinished job older than 5 minutes.
    await db.job.deleteMany({
      where: {
        status: { in: ["RUNNING", "PENDING"] },
        updatedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
      },
    });
    return NextResponse.json({ ok: true });
  }
  await db.job.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}