import { toCsv } from "@/lib/csv";
import type {
  AttendanceMatchRow,
  DrillingMatchRow,
  RigRollup,
} from "@/lib/reconciliation/types";

/**
 * CSV builders for the two reconciliation ("matching") pages.
 * Pure functions over already-loaded match rows – no DB access here.
 * Mirrors the columns shown in the on-screen detail tables so what you see
 * is what you export.
 */

function boolCell(value: boolean | null): string {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "";
}

function num(value: number | null, digits = 1): string | number {
  if (value === null || value === undefined) return "";
  return Number(value.toFixed(digits));
}

/** Detail CSV for the attendance matching page (one row per employee/day). */
export function buildAttendanceReconciliationCsv(rows: AttendanceMatchRow[]): string {
  const headers = [
    "Date",
    "Employee",
    "RUT",
    "Site",
    "Department",
    "Planilla shift",
    "Turno",
    "Machine",
    "Planilla marked in",
    "Planilla marked out",
    "Planilla rows",
    "Planilla metros",
    "Planilla extra hours",
    "Workera status",
    "Workera shift",
    "Time in",
    "Time out",
    "Hours",
    "Corrected",
    "Verdict",
    "Flags",
  ];
  const data = rows.map((r) => [
    r.date,
    r.employeeName,
    r.rut ?? "",
    r.siteName ?? "",
    r.department ?? "",
    r.planillaShift ?? "",
    r.turnoAB ?? "",
    r.machine ?? "",
    boolCell(r.planillaMarkedIn),
    boolCell(r.planillaMarkedOut),
    r.planillaRows,
    r.planillaMetros ?? "",
    r.planillaHorasExtras ?? "",
    r.workeraStatus ?? "",
    r.workeraShift ?? "",
    r.timeIn ?? "",
    r.timeOut ?? "",
    r.hoursWorked ?? "",
    r.corrected ? "yes" : "no",
    r.verdict,
    r.flags.join(" | "),
  ]);
  return toCsv(headers, data);
}

/** Detail CSV for the drilling matching page (one row per rig/day/shift). */
export function buildDrillingReconciliationCsv(rows: DrillingMatchRow[]): string {
  const headers = [
    "Date",
    "Shift",
    "Rig",
    "Site",
    "Planilla rows",
    "Planilla meters (max)",
    "Planilla meters (min)",
    "Planilla distinct values",
    "Planilla machines",
    "Planilla diameters",
    "Planilla escalas",
    "Source meters",
    "Source hours",
    "Source hole",
    "Source drilling level",
    "Source",
    "Source intervals",
    "Source diameters",
    "Source escalas",
    "Delta m",
    "Delta %",
    "Verdict",
    "Flags",
  ];
  const data = rows.map((r) => [
    r.date,
    r.shift,
    r.rigName ?? r.planillaMachines.join(", "),
    r.siteName ?? "",
    r.planillaRows,
    r.planillaMeters ?? "",
    r.planillaMinMeters ?? "",
    r.planillaDistinctValues,
    r.planillaMachines.join(" | "),
    r.planillaDiameters.join(" | "),
    r.planillaEscalas.join(" | "),
    r.sourceMeters ?? "",
    r.sourceHours ?? "",
    r.sourceHole ?? "",
    r.sourceDrillingLevel ?? "",
    r.sourceLabel ?? "",
    r.sourceIntervals,
    r.sourceDiameters.join(" | "),
    r.sourceEscalas.join(" | "),
    r.delta ?? "",
    r.deltaPct ?? "",
    r.verdict,
    r.flags.join(" | "),
  ]);
  return toCsv(headers, data);
}

/** Per-rig roll-up CSV for the drilling page (period totals per rig). */
export function buildDrillingRigRollupCsv(rows: RigRollup[]): string {
  const headers = [
    "Rig",
    "Site",
    "Keys",
    "Matched",
    "Value diff",
    "Planilla only",
    "Drilling only",
    "Planilla m",
    "Drilling m",
    "Delta m",
  ];
  const data = rows.map((r) => [
    r.rigName,
    r.siteName ?? "",
    r.keys,
    r.matched,
    r.valueDiff,
    r.planillaOnly,
    r.sourceOnly,
    num(r.planillaMeters),
    num(r.sourceMeters),
    num(r.delta),
  ]);
  return toCsv(headers, data);
}
