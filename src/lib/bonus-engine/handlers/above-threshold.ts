import type { AboveThresholdParams, EmployeeWork } from "@/types/bonus";
import { getDepthScale } from "@/lib/bonus-engine/rate-config";

/**
 * Above Threshold Bonus Handler
 *
 * Calculates bonus for meters exceeding a daily threshold per shift.
 * Used for: Diamantina (>22m/shift), Aire Reverso (>50m/shift)
 *
 * The bonus is: (metersAboveThreshold) × baseRate × multiplier
 * where multiplier is typically 1.5 (50% bonus on top of base rate)
 *
 * Thresholds are configured per drilling type:
 *   thresholds: { "DDH": 22, "RC": 50 }
 */

function getRate(
  baseRateTable: Record<string, Record<string, Record<string, number>>>,
  drillingType: string | null,
  depth: number | null | undefined,
  position: string,
): number {
  if (!drillingType) return 0;

  const depthScale = getDepthScale(depth ?? 0);
  const typeRates = baseRateTable[drillingType];
  if (!typeRates) return 0;

  const scaleRates = typeRates[depthScale];
  if (!scaleRates) return 0;

  return scaleRates[position] ?? 0;
}

export interface AboveThresholdResult {
  totalBonus: number;
  shiftBreakdown: {
    date: string;
    shift: string;
    rigName: string;
    drillingType: string | null;
    /** Depth range (tramo) the base rate was looked up on (normalized, e.g. "0-500") */
    depthScale: string | null;
    meters: number;
    threshold: number;
    metersAbove: number;
    baseRate: number;
    multiplier: number;
    bonus: number;
  }[];
}

export function calculateAboveThresholdBonus(
  employee: EmployeeWork,
  params: AboveThresholdParams,
): AboveThresholdResult {
  const shiftBreakdown: AboveThresholdResult["shiftBreakdown"] = [];
  let totalBonus = 0;

  for (const s of employee.shifts) {
    const threshold = s.drillingType ? (params.thresholds[s.drillingType] ?? 0) : 0;
    if (threshold === 0) continue;

    const metersAbove = Math.max(0, s.meters - threshold);
    if (metersAbove <= 0) continue;

    const baseRate = getRate(params.baseRateTable, s.drillingType, s.drillingDepth, s.role);
    // incrementOnly pays only the (multiplier - 1) increment (July BONO EXTRA
    // already pays the base in PERFOR./AYUD.); otherwise pay the full multiplier.
    const effMultiplier = params.incrementOnly ? Math.max(0, params.multiplier - 1) : params.multiplier;
    const bonus = metersAbove * baseRate * effMultiplier;
    totalBonus += bonus;

    shiftBreakdown.push({
      date: s.date,
      shift: s.shift,
      rigName: s.rigName,
      drillingType: s.drillingType,
      depthScale: getDepthScale(s.drillingDepth ?? 0),
      meters: s.meters,
      threshold,
      metersAbove,
      baseRate,
      multiplier: effMultiplier,
      bonus,
    });
  }

  return { totalBonus, shiftBreakdown };
}
