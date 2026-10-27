import type { MonthlyGoalParams, EmployeeWork } from "@/types/bonus";

/**
 * Monthly Goal Bonus Handler
 *
 * Pays a flat bonus when a rig exceeds monthly production goals.
 * Only the crew (Driller and Helper) on that rig receive the bonus.
 * Support staff do NOT receive this bonus.
 *
 * Per the project memos: "Cuando la máquina acumula más de X metros en el mes,
 * los Perforistas y Ayudantes que trabajaron en esa máquina durante ese mes y
 * en los turnos efectivos recibirán" — the bonus is tied to the RIG, not the
 * employee's personal production.
 *
 * Goals are configured per drilling type:
 *   goals: { "DDH": 1500, "RC": 3000 }
 *
 * Amounts are configured per position:
 *   amounts: { "Driller": 250000, "Helper": 125000 }
 */

export interface MonthlyGoalResult {
  totalBonus: number;
  goalResults: {
    drillingType: string;
    goal: number;
    actual: number;
    achieved: boolean;
    amount: number;
  }[];
  /** Rigs for which the goal was achieved and the employee qualified */
  qualifiedRigs: string[];
}

export function calculateMonthlyGoalBonus(
  employee: EmployeeWork,
  params: MonthlyGoalParams,
  roleUsed: string,
  rigTotalsByType?: Record<string, Record<string, number>>,
): MonthlyGoalResult {
  const goalResults: MonthlyGoalResult["goalResults"] = [];
  let totalBonus = 0;
  const qualifiedRigs: string[] = [];

  // Determine which rigs the employee actually worked on
  const employeeRigs = new Set<string>();
  for (const s of employee.shifts) {
    if (s.rigName) employeeRigs.add(s.rigName);
  }

  for (const [drillingType, goal] of Object.entries(params.goals)) {
    let achieved = false;
    let actual = 0;
    let qualifyingRig: string | null = null;

    if (rigTotalsByType) {
      // Per-rig evaluation: find a rig the employee worked on that exceeded the goal
      for (const rig of employeeRigs) {
        const rigTypeTotals = rigTotalsByType[rig];
        if (!rigTypeTotals) continue;
        const rigMeters = rigTypeTotals[drillingType] ?? 0;
        if (rigMeters > goal) {
          achieved = true;
          actual = rigMeters;
          qualifyingRig = rig;
          break; // one qualifying rig is enough
        }
      }
    } else {
      // Fallback: use the employee's own production (legacy behaviour)
      const metersByDrillingType = new Map<string, number>();
      for (const s of employee.shifts) {
        if (s.drillingType) {
          metersByDrillingType.set(s.drillingType, (metersByDrillingType.get(s.drillingType) ?? 0) + s.meters);
        }
      }
      actual = metersByDrillingType.get(drillingType) ?? 0;
      achieved = actual > goal;
    }

    let amount = 0;
    if (achieved) {
      const positionAmount = params.amounts[roleUsed] ?? 0;
      amount = positionAmount;
      totalBonus += amount;
      if (qualifyingRig) qualifiedRigs.push(qualifyingRig);
    }

    goalResults.push({
      drillingType,
      goal,
      actual,
      achieved,
      amount,
    });
  }

  return { totalBonus, goalResults, qualifiedRigs };
}
