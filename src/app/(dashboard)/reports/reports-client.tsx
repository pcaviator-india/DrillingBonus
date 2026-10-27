"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { rebuildWorkDaysAction } from "./actions";
import type { EmployeeSummary, WorkDayFlag } from "@/lib/matching/build";

const FLAG_LABELS: Record<WorkDayFlag, string> = {
  "no-employee": "No employee matched",
  "no-site-alias": "Unmapped site (proyecto)",
  "no-rig-alias": "Unmapped machine",
  "rig-no-performance": "No rig performance data",
  "workera-not-marked": "Not in Workera",
  "not-in-planilla": "Not in planilla",
  "multiple-shifts": "Multiple shifts",
};

export function ReportsClient({
  from,
  to,
  summary,
}: {
  from: string;
  to: string;
  summary: EmployeeSummary[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
      const [fromVal, setFromVal] = useState(from);
  const [toVal, setToVal] = useState(to);
  // Client-side filter state, synced to URL
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<"all" | "1" | "2">("all");
  const [shiftDayNight, setShiftDayNight] = useState<"all" | "day" | "night">("all");
    const [turnoAB, setTurnoAB] = useState<"all" | "A" | "B">("all");
  const [siteFilter, setSiteFilter] = useState<"all" | string>("all");

  // Distinct sites present in the current period, for the site filter dropdown
  const sites = [
    ...new Set(summary.map((s) => s.siteName).filter((n): n is string => Boolean(n))),
  ].sort();

  // Apply client-side filters to the server-provided summary
  const filtered = summary.filter((s) => {
    if (search) {
      const q = search.toLowerCase();
      const hay = `${s.employeeName} ${s.employeeRut ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (siteFilter !== "all" && (s.siteName ?? "") !== siteFilter) return false;
    if (groupFilter !== "all" && !(s.positionGroup ?? "").startsWith(`Group ${groupFilter}`)) return false;
    if (shiftDayNight === "day" && s.shiftDayCount === 0) return false;
    if (shiftDayNight === "night" && s.shiftNightCount === 0) return false;
    if (turnoAB === "A" && s.turnoA === 0) return false;
    if (turnoAB === "B" && s.turnoB === 0) return false;
    return true;
  });

    const totalMeters = filtered.reduce((n, s) => n + s.totalMeters, 0);
  const totalDays = filtered.reduce((n, s) => n + s.daysWorked, 0);
  const flaggedCount = filtered.reduce((n, s) => n + s.flags, 0);

  function handlePeriodSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fromVal || !toVal || fromVal > toVal) {
      setMsg({ type: "err", text: "Please select a valid From / To range." });
      return;
    }
    router.push(`/reports?from=${fromVal}&to=${toVal}`);
  }

  function handleRebuild() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("from", from);
      fd.set("to", to);
      const res = await rebuildWorkDaysAction({ error: undefined, success: undefined }, fd);
      if (res.error) setMsg({ type: "err", text: res.error });
      else {
        setMsg({ type: "ok", text: res.success ?? "Done" });
        router.refresh();
      }
    });
  }

  

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Work Day Reports</h1>
        <div className="flex items-center gap-3">
          <form onSubmit={handlePeriodSubmit} className="flex items-center gap-2 text-sm">
            <label className="flex items-center gap-1 text-muted-foreground">
              From
              <input
                type="date"
                value={fromVal}
                onChange={(e) => setFromVal(e.target.value)}
                className="rounded border px-2 py-1"
              />
            </label>
            <label className="flex items-center gap-1 text-muted-foreground">
              To
              <input
                type="date"
                value={toVal}
                onChange={(e) => setToVal(e.target.value)}
                className="rounded border px-2 py-1"
              />
            </label>
            <button
              type="submit"
              className="rounded border bg-muted px-3 py-1 font-medium hover:bg-muted/70"
            >
              Go
            </button>
          </form>
          <button
            onClick={handleRebuild}
            disabled={isPending}
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? "Rebuilding…" : "Rebuild Work Days"}
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 rounded border p-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Search (name / RUT)</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee or RUT…"
            className="rounded border px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Site</span>
          <select
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
            className="rounded border px-2 py-1"
          >
            <option value="all">All sites</option>
            {sites.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Group</span>
          <select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value as "all" | "1" | "2")}
            className="rounded border px-2 py-1"
          >
            <option value="all">All</option>
            <option value="1">Group 1</option>
            <option value="2">Group 2</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Shift (Day / Night)</span>
          <select
            value={shiftDayNight}
            onChange={(e) => setShiftDayNight(e.target.value as "all" | "day" | "night")}
            className="rounded border px-2 py-1"
          >
            <option value="all">All</option>
            <option value="day">Day</option>
            <option value="night">Night</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Shift (A / B)</span>
          <select
            value={turnoAB}
            onChange={(e) => setTurnoAB(e.target.value as "all" | "A" | "B")}
            className="rounded border px-2 py-1"
          >
            <option value="all">All</option>
            <option value="A">A</option>
            <option value="B">B</option>
          </select>
        </label>
        {(search || siteFilter !== "all" || groupFilter !== "all" || shiftDayNight !== "all" || turnoAB !== "all") && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setSiteFilter("all");
              setGroupFilter("all");
              setShiftDayNight("all");
              setTurnoAB("all");
            }}
            className="rounded border px-3 py-1 text-muted-foreground hover:bg-muted/60"
          >
            Clear
          </button>
        )}
      </div>

      {msg && (
        <div
          className={`rounded p-3 text-sm ${msg.type === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}
        >
          {msg.text}
        </div>
      )}

      <div className="grid grid-cols-4 gap-4">
        <div className="rounded border p-4">
          <div className="text-sm text-muted-foreground">Employees</div>
          <div className="text-2xl font-bold">{filtered.length}</div>
        </div>
        <div className="rounded border p-4">
          <div className="text-sm text-muted-foreground">Total work days</div>
          <div className="text-2xl font-bold">{totalDays}</div>
        </div>
        <div className="rounded border p-4">
          <div className="text-sm text-muted-foreground">Total meters</div>
          <div className="text-2xl font-bold">{totalMeters.toFixed(1)}</div>
        </div>
        <div className="rounded border p-4">
          <div className="text-sm text-muted-foreground">Days with flags</div>
          <div className="text-2xl font-bold">{flaggedCount}</div>
        </div>
      </div>

             
      <div className="rounded border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="px-4 py-2">Employee</th>
              <th className="px-4 py-2">Site</th>
              <th className="px-4 py-2">RUT</th>
              <th className="px-4 py-2">Group</th>
              <th className="px-4 py-2 text-right">Days</th>
              <th className="px-4 py-2 text-right">Present</th>
              <th className="px-4 py-2 text-right">Meters</th>
              <th className="px-4 py-2 text-right">Hours</th>
              <th className="px-4 py-2">Rigs</th>
              <th className="px-4 py-2 text-center">Flags</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">
                  {summary.length === 0
                    ? "No work days built for this period. Upload planilla + rig files and click &ldquo;Rebuild Work Days&rdquo;."
                    : "No employees match the current filters."}
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr key={s.employeeId} className="border-b hover:bg-muted/30">
                  <td className="px-4 py-2 font-medium">{s.employeeName}</td>
                  <td className="px-4 py-2 text-muted-foreground">{s.siteName ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{s.employeeRut ?? "—"}</td>
                  <td className="px-4 py-2">{s.positionGroup ?? "—"}</td>
                  <td className="px-4 py-2 text-right">{s.daysWorked}</td>
                  <td className="px-4 py-2 text-right">{s.daysPresent}</td>
                  <td className="px-4 py-2 text-right">{s.totalMeters.toFixed(1)}</td>
                  <td className="px-4 py-2 text-right">{s.totalHours.toFixed(1)}</td>
                  <td className="px-4 py-2 text-xs">{s.rigs.join(", ") || "—"}</td>
                  <td className="px-4 py-2 text-center">
                    {s.flags > 0 ? (
                      <span className="rounded bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800">
                        {s.flags}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <Link
                      href={`/reports/${s.employeeId}?from=${from}&to=${to}`}
                      className="text-xs text-primary hover:underline"
                    >
                      Details
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded border p-4">
        <h3 className="mb-2 text-sm font-semibold">Flag legend</h3>
        <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
          {Object.entries(FLAG_LABELS).map(([k, v]) => (
            <div key={k}>
              <code className="rounded bg-muted px-1 py-0.5">{k}</code> — {v}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
