"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import type { JobDto } from "@/app/api/jobs/route";
import type { SyncUnitDto } from "@/app/api/jobs/[id]/route";
import { retrySyncAction, type SyncState } from "@/app/(dashboard)/sync/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const POLL_MS = 1800;
const RUNNING = new Set(["RUNNING", "PENDING"]);

type Status = SyncUnitDto["status"];

function unitBadge(status: Status) {
  switch (status) {
    case "RUNNING":
      return (
        <Badge className="gap-1 bg-blue-100 text-blue-800" variant="outline">
          <Loader2 className="h-3 w-3 animate-spin" /> Running
        </Badge>
      );
    case "DONE":
      return (
        <Badge className="bg-green-100 text-green-800" variant="outline">
          Done
        </Badge>
      );
    case "ERROR":
      return (
        <Badge className="bg-red-100 text-red-800" variant="outline">
          Failed
        </Badge>
      );
    default:
      return (
        <Badge className="bg-gray-100 text-gray-700" variant="outline">
          Pending
        </Badge>
      );
  }
}

function fmtDate(iso: string) {
  return iso.slice(0, 10);
}

/**
 * Detailed progress for one attendance sync job: polls /api/jobs/[id] while the
 * job runs, shows the site × date-window unit grid (including per-unit errors),
 * and offers "Retry failed" which re-runs only the failing units.
 */
export function SyncProgressModal({
  jobId,
  open,
  onOpenChange,
}: {
  jobId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [job, setJob] = useState<JobDto | null>(null);
  const [units, setUnits] = useState<SyncUnitDto[]>([]);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [retrying, setRetrying] = useState(false);
  const [retryState, setRetryState] = useState<SyncState | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!jobId) return;
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { job: JobDto; units: SyncUnitDto[] };
      setJob(data.job);
      setUnits(data.units ?? []);
    } catch {
      // transient network error: keep last state, retry next tick
    }
  }, [jobId]);

  useEffect(() => {
    if (!open || !jobId) return;
    setOnlyErrors(false);
    setExpanded(new Set());
    setRetryState(null);
    fetchDetail();
  }, [open, jobId, fetchDetail]);

  useEffect(() => {
    if (!open || !jobId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      await fetchDetail();
      if (!stopped) timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [open, jobId, fetchDetail]);

  const running = job ? RUNNING.has(job.status) : false;
  const total = units.length;
  const done = units.filter((u) => u.status === "DONE").length;
  const failed = units.filter((u) => u.status === "ERROR").length;
  const active = units.filter((u) => u.status === "RUNNING").length;
  const pending = total - done - failed - active;

  const current = units.find((u) => u.status === "RUNNING");
  const shown = onlyErrors ? units.filter((u) => u.status === "ERROR") : units;

  const handleRetry = async () => {
    if (!jobId || retrying) return;
    setRetrying(true);
    setRetryState(null);
    try {
      const state = await retrySyncAction(jobId);
      setRetryState(state);
      // Immediate refetch so the new retry job + reset units show up.
      await fetchDetail();
    } catch (err) {
      setRetryState({ error: err instanceof Error ? err.message : "Retry failed" });
    } finally {
      setRetrying(false);
    }
  };

  const toggleError = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-6">
            {job?.label ?? "Attendance sync details"}
          </DialogTitle>
          <DialogDescription>
            {running
              ? "Live progress per site and date window. Failed windows can be retried."
              : "Per-site, per-window breakdown of this attendance sync job."}
          </DialogDescription>
        </DialogHeader>

        {/* Summary chips */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Chip label="Total" value={total} />
          <Chip label="Done" value={done} tone="green" />
          <Chip label="Failed" value={failed} tone="red" />
          <Chip label="Active" value={active} tone="blue" />
          <Chip label="Pending" value={pending} tone="gray" />
          {job && (
            <span className="ml-auto text-muted-foreground">
              {job.status === "RUNNING" && job.progress != null
                ? `${Math.round(job.progress)}%`
                : job.status}
            </span>
          )}
        </div>

        {/* Now processing */}
        {running && (
          <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            <span className="truncate">
              {current
                ? `Processing ${current.siteName ?? current.siteCode ?? "(all sites)"} · ${fmtDate(current.windowFrom)} → ${fmtDate(current.windowTo)}`
                : (job?.message ?? "Starting…")}
            </span>
          </div>
        )}

        {/* Job message (completion summary) */}
        {!running && job && (job.message || job.error) && (
          <div
            className={cn(
              "rounded-md border px-3 py-2 text-sm",
              job.status === "ERROR"
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-green-200 bg-green-50 text-green-800",
            )}
          >
            {job.status === "ERROR" ? job.error : job.message}
          </div>
        )}

        {retryState && (
          <div
            className={cn(
              "rounded-md border px-3 py-2 text-sm",
              retryState.error
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-blue-200 bg-blue-50 text-blue-800",
            )}
          >
            {retryState.error ?? retryState.message}
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground select-none">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-red-600"
              checked={onlyErrors}
              onChange={(e) => setOnlyErrors(e.target.checked)}
            />
            Show only errors
          </label>
          <button
            type="button"
            onClick={fetchDetail}
            className="ml-auto inline-flex items-center gap-1 rounded border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
          <button
            type="button"
            onClick={handleRetry}
            disabled={retrying || failed === 0 || running}
            title={failed === 0 ? "No failed windows to retry" : undefined}
            className="inline-flex items-center gap-1 rounded bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {retrying ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RotateCcw className="h-3 w-3" />
            )}
            Retry failed{failed > 0 ? ` (${failed})` : ""}
          </button>
        </div>

        {/* Unit table */}
        <div className="max-h-[50vh] overflow-y-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Site</th>
                <th className="px-3 py-2 text-left font-medium">Window</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Marks</th>
                <th className="px-3 py-2 text-right font-medium">Days</th>
                <th className="px-3 py-2 text-right font-medium">Saved</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-6 text-center text-sm text-muted-foreground"
                  >
                    {total === 0
                      ? "No units tracked for this job yet."
                      : onlyErrors
                        ? "No failed windows — everything synced."
                        : "No units to show."}
                  </td>
                </tr>
              )}
              {shown.map((u) => (
                <UnitRow
                  key={u.id}
                  unit={u}
                  expanded={expanded.has(u.id)}
                  onToggle={() => toggleError(u.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Chip({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "green" | "red" | "blue" | "gray";
}) {
  const tones: Record<string, string> = {
    default: "border-border",
    green: "border-green-300 text-green-700",
    red: "border-red-300 text-red-700",
    blue: "border-blue-300 text-blue-700",
    gray: "border-gray-300 text-gray-600",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
        tones[tone],
      )}
    >
      <span className="font-medium">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

function UnitRow({
  unit,
  expanded,
  onToggle,
}: {
  unit: SyncUnitDto;
  expanded: boolean;
  onToggle: () => void;
}) {
  const siteLabel = unit.siteName
    ? `${unit.siteName}${unit.siteCode ? ` (${unit.siteCode})` : ""}`
    : unit.siteCode || "(all sites)";
  const hasError = unit.status === "ERROR" && Boolean(unit.error);
  return (
    <>
      <tr
        className={cn(
          "border-t align-top",
          unit.status === "ERROR" && "bg-red-50/50",
          unit.status === "RUNNING" && "bg-blue-50/50",
          hasError && "cursor-pointer",
        )}
        onClick={hasError ? onToggle : undefined}
      >
        <td className="px-3 py-2">
          <div className="flex items-center gap-1.5">
            {unit.status === "ERROR" && (
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600" />
            )}
            <span className="truncate" title={siteLabel}>
              {siteLabel}
            </span>
          </div>
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
          {fmtDate(unit.windowFrom)} → {fmtDate(unit.windowTo)}
        </td>
        <td className="px-3 py-2">{unitBadge(unit.status)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{unit.marks ?? "—"}</td>
        <td className="px-3 py-2 text-right tabular-nums">{unit.days ?? "—"}</td>
        <td className="px-3 py-2 text-right tabular-nums">{unit.upserted ?? "—"}</td>
      </tr>
      {hasError && expanded && (
        <tr className="border-t bg-red-50/50">
          <td colSpan={6} className="px-3 pb-3 pt-0">
            <pre className="whitespace-pre-wrap break-words rounded bg-white/70 p-2 text-xs text-red-800">
              {unit.error}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}