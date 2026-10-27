"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Database,
  FileUp,
  ListTree,
  Loader2,
  RefreshCw,
  Users,
  X,
  XCircle,
} from "lucide-react";
import type { JobDto } from "@/app/api/jobs/route";
import { SyncProgressModal } from "@/components/jobs/sync-progress-modal";

// Poll interval (ms)
const POLL_MS = 2500;
// A finished job only triggers a toast if it finished within this window, so we
// never re-notify about old jobs after a page reload.
const FRESH_MS = 10000;
const TOAST_MS = 8000;
// Belt-and-suspenders: even if the server never marks a zombie job finished,
// stop showing it as "running" after this long. Refresh-safe.
const STALE_RUNNING_MS = 30 * 60 * 1000;

const RUNNING = new Set(["RUNNING", "PENDING"]);
const DONE = "DONE";
const ERROR = "ERROR";

function typeIcon(type: string) {
  if (type === "excel_upload") return <FileUp className="h-4 w-4" />;
  if (type.startsWith("sync_")) return <RefreshCw className="h-4 w-4" />;
  return <Database className="h-4 w-4" />;
}

function statusLabel(status: string) {
  if (status === "PENDING") return "Queued";
  if (status === "RUNNING") return "Running…";
  if (status === "ERROR") return "Failed";
  return "Done";
}

export function JobBubble() {
  const [running, setRunning] = useState<JobDto[]>([]);
  const [toasts, setToasts] = useState<JobDto[]>([]);
  // jobId|status keys we've already shown a toast for, to avoid duplicates.
  const seenRef = useRef<Set<string>>(new Set());
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  // Attendance-sync jobs can open a detailed per-site progress modal.
  const [detailsJobId, setDetailsJobId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const openDetails = (jobId: string) => {
    setDetailsJobId(jobId);
    setDetailsOpen(true);
  };

  useEffect(() => {
    return () => {
      for (const t of timersRef.current) clearTimeout(t);
      timersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const addToast = (job: JobDto) => {
      setToasts((prev) => [job, ...prev].slice(0, 6));
      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== job.id));
        timersRef.current.delete(timer);
      }, TOAST_MS);
      timersRef.current.add(timer);
    };

    const poll = async () => {
      try {
        const res = await fetch("/api/jobs", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { jobs: JobDto[] };
        if (cancelled) return;

        const jobs = data.jobs ?? [];
        const now = Date.now();
        // Never show a "running" row that hasn't been updated for a long time:
        // its worker died (deploy/restart) and the row is a zombie. Its task
        // already completed (page shows the result), so hiding it is correct.
        const fresh = jobs.filter(
          (j) => now - new Date(j.updatedAt).getTime() < STALE_RUNNING_MS,
        );
        setRunning(fresh.filter((j) => RUNNING.has(j.status)));

        for (const job of jobs) {
          if (job.status !== DONE && job.status !== ERROR) continue;
          const key = `${job.id}:${job.status}`;
          if (seenRef.current.has(key)) continue;
          seenRef.current.add(key);
          const reference = job.finishedAt ?? job.updatedAt;
          const age = now - new Date(reference).getTime();
          if (age < FRESH_MS) addToast(job);
        }
      } catch {
        // transient network/server errors: ignore and retry next poll
      }
    };

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (running.length === 0 && toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {toasts.map((job) => (
        <div
          key={job.id}
          className="flex w-80 items-start gap-3 rounded-lg border bg-white p-3 shadow-lg"
        >
          {job.status === ERROR ? (
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="truncate">{job.label}</span>
              {job.type === "excel_upload" && (
                <Link href="/uploads" className="shrink-0 text-xs text-blue-600 hover:underline">
                  Open uploads
                </Link>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {job.status === ERROR ? job.error ?? "Task failed." : job.message ?? "Task finished."}
            </p>
            {job.status !== ERROR && job.type === "sync_attendance" && (
              <Link href="/attendance" className="mt-1 inline-block shrink-0 text-xs text-blue-600 hover:underline">
                Open attendance
              </Link>
            )}
            {job.type.startsWith("sync_attendance") && (
              <button
                type="button"
                className="ml-2 mt-1 inline-block shrink-0 text-xs text-blue-600 hover:underline"
                onClick={() => openDetails(job.id)}
              >
                View details
              </button>
            )}
          </div>
        </div>
      ))}

      {running.length > 0 && (
        <div className="w-80 rounded-lg border bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
            </span>
            Running in background
          </div>
          <div className="space-y-2">
            {running.map((job) => (
              <div key={job.id}>
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600" />
                  <span className="shrink-0 text-muted-foreground">{typeIcon(job.type)}</span>
                  <span className="truncate">{job.label}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {job.progress != null && job.status === "RUNNING"
                      ? `${Math.round(job.progress)}%`
                      : statusLabel(job.status)}
                  </span>
                  {job.type.startsWith("sync_attendance") && (
                    <button
                      type="button"
                      aria-label={`Details for ${job.label}`}
                      title="View per-site progress"
                      className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => openDetails(job.id)}
                    >
                      <ListTree className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Dismiss ${job.label}`}
                    title="Dismiss stuck task"
                    className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={async () => {
                      setRunning((prev) => prev.filter((j) => j.id !== job.id));
                      try {
                        await fetch(`/api/jobs?id=${encodeURIComponent(job.id)}`, {
                          method: "DELETE",
                        });
                      } catch {
                        // already hidden locally; next poll confirms
                      }
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {job.message ? (
                  <p className="ml-6 mt-0.5 truncate text-xs text-muted-foreground" title={job.message}>
                    {job.message}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      <SyncProgressModal
        jobId={detailsJobId}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
      />
    </div>
  );
}