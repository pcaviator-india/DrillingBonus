"use client";

import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AttendanceMatchRow, AttendanceMatchVerdict } from "@/lib/reconciliation/types";

const VERDICT_LABELS: Record<AttendanceMatchVerdict, string> = {
  matched: "Matched",
  "workera-absent": "Workera absent",
  "planilla-only": "Planilla only",
  "workera-only": "Workera only",
  "says-no-but-present": "Says No / present",
  "shift-mismatch": "Shift mismatch",
  "multi-shift-planilla": "Day + night",
};

const VERDICT_CLASS: Record<AttendanceMatchVerdict, string> = {
  matched: "bg-green-100 text-green-800",
  "planilla-only": "bg-amber-100 text-amber-800",
  "says-no-but-present": "bg-amber-100 text-amber-800",
  "shift-mismatch": "bg-orange-100 text-orange-800",
  "multi-shift-planilla": "bg-muted text-muted-foreground",
  "workera-absent": "bg-red-100 text-red-800",
  "workera-only": "bg-blue-100 text-blue-800",
};

const FLAG_LABELS: Record<string, string> = {
  "unmatched-rut": "No employee for this RUT",
  "no-site": "No site resolved",
  "no-workera-columns": "Sheet has no Workera columns",
  "claims-mark-no-record": "Sheet says marked — no Workera record",
  "present-but-zero-hours": "Present with 0 h",
};

const VERDICTS: AttendanceMatchVerdict[] = [
  "matched",
  "workera-absent",
  "planilla-only",
  "says-no-but-present",
  "shift-mismatch",
  "multi-shift-planilla",
  "workera-only",
];

function boolMark(value: boolean | null): string {
  if (value === true) return "Sí";
  if (value === false) return "No";
  return "—";
}

const selectClass = "rounded border px-2 py-1";

export function AttendanceMatchTable({ rows }: { rows: AttendanceMatchRow[] }) {
  const [search, setSearch] = useState("");
  const [verdict, setVerdict] = useState<"all" | AttendanceMatchVerdict>("all");
  const [shift, setShift] = useState<"all" | "day" | "night" | "day+night">("all");
  const [turno, setTurno] = useState<"all" | "A" | "B" | "none">("all");
  const [onlyProblems, setOnlyProblems] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (verdict !== "all" && r.verdict !== verdict) return false;
      if (onlyProblems && r.verdict === "matched") return false;
      if (
        shift !== "all" &&
        !([r.planillaShift, r.workeraShift] as (string | null)[]).includes(shift)
      ) {
        return false;
      }
      if (turno !== "all") {
        if (turno === "none") {
          if (r.turnoAB !== null) return false;
        } else if (r.turnoAB !== turno) {
          return false;
        }
      }
      if (q) {
        const haystack = [r.employeeName, r.rut, r.siteName, r.department, r.machine, r.workeraStatus]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, verdict, shift, turno, onlyProblems]);

  const hasActiveFilters =
    search.trim() !== "" || verdict !== "all" || shift !== "all" || turno !== "all" || onlyProblems;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded border p-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Search (name / RUT / machine)</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className={selectClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Verdict</span>
          <select
            className={selectClass}
            value={verdict}
            onChange={(e) => setVerdict(e.target.value as "all" | AttendanceMatchVerdict)}
          >
            <option value="all">All</option>
            {VERDICTS.map((v) => (
              <option key={v} value={v}>
                {VERDICT_LABELS[v]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Shift</span>
          <select
            className={selectClass}
            value={shift}
            onChange={(e) => setShift(e.target.value as "all" | "day" | "night" | "day+night")}
          >
            <option value="all">All</option>
            <option value="day">Day</option>
            <option value="night">Night</option>
            <option value="day+night">Day + night</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Turno (A/B)</span>
          <select
            className={selectClass}
            value={turno}
            onChange={(e) => setTurno(e.target.value as "all" | "A" | "B" | "none")}
          >
            <option value="all">All</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="none">Not declared</option>
          </select>
        </label>
        <label className="flex items-center gap-2 pb-1">
          <input
            type="checkbox"
            checked={onlyProblems}
            onChange={(e) => setOnlyProblems(e.target.checked)}
            className="h-4 w-4 rounded border-input accent-primary"
          />
          <span>Only problems</span>
        </label>
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setVerdict("all");
              setShift("all");
              setTurno("all");
              setOnlyProblems(false);
            }}
            className="rounded border px-3 py-1 text-muted-foreground hover:bg-muted/60"
          >
            Clear
          </button>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length.toLocaleString()} of {rows.length.toLocaleString()} row(s)
      </p>

      <div className="overflow-x-auto rounded border">
        <Table className="min-w-[1500px]">
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>RUT</TableHead>
              <TableHead>Site</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Planilla shift</TableHead>
              <TableHead>Turno</TableHead>
              <TableHead>Machine</TableHead>
              <TableHead>Sheet Workera (in / out)</TableHead>
              <TableHead>Workera status</TableHead>
              <TableHead>Workera shift</TableHead>
              <TableHead>Workera in / out</TableHead>
              <TableHead className="text-right">Hours</TableHead>
              <TableHead>Verdict</TableHead>
              <TableHead>Flags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={15} className="text-center text-muted-foreground">
                  No planilla rows or attendance records found for this period yet.
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={15} className="text-center text-muted-foreground">
                  No records match these filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="whitespace-nowrap">{r.date}</TableCell>
                  <TableCell className="font-medium">{r.employeeName}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {r.rut ?? "—"}
                  </TableCell>
                  <TableCell>{r.siteName ?? "—"}</TableCell>
                  <TableCell>{r.department ?? "—"}</TableCell>
                  <TableCell>{r.planillaShift ?? "—"}</TableCell>
                  <TableCell>{r.turnoAB ?? "—"}</TableCell>
                  <TableCell>{r.machine ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {boolMark(r.planillaMarkedIn)} / {boolMark(r.planillaMarkedOut)}
                  </TableCell>
                  <TableCell>{r.workeraStatus ?? "no record"}</TableCell>
                  <TableCell>{r.workeraShift ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {r.timeIn || r.timeOut ? `${r.timeIn ?? "—"} / ${r.timeOut ?? "—"}` : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.hoursWorked !== null ? r.hoursWorked.toFixed(1) : "—"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${VERDICT_CLASS[r.verdict]}`}
                    >
                      {VERDICT_LABELS[r.verdict]}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.flags.length === 0 ? "—" : r.flags.map((f) => FLAG_LABELS[f] ?? f).join(" · ")}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="rounded border p-4">
        <h3 className="mb-2 text-sm font-semibold">Verdict legend</h3>
        <div className="grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-2">
          <div>
            <code className="rounded bg-muted px-1 py-0.5">matched</code> — planilla row with a
            present Workera record.
          </div>
          <div>
            <code className="rounded bg-muted px-1 py-0.5">workera-absent</code> — Workera has the day
            as absent while the planilla recorded work.
          </div>
          <div>
            <code className="rounded bg-muted px-1 py-0.5">planilla-only</code> — no Workera record
            for that employee and day.
          </div>
          <div>
            <code className="rounded bg-muted px-1 py-0.5">workera-only</code> — attendance with no
            planilla row.
          </div>
          <div>
            <code className="rounded bg-muted px-1 py-0.5">says-no-but-present</code> — the sheet says
            &ldquo;No&rdquo; for the Workera mark while a record exists.
          </div>
          <div>
            <code className="rounded bg-muted px-1 py-0.5">shift-mismatch</code> — the planilla block
            (day/night) differs from the Workera shift.
          </div>
          <div>
            <code className="rounded bg-muted px-1 py-0.5">multi-shift-planilla</code> — both a day
            and a night block that day, so the shift cannot be compared.
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          The planilla has no worked-hours column (only extra hours), so Workera hours are shown for
          reference but never compared. The Workera shift (day/night) is derived from the clock-in
          time via SHIFT_CONFIG.
        </p>
      </div>
    </div>
  );
}