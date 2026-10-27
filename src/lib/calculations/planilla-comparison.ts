export type PlanillaComparisonRow = {
  employeeId: string;
  siteId: string | null;
  periodStart: string;
  periodEnd: string;
  workeraDays: number;
  planillaDays: number;
  workeraBonus: number;
  planillaBonus: number;
  difference: number;
  flags: string[];
};

export type PlanillaComparisonInput = {
  employeeId: string;
  siteId: string | null;
  periodStart: string;
  periodEnd: string;
  workeraDays: number;
  planillaDays: number;
  workeraBonus: number;
  planillaBonus: number;
  flags?: string[];
};

/** Pure comparison: Workera remains the official amount, Planilla is review-only. */
export function buildPlanillaComparison(
  input: PlanillaComparisonInput,
): PlanillaComparisonRow {
  const difference = input.planillaBonus - input.workeraBonus;
  const flags = new Set(input.flags ?? []);
  if (input.workeraDays !== input.planillaDays) flags.add("attendance-days-differ");
  if (input.siteId === null) flags.add("unresolved-site");
  if (difference !== 0) flags.add("bonus-difference");
  return {
    employeeId: input.employeeId,
    siteId: input.siteId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    workeraDays: input.workeraDays,
    planillaDays: input.planillaDays,
    workeraBonus: input.workeraBonus,
    planillaBonus: input.planillaBonus,
    difference,
    flags: [...flags],
  };
}

/** Pure allocation of one global best-rig amount by Planilla worked days. */
export function prorateBestRigBySite(
  bestRigAmount: number,
  daysBySite: ReadonlyMap<string, number>,
): Map<string, number> {
  const totalDays = [...daysBySite.values()].reduce((sum, days) => sum + Math.max(0, days), 0);
  if (totalDays === 0) return new Map();
  return new Map(
    [...daysBySite.entries()].map(([siteId, days]) => [
      siteId,
      bestRigAmount * (Math.max(0, days) / totalDays),
    ]),
  );
}
