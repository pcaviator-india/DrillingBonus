import { formatDateUtc } from "@/lib/datetime";
import { toCsv, csvCell } from "@/lib/csv";

/**
 * Shared CSV builders for calculation exports.
 * Pure functions over already-loaded DB rows – no DB access here.
 */

export type ExportLine = {
  id: string;
  employeeName: string;
  employeeRut: string | null;
  roleUsed: string;
  daysWorked: number;
  totalMeters: number;
  totalHours: number | null;
  calculatedBonus: number;
  breakdown: { components?: unknown; shifts?: unknown } | null;
};

export type ExportCalculation = {
  id: string;
  siteName: string;
  ruleSetName: string;
  ruleSetVersion: number;
  periodStart: Date;
  periodEnd: Date;
  status: string;
  totalBonus: number;
  createdAt: Date;
};

type ShiftDetail = {
  date?: string;
  shift?: string;
  rigName?: string;
  role?: string;
  meters?: number;
  drillingType?: string | null;
  drillingLevel?: string | null;
  turn?: "A" | "B" | null;
  componentBreakdown?: unknown;
};

/** Summary CSV for a list of calculations (one row per calculation). */
export function buildCalculationsSummariesCsv(calcs: ExportCalculation[]): string {
  const headers = [
    "Calculation ID",
    "Site",
    "Rule set",
    "Rule version",
    "Period start",
    "Period end",
    "Status",
    "Total bonus",
    "Created",
  ];
  const rows = calcs.map((c) => [
    c.id,
    c.siteName,
    c.ruleSetName,
    c.ruleSetVersion,
    formatDateUtc(c.periodStart),
    formatDateUtc(c.periodEnd),
    c.status,
    c.totalBonus,
    formatDateUtc(c.createdAt),
  ]);
  return toCsv(headers, rows);
}

/** Per-calculation lines CSV. With `details=true`, expands each shift into its own row. */
export function buildCalculationLinesCsv(
  calc: ExportCalculation,
  lines: ExportLine[],
  details: boolean,
): string {
  const headerCells = (extra: string[]) => [
    "Employee",
    "RUT",
    "Role",
    "Days",
    "Meters",
    "Hours",
    "Bonus",
    ...extra,
  ];

  const headerLine = (extra: string[]) =>
    headerCells(extra).map((h) => csvCell(h)).join(",");

  const calcMeta = [
    `Calculation,${csv(calc.id)}`,
    `Site,${csv(calc.siteName)}`,
    `Rule set,${csv(`${calc.ruleSetName} (v${calc.ruleSetVersion})`)}`,
    `Period,${csv(`${formatDateUtc(calc.periodStart)} → ${formatDateUtc(calc.periodEnd)}`)}`,
    `Total bonus,${csv(calc.totalBonus)}`,
    "",
  ].join("\n");

  if (!details) {
    const rows = lines.map((l) => [
      csvCell(l.employeeName),
      csvCell(l.employeeRut ?? ""),
      csvCell(l.roleUsed),
      csvCell(l.daysWorked),
      csvCell(l.totalMeters),
      csvCell(l.totalHours ?? ""),
      csvCell(l.calculatedBonus),
    ]);
    return `${calcMeta}\n${headerLine([])}\n${rows.join("\n")}`;
  }

  const headers = [
    "Employee",
    "RUT",
    "Role",
    "Days",
    "Meters",
    "Hours",
    "Bonus",
    "Shift date",
    "Shift",
    "Turn",
    "Rig",
    "Drilling type",
    "Drilling level",
    "Shift meters",
    "Components",
  ].map((h) => csvCell(h));
  const headerStr = headers.join(",");
  const rows: string[] = [];
  for (const l of lines) {
    const shifts = (l.breakdown?.shifts ?? []) as ShiftDetail[];
    const base = [
      csvCell(l.employeeName),
      csvCell(l.employeeRut ?? ""),
      csvCell(l.roleUsed),
      csvCell(l.daysWorked),
      csvCell(l.totalMeters),
      csvCell(l.totalHours ?? ""),
      csvCell(l.calculatedBonus),
    ];
    if (shifts.length === 0) {
      rows.push([...base, "", "", "", "", "", "", "", ""].join(","));
      continue;
    }
    for (const s of shifts) {
      rows.push(
        [
          ...base,
          csvCell(s.date ?? ""),
          csvCell(s.shift ?? ""),
          csvCell(s.turn ?? ""),
          csvCell(s.rigName ?? ""),
          csvCell(s.drillingType ?? ""),
          csvCell(s.drillingLevel ?? ""),
          csvCell(s.meters ?? 0),
          csvCell(componentsText(s.componentBreakdown)),
        ].join(","),
      );
    }
  }
  return `${calcMeta}\n${headerStr}\n${rows.join("\n")}`;
}

function componentsText(components: unknown): string {
  if (!Array.isArray(components)) return "";
  return components
    .map((c) => {
      const o = c as { bonusTypeName?: string; amount?: number };
      const name = o.bonusTypeName ?? "bonus";
      const amount = typeof o.amount === "number" ? o.amount.toFixed(2) : "";
      return amount ? `${name}: ${amount}` : name;
    })
    .join(" | ");
}

function csv(value: unknown): string {
  return csvCell(value);
}