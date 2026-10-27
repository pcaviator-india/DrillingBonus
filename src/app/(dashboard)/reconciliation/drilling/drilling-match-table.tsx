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
import type { DrillingMatchRow, DrillingMatchVerdict } from "@/lib/reconciliation/types";

const VERDICT_LABELS: Record<DrillingMatchVerdict, string> = {
  matched: "Matched",
  "value-diff": "Value diff",
  "values-disagree": "Values disagree",
  "no-planilla-meters": "No planilla meters",
  "planilla-only": "Planilla only",
  "source-only": "Drilling only",
};

const VERDICT_CLASS: Record<DrillingMatchVerdict, string> = {
  matched: "bg-green-100 text-green-800",
  "value-diff": "bg-red-100 text-red-800",
  "values-disagree": "bg-amber-100 text-amber-800",
  "no-planilla-meters": "bg-muted text-muted-foreground",
  "planilla-only": "bg-amber-100 text-amber-800",
  "source-only": "bg-blue-100 text-blue-800",
};

const FLAG_LABELS: Record<string, string> = {
  "unmapped-machine": "Machine not mapped to a rig",
  "no-machine": "Blank MAQUINA — structurally not comparable",
  "rig-no-site": "Rig has no site",
  "planilla-values-disagree": "Crew rows disagree on METROS",
  "matched-from-excel": "Matched against the intervals file (CorePlan API not connected yet)",
};

const VERDICTS: DrillingMatchVerdict[] = [
  "matched",
  "value-diff",
  "values-disagree",
  "planilla-only",
  "source-only",
  "no-planilla-meters",
];

function fmt(value: number | null, digits = 1): string {
  return value === null || value === undefined ? "—" : value.toFixed(digits);
}

function joinOrDash(values: string[]): string {
  return values.length ? values.join(", ") : "—";
}

const selectClass = "rounded border px-2 py-1";

export function DrillingMatchTable({ rows }: { rows: DrillingMatchRow[] }) {
  const [search, setSearch] = useState("");
  const [verdict, setVerdict] = useState<"all" | DrillingMatchVerdict>("all");
  const [shift, setShift] = useState<"all" | "day" | "night">("all");
  const [source, setSource] = useState("all");
  const [onlyProblems, setOnlyProblems] = useState(false);

  const sourceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.sourceLabel) set.add(r.sourceLabel);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (verdict !== "all" && r.verdict !== verdict) return false;
      if (onlyProblems && r.verdict === "matched") return false;
      if (shift !== "all" && r.shift !== shift) return false;
      if (source !== "all" && (r.sourceLabel ?? "") !== source) return false;
      if (q) {
        const haystack = [
          r.rigName,
          r.siteName,
          ...r.planillaMachines,
          r.sourceHole,
          ...r.planillaDiameters,
          ...r.sourceDiameters,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, verdict, shift, source, onlyProblems]);

  const hasActiveFilters =
    search.trim() !== "" ||
    verdict !== "all" ||
    shift !== "all" ||
    source !== "all" ||
    onlyProblems;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded border p-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Search (rig / machine / hole)</span>
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
            onChange={(e) => setVerdict(e.target.value as "all" | DrillingMatchVerdict)}
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
            onChange={(e) => setShift(e.target.value as "all" | "day" | "night")}
          >
            <option value="all">All</option>
            <option value="day">Day</option>
            <option value="night">Night</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Drilling source</span>
          <select
            className={selectClass}
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="all">All</option>
            {sourceOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
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
              setSource("all");
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
        <Table className="min-w-[1400px]">
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Shift</TableHead>
              <TableHead>Rig</TableHead>
              <TableHead>Site</TableHead>
              <TableHead className="text-right">Planilla m</TableHead>
              <TableHead className="text-right">Crew rows</TableHead>
              <TableHead className="text-right">Drilling m</TableHead>
              <TableHead className="text-right">Δ m</TableHead>
              <TableHead className="text-right">Δ %</TableHead>
              <TableHead>Planilla dia / escala</TableHead>
              <TableHead>Drilling hole / dia</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Verdict</TableHead>
              <TableHead>Flags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={14} className="text-center text-muted-foreground">
                  No planilla rig rows or daily drilling rows found for this period yet.
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={14} className="text-center text-muted-foreground">
                  No records match these filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="whitespace-nowrap">{r.date}</TableCell>
                  <TableCell>{r.shift}</TableCell>
                  <TableCell className="font-medium">
                    {r.rigName ?? (r.planillaMachines.length ? joinOrDash(r.planillaMachines) : "(no machine listed)")}
                  </TableCell>
                  <TableCell>{r.siteName ?? "—"}</TableCell>
                  <TableCell className="text-right">{fmt(r.planillaMeters)}</TableCell>
                  <TableCell className="text-right">
                    {r.planillaRows === 0 ? "—" : r.planillaRows}
                    {r.planillaDistinctValues > 1 ? (
                      <span
                        className="ml-1 text-amber-600"
                        title={`Crew rows wrote ${r.planillaDistinctValues} different METROS values (min ${fmt(r.planillaMinMeters)}, max ${fmt(r.planillaMeters)})`}
                      >
                        ⚠
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">{fmt(r.sourceMeters)}</TableCell>
                  <TableCell
                    className={`text-right ${r.delta !== null && r.delta !== 0 ? "font-medium text-amber-600" : ""}`}
                  >
                    {fmt(r.delta)}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.deltaPct === null ? "—" : `${r.deltaPct.toFixed(1)} %`}
                  </TableCell>
                  <TableCell className="text-xs">
                    {[joinOrDash(r.planillaDiameters), joinOrDash(r.planillaEscalas)]
                      .filter((v) => v !== "—")
                      .join(" · ") || "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {[r.sourceHole ?? "—", joinOrDash(r.sourceDiameters)]
                      .filter((v) => v !== "—")
                      .join(" · ") || "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{r.sourceLabel ?? "—"}</TableCell>
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
            <code className="rounded bg-muted px-1 py-0.5">matched</code> — both sides present and the
            meters agree within the tolerance.
          </div>
          <div>
            <code className="rounded bg-muted px-1 py-0.5">value-diff</code> — both sides present but
            the meters differ by more than the tolerance.
          </div>
          <div>
            <code className="rounded bg-muted px-1 py-0.5">values-disagree</code> — the crew rows of
            one rig/day/shift wrote different METROS values.
          </div>
          <div>
            <code className="rounded bg-muted px-1 py-0.5">planilla-only</code> — planilla meters with
            no daily drilling row (or an unmapped machine).
          </div>
          <div>
            <code className="rounded bg-muted px-1 py-0.5">source-only</code> — daily drilling row with
            no planilla row for that rig/day/shift.
          </div>
          <div>
            <code className="rounded bg-muted px-1 py-0.5">no-planilla-meters</code> — the planilla rows
            for that key have no METROS value to compare.
          </div>
        </div>
      </div>
    </div>
  );
}