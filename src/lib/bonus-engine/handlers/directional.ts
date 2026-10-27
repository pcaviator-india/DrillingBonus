import type { DirectionalParams, EmployeeWork } from "@/types/bonus";
import { getDepthScale } from "@/lib/bonus-engine/rate-config";

/**
 * Directional Drilling Bonus Handler
 *
 * Calculates bonus for directional drilling work.
 * Formula: hoursSpent × hoursFactor × rate
 *
 * Used for: ATEX project
 *
 * Rate varies by drilling type and depth scale:
 *   rateTable: { "NAVI": { "0-500": 1900, "500-1000": ... } }
 */

function getRate(
  rateTable: Record<string, Record<string, number>>,
  drillingType: string | null,
  depth: number | null | undefined,
): number {
  if (!drillingType) return 0;

  const depthScale = getDepthScale(depth ?? 0);
  const typeRates = rateTable[drillingType];
  if (!typeRates) return 0;

  return typeRates[depthScale] ?? 0;
}

export interface DirectionalResult {
  totalBonus: number;
  shiftBreakdown: {
    date: string;
    shift: string;
    rigName: string;
    drillingType: string | null;
    hours: number;
    hoursFactor: number;
    rate: number;
    bonus: number;
  }[];
}

export function calculateDirectionalBonus(
  employee: EmployeeWork,
  params: DirectionalParams,
): DirectionalResult {
  const shiftBreakdown: DirectionalResult["shiftBreakdown"] = [];
  let totalBonus = 0;

  for (const s of employee.shifts) {
    if (!s.hours || s.hours <= 0) continue;

    const rate = getRate(params.rateTable, s.drillingType, s.drillingDepth);
    const bonus = s.hours * params.hoursFactor * rate;
    totalBonus += bonus;

    shiftBreakdown.push({
      date: s.date,
      shift: s.shift,
      rigName: s.rigName,
      drillingType: s.drillingType,
      hours: s.hours,
      hoursFactor: params.hoursFactor,
      rate,
      bonus,
    });
  }

  return { totalBonus, shiftBreakdown };
}
