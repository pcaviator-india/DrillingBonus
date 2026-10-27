import { toCsv } from "@/lib/csv";

export type ComparisonExportRow = {
  createdAt: Date;
  project: string;
  planillaProject: string;
  siteMismatch: boolean;
  employee: string;
  /** Employee cargo / position (e.g. Supervisor, Driller, Driver). */
  cargo: string;
  workeraDays: number;
  planillaDays: number;
  workeraBonus: number;
  planillaBonus: number;
  difference: number;
  reviewStatus: string;
  reviewNote: string | null;
  workeraCalculationId: string;
  planillaCalculationId: string | null;
  // Add period dates for filtering and export
  periodStart: Date;
  periodEnd: Date;
  // Final resolution fields (populated after user adjustment)
  finalSource: string | null;
  finalDays: number | null;
  finalBonus: number | null;
  finalResolution: string | null;
  adjustmentNote: string | null;
  adjustedById: string | null;
  adjustedAt: Date | null;
};

export function buildComparisonCsv(rows: ComparisonExportRow[]): string {
  return toCsv(
    ["Created", "Workera project", "Planilla project", "Site mismatch", "Employee", "Cargo", "Workera days", "Planilla days", "Workera bonus", "Planilla bonus", "Difference", "Review status", "Review note", "Workera calculation ID", "Planilla calculation ID", "Period Start", "Period End"],
    rows.map((r) => [r.createdAt.toISOString(), r.project, r.planillaProject, r.siteMismatch ? "Yes" : "No", r.employee, r.cargo, r.workeraDays, r.planillaDays, r.workeraBonus, r.planillaBonus, r.difference, r.reviewStatus, r.reviewNote ?? "", r.workeraCalculationId, r.planillaCalculationId ?? "", r.periodStart.toISOString(), r.periodEnd.toISOString()]),
  );
}
