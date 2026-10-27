import type { HighAltitudeParams, EmployeeWork } from "@/types/bonus";

/**
 * High Altitude Bonus Handler
 *
 * Two modes (configured per rule, never hard-coded per site):
 * - "prorated" (default): (monthlyAmount / daysInMonth) × daysWorked.
 *   Used everywhere unless a rule opts into "full".
 * - "full": pays the whole monthlyAmount to anyone with daysWorked >= 1,
 *   0 otherwise. Coipa override (Proyecto La Coipa, code 03).
 *
 * This bonus applies to all employees regardless of rig/position
 * (subject to the rule's positionFilter / minAttendanceDays gate).
 */

export interface HighAltitudeResult {
  totalBonus: number;
  details: {
    monthlyAmount: number;
    daysInMonth: number;
    daysWorked: number;
    dailyRate: number;
    payMode: "prorated" | "full";
  };
}

export function calculateHighAltitudeBonus(
  employee: EmployeeWork,
  params: HighAltitudeParams,
): HighAltitudeResult {
  const payMode = params.payMode ?? "prorated";
  const daysInMonth = params.daysInMonth || 30;
  const dailyRate = params.monthlyAmount / daysInMonth;
  const totalBonus =
    payMode === "full"
      ? employee.daysWorked >= 1
        ? Math.round(params.monthlyAmount)
        : 0
      : Math.round(dailyRate * employee.daysWorked);

  return {
    totalBonus,
    details: {
      monthlyAmount: params.monthlyAmount,
      daysInMonth,
      daysWorked: employee.daysWorked,
      dailyRate: Math.round(dailyRate),
      payMode,
    },
  };
}
