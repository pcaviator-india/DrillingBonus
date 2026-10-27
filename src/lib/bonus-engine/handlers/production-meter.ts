import type { ProductionMeterParams, EmployeeWork, EmployeeShiftContribution, BonusComponentResult } from "@/types/bonus";
import { getDepthScale, normalizeLegacyDrillingType } from "@/lib/bonus-engine/rate-config";

/**
 * Production Meter Bonus Handler
 *
 * Calculates bonus based on meters drilled, using a rate table that varies by:
 * - Drilling type (PQ, H1-H5, NAVI, RC, DDH)
 * - Depth scale (0-500, 500-1000, etc.)
 * - Position (Driller, Helper, Supervisor, Support)
 *
 * The rate table structure:
 *   rateTable[drillingType][depthScale][position] = rate per meter
 *
 * Depth-scale keys are matched through `depthScaleAliases` (rule configuration)
 * when the source report's bands differ from the memo's tramos — see
 * resolveScaleAlias.
 *
 * Best rig selection:
 * - "employee_rig": uses meters from the rig the employee actually worked on
 * - "best_rig_month": uses the best performing rig of the month (for support staff)
 */

/** Sum shift meters per rig (fallback when monthlyRigTotals is not provided). */
function rigTotalsFromShifts(shifts: EmployeeShiftContribution[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const s of shifts) {
    totals[s.rigName] = (totals[s.rigName] ?? 0) + s.meters;
  }
  return totals;
}

/**
 * Resolve a raw depth-scale key coming from the rig interval report (e.g. the
 * 100 m drilling bands "0-100" / "100-200") to the key the rule's rateTable is
 * authored with. Rules may declare `depthScaleAliases` (configuration, never
 * hard-coded) so a memo's payment tramos can be expressed against whatever band
 * width the source report emits — e.g. Chile Chico reports 100 m bands while the
 * memo pays Tramo 1/2/3 = 0-200 / 200-400 / 400-600.
 *
 * Chains are followed with a visited guard, and keys with no alias resolve to
 * themselves, so a canonical bucket the rateTable intentionally omits simply
 * yields no rate and can never double-count an aliased band.
 */
export function resolveScaleAlias(params: ProductionMeterParams, scale: string): string {
  const aliases = params.depthScaleAliases;
  if (!aliases) return scale;
  let current = scale;
  const seen = new Set<string>([current]);
  let next = aliases[current];
  while (next && !seen.has(next)) {
    current = next;
    seen.add(current);
    next = aliases[current];
  }
  return current;
}

/** Alias-aware rate lookup for a (drillingType, depthScale, position) triple. */
function rateFor(
  params: ProductionMeterParams,
  drillingType: string | null,
  scale: string,
  position: string,
): number {
  if (!drillingType) return 0;
  // Old snapshots / tables may carry legacy internal codes (H1=HQ, H2=NQ);
  // try the normalized type first, then the raw key as a legacy fallback.
  const type = normalizeLegacyDrillingType(drillingType);
  const table = params.rateTable[type] ?? params.rateTable[drillingType];
  return table?.[resolveScaleAlias(params, scale)]?.[position] ?? 0;
}

function getRate(
  params: ProductionMeterParams,
  drillingType: string | null,
  depth: number | null | undefined,
  position: string,
): number {
  if (!drillingType) return 0;

  // Prefer an explicit depthScale string (from the rig performance intervals),
  // falling back to deriving one from a numeric drilling depth.
  const depthScale = getDepthScale(depth ?? 0);
  return rateFor(params, drillingType, depthScale, position);
}

export interface ProductionMeterResult {
  totalBonus: number;
  /** When attendanceProrate applies: raw total before pro-rating + divisor used */
  prorate?: {
    rawTotal: number;
    splitFactor?: number;
    divisorDays: number;
    divisorSource: "days_in_month" | "fixed";
    daysWorked: number;
  };
  shiftBreakdown: {
    date: string;
    shift: string;
    rigName: string;
    drillingType: string | null;
    /** Depth range (tramo) the rate was looked up on (normalized, e.g. "0-500") */
    depthScale: string | null;
    meters: number;
    rate: number;
    bonus: number;
  }[];
}

/** Resolve the divisor in days.
 * - "days_in_month" => always 30 (fixed standard month length, regardless of actual calendar days).
 * - number => the given fixed number.
 * - undefined => defaults to 30 ("fixed"). */
export function resolveDivisorDays(
  divisor: "days_in_month" | number | undefined,
  periodEnd?: string,
): { days: number; source: "days_in_month" | "fixed" } {
  if (typeof divisor === "number") return { days: divisor, source: "fixed" };
  if (divisor === "days_in_month") return { days: 30, source: "days_in_month" };
  return { days: 30, source: "fixed" };
}

export interface ProductionMeterHandlerOpts {
  periodEnd?: string;
  rigTotalsByTypeAndScale?: Record<string, Record<string, Record<string, number>>>;
  rigDailyTotalsByTypeAndScale?: Record<string, Record<string, Record<string, Record<string, number>>>>;
  /** Effective drilling type per rig (rigName -> DIAMANTINA | AIRE_REVERSO) for best-rig selection. */
  rigTypes?: Record<string, "DIAMANTINA" | "AIRE_REVERSO">;
}

export function calculateProductionMeterBonus(
  employee: EmployeeWork,
  params: ProductionMeterParams,
  monthlyRigTotals?: Record<string, number>,
  opts?: ProductionMeterHandlerOpts,
): ProductionMeterResult {
  const shiftBreakdown: ProductionMeterResult["shiftBreakdown"] = [];
  let totalBonus = 0;

  const optsWithData = opts ?? {};

  // MEJOR MÁQUINA (best_rig_month) support path — Memo MV PRIMERO §2-3.
  // Jefes/Supervisores/HSEC use Tabla 1 (Perforista rates), admin/apoyo use
  // Tabla 2 (Ayudante rates), on the rig with the BEST performance of the month
  // (Metros perforados), applied per-tramo, then prorated by days worked:
  //   TOTAL A PAGO = (bestRigRawPesos / divisorDays) * daysWorked
  if (params.bestRigSelection === "best_rig_month") {
    // Select the best rig of the month.
    // - Default (no bestRigRule / no rigTypes): top rig by total monthly meters (DDH + RC).
    // - With bestRigRule + rigTypes: top AIRE_REVERSO rig (by rig monthly total)
    //   wins when it is STRICTLY greater than arThresholdMeters; otherwise the
    //   top DIAMANTINA rig wins. Empty set falls back to the other set; ties
    //   break deterministically by rig name.
    const totals = monthlyRigTotals ?? rigTotalsFromShifts(employee.shifts);
    let bestRig = "";
    let bestRigMeters = 0;
    let bestRigType: "DIAMANTINA" | "AIRE_REVERSO" | null = null;
    if (params.bestRigRule && optsWithData.rigTypes) {
      const threshold = params.bestRigRule.arThresholdMeters;
      const rigTypes = optsWithData.rigTypes;
      const topOf = (wanted: "DIAMANTINA" | "AIRE_REVERSO") => {
        let topRig = "";
        let topMeters = 0;
        for (const [rig, meters] of Object.entries(totals)) {
          if ((rigTypes[rig] ?? "DIAMANTINA") !== wanted) continue;
          if (meters > topMeters || (meters === topMeters && (topRig === "" || rig < topRig))) {
            topMeters = meters;
            topRig = rig;
          }
        }
        return { topRig, topMeters };
      };
      const ar = topOf("AIRE_REVERSO");
      const ddh = topOf("DIAMANTINA");
      if (ar.topRig && ar.topMeters > threshold) {
        bestRig = ar.topRig;
        bestRigMeters = ar.topMeters;
        bestRigType = "AIRE_REVERSO";
      } else if (ddh.topRig) {
        bestRig = ddh.topRig;
        bestRigMeters = ddh.topMeters;
        bestRigType = "DIAMANTINA";
      } else if (ar.topRig) {
        bestRig = ar.topRig;
        bestRigMeters = ar.topMeters;
        bestRigType = "AIRE_REVERSO";
      }
    } else if (monthlyRigTotals) {
      for (const [rig, meters] of Object.entries(monthlyRigTotals)) {
        if (meters > bestRigMeters) {
          bestRigMeters = meters;
          bestRig = rig;
        }
      }
    } else {
      const rigTotals = rigTotalsFromShifts(employee.shifts);
      for (const [rig, meters] of Object.entries(rigTotals)) {
        if (meters > bestRigMeters) {
          bestRigMeters = meters;
          bestRig = rig;
        }
      }
    }

    const role = employee.shifts[0]?.role ?? employee.defaultRole ?? "";
    // rateKey lets a support rule map its employees to the correct memo table
    // (jefes/supervisores -> "Perforista"/Tabla 1, admin/apoyo -> "Ayudante"/Tabla 2).
    const rateRole = params.rateKey ?? role;
    const byScale = optsWithData.rigTotalsByTypeAndScale?.[bestRig];
    let rawTotal = 0;
    let rateUsed = 0;
    if (byScale) {
      for (const [drillingType, scales] of Object.entries(byScale)) {
        for (const [scale, meters] of Object.entries(scales)) {
          const r = rateFor(params, drillingType, scale, rateRole);
          rawTotal += meters * r;
          if (r !== 0) rateUsed = r;
        }
      }
    } else {
      const flatRateTable = params.rateTable["BEST_RIG"]?.["MONTHLY"];
      rateUsed = flatRateTable?.[rateRole] ?? 0;
      rawTotal = bestRigMeters * rateUsed;
    }

    shiftBreakdown.push({
      date: "",
      shift: "",
      rigName: bestRig,
      drillingType: "BEST_RIG",
      depthScale: null,
      meters: bestRigMeters,
      rate: rateUsed,
      bonus: rawTotal,
    });
    if (bestRigType) {
      (shiftBreakdown[0] as Record<string, unknown>).bestRigType = bestRigType;
    }

    const split = params.splitFactor && params.splitFactor > 0 ? params.splitFactor : 1;
    const splitRawTotal = rawTotal / split;

    if (params.attendanceProrate) {
      const { days, source } = resolveDivisorDays(params.attendanceProrate.divisor, opts?.periodEnd);
      totalBonus = days <= 0 ? 0 : (splitRawTotal / days) * employee.daysWorked;
      return {
        totalBonus,
        prorate: {
          rawTotal,
          splitFactor: split !== 1 ? split : undefined,
          divisorDays: days,
          divisorSource: source,
          daysWorked: employee.daysWorked,
        },
        shiftBreakdown,
      };
    }

    totalBonus = splitRawTotal;
    return { totalBonus, shiftBreakdown };
  }

  // -----------------------------------------------------------------------------
  // Bono Metro - Perforistas y Ayudantes (PRIMERO §1).
  // The base is the machine's production "durante las 24 horas de su turno" —
  // i.e. BOTH the day and night turn summed per date the employee was on site
  // (Jitu MV-1: "Total production of the rig where the driller worked during the
  // month (shifts onsite)"). Payment is for the days effectively on platform.
  //
  // We prefer the per-date machine totals (day+night) when provided; otherwise we
  // fall back to the employee's own shift contribution only.
  const roleKey = params.rateKey ?? employee.shifts[0]?.role ?? employee.defaultRole ?? "";
  if (optsWithData.rigDailyTotalsByTypeAndScale) {
    // Build the set of (rig, date) the employee worked on this rig.
    const workedDates = new Set<string>();
    for (const s of employee.shifts) {
      if (s.rigName && s.date) workedDates.add(`${s.rigName}|${s.date}`);
    }
    for (const key of workedDates) {
      const [rig, date] = key.split("|");
      const daily = optsWithData.rigDailyTotalsByTypeAndScale[rig]?.[date];
      if (!daily) continue;
      for (const [drillingType, scales] of Object.entries(daily)) {
        for (const [scale, meters] of Object.entries(scales)) {
          const rate = rateFor(params, drillingType, scale, roleKey);
          const bonus = meters * rate;
          totalBonus += bonus;
          shiftBreakdown.push({
            date,
            shift: "day+night",
            rigName: rig,
            drillingType,
            depthScale: resolveScaleAlias(params, scale),
            meters,
            rate,
            bonus,
          });
        }
      }
    }
    return { totalBonus, shiftBreakdown };
  }

  // Fallback: only the employee's own shift contribution (no day+night join).
  for (const s of employee.shifts) {
    let effectiveMeters = s.meters;

    if (params.maxMetersPerShift && effectiveMeters > params.maxMetersPerShift) {
      effectiveMeters = params.maxMetersPerShift;
    }

    const rate = getRate(params, s.drillingType, s.drillingDepth, s.role);
    const bonus = effectiveMeters * rate;
    totalBonus += bonus;

    shiftBreakdown.push({
      date: s.date,
      shift: s.shift,
      rigName: s.rigName,
      drillingType: s.drillingType,
      depthScale: getDepthScale(s.drillingDepth ?? 0),
      meters: effectiveMeters,
      rate,
      bonus,
    });
  }

  return { totalBonus, shiftBreakdown };
}
