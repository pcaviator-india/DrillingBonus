"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Component = {
  bonusTypeName?: string;
  amount?: number;
  details?: Record<string, unknown>;
};

type Breakdown = {
  skipped?: string;
  shifts?: {
    date: string;
    shift: string;
    rigName: string;
    role: string;
    meters: number;
    drillingType: string | null;
    drillingLevel: string | null;
    turn?: "A" | "B" | null;
    componentBreakdown?: unknown;
  }[];
  attendanceGate?: string | null;
};

export type LineRow = {
  id: string;
  employeeName: string;
  roleUsed: string;
  daysWorked: number;
  totalMeters: number;
  totalHours: number | null;
  basePercentage: number;
  calculatedBonus: number;
  breakdown: Breakdown | null;
};

export function CalculationLinesClient({ lines }: { lines: LineRow[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Days</TableHead>
            <TableHead>Meters</TableHead>
            <TableHead>Hours</TableHead>
            <TableHead>Base %</TableHead>
            <TableHead>Bonus</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => (
            <FragmentRow
              key={line.id}
              line={line}
              isOpen={open.has(line.id)}
              onToggle={() => toggle(line.id)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
function FragmentRow({
  line,
  isOpen,
  onToggle,
}: {
  line: LineRow;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <TableRow>
        <TableCell className="font-medium">
          <button
            type="button"
            onClick={onToggle}
            className="underline-offset-4 hover:underline"
            aria-expanded={isOpen}
          >
            {line.employeeName}
            {line.breakdown?.attendanceGate ? <span> *</span> : null}
          </button>
        </TableCell>
        <TableCell>{line.roleUsed || "—"}</TableCell>
        <TableCell>{line.daysWorked}</TableCell>
        <TableCell>{line.totalMeters}</TableCell>
        <TableCell>{line.totalHours ?? "—"}</TableCell>
        <TableCell>{line.basePercentage}</TableCell>
        <TableCell className="font-semibold">{line.calculatedBonus}</TableCell>
        <TableCell className="max-w-72 text-xs text-muted-foreground">
          {line.breakdown?.skipped ??
            `${line.breakdown?.shifts?.length ?? 0} shift(s) calculated`}
        </TableCell>
        <TableCell>
          <Button type="button" variant="ghost" size="sm" onClick={onToggle}>
            {isOpen ? "Hide" : "Details"}
          </Button>
        </TableCell>
      </TableRow>
      {isOpen ? (
        <TableRow>
          <TableCell colSpan={9} className="bg-muted/30">
            <DetailPanel line={line} />
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

function DetailPanel({ line }: { line: LineRow }) {
  const b = line.breakdown;
  if (!b) {
    return <p className="text-sm text-muted-foreground">No breakdown stored for this line.</p>;
  }
  return (
    <div className="space-y-3 py-1 text-sm">
      {b.attendanceGate ? (
        <p className="text-xs text-amber-700">
          Attendance gate: {b.attendanceGate} — this employee may have been excluded from some
          bonuses.
        </p>
      ) : null}

      {b.shifts && b.shifts.length > 0 ? (
        <div className="overflow-x-auto rounded border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="px-3 py-1.5">Date</th>
                <th className="px-3 py-1.5">Shift</th>
<th className="px-3 py-1.5">Turn</th>
<th className="px-3 py-1.5">Rig</th>
                <th className="px-3 py-1.5">Role</th>
                <th className="px-3 py-1.5">Meters</th>
                <th className="px-3 py-1.5">Type</th>
                <th className="px-3 py-1.5">Level</th>
                <th className="px-3 py-1.5">Components</th>
              </tr>
            </thead>
            <tbody>
              {b.shifts.map((s, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-3 py-1.5">{s.date}</td>
<td className="px-3 py-1.5">{s.shift}</td>
<td className="px-3 py-1.5">
  {s.turn ? (
    <span className="inline-flex items-center rounded-full border px-1.5 py-px text-[10px] font-semibold">
      {s.turn}
    </span>
  ) : (
    "—"
  )}
</td>
<td className="px-3 py-1.5">{s.rigName}</td>
                  <td className="px-3 py-1.5">{s.role}</td>
                  <td className="px-3 py-1.5">{s.meters}</td>
                  <td className="px-3 py-1.5">{s.drillingType ?? "—"}</td>
                  <td className="px-3 py-1.5">{s.drillingLevel ?? "—"}</td>
                  <td className="px-3 py-1.5">
                    {componentsText(s.componentBreakdown) || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {b.skipped ?? "No shifts in this line."}
        </p>
      )}
    </div>
  );
}

function componentsText(components: unknown): string {
  if (!Array.isArray(components)) return "";
  return components
    .map((c) => {
      const o = c as Component;
      return `${o.bonusTypeName ?? "bonus"}: ${o.amount ?? 0}`;
    })
    .join(" · ");
}