import type { EndOfSeasonParams, EmployeeWork, SeasonEvaluationInput } from "@/types/bonus";

/**
 * End of Season Bonus Handler
 *
 * Pays a multiple of base salary, pro-rated by contract days.
 * Used for: Fenix (1 salary), ATEX (3 salaries)
 *
 * Formula: (baseSalary × salaryMultiplier / totalDays) × daysWorked
 *
 * Fenix "Clausula Condiciones 1": the season bonus is gated on two concepts,
 * each worth 50%:
 *   1. Asistencia (attendance) — 50%
 *   2. Excelencia Operacional y Seguridad — 50%
 * If both are at 100%, the full bonus is paid. If either is below 100%, the
 * bonus is reduced in direct proportion to the shortfall:
 *   finalBonus = baseBonus × (attendanceScore×weight + excellenceScore×weight)
 *
 * This bonus applies to all employees based on their days worked.
 */

export interface EndOfSeasonResult {
  totalBonus: number;
  details: {
    baseSalary: number;
    salaryMultiplier: number;
    totalDays: number;
    dailyRate: number;
    daysWorked: number;
    baseBonus: number;
    attendanceScore?: number;
    excellenceScore?: number;
    excellenceWeight?: number;
    attendanceWeight?: number;
    evaluationFactor?: number;
    evaluated?: boolean;
  };
}

export function calculateEndOfSeasonBonus(
  employee: EmployeeWork,
  params: EndOfSeasonParams,
  evaluation?: SeasonEvaluationInput,
): EndOfSeasonResult {
  const dailyRate = (params.baseSalary * params.salaryMultiplier) / params.totalDays;
  const baseBonus = dailyRate * employee.daysWorked;

  const attendanceWeight = params.attendanceWeight ?? 0.5;
  const excellenceWeight = params.excellenceWeight ?? 0.5;

  // Only apply the 50/50 evaluation when we actually have the scores AND the
  // rule configures the weights (Fenix). For ATEX / other sites or missing
  // data, fall back to the un-gated pro-rated amount.
  const hasScores =
    evaluation !== undefined &&
    (evaluation.attendanceScore !== undefined || evaluation.excellenceScore !== undefined);

  if (!hasScores) {
    return {
      totalBonus: Math.round(baseBonus),
      details: {
        baseSalary: params.baseSalary,
        salaryMultiplier: params.salaryMultiplier,
        totalDays: params.totalDays,
        dailyRate: Math.round(dailyRate),
        daysWorked: employee.daysWorked,
        baseBonus: Math.round(baseBonus),
        evaluated: false,
      },
    };
  }

  const attendanceScore = evaluation?.attendanceScore ?? 1;
  const excellenceScore = evaluation?.excellenceScore ?? 1;
  const evaluationFactor = attendanceScore * attendanceWeight + excellenceScore * excellenceWeight;
  const totalBonus = Math.round(baseBonus * evaluationFactor);

  return {
    totalBonus,
    details: {
      baseSalary: params.baseSalary,
      salaryMultiplier: params.salaryMultiplier,
      totalDays: params.totalDays,
      dailyRate: Math.round(dailyRate),
      daysWorked: employee.daysWorked,
      baseBonus: Math.round(baseBonus),
      attendanceScore,
      excellenceScore,
      excellenceWeight,
      attendanceWeight,
      evaluationFactor: Math.round(evaluationFactor * 100) / 100,
      evaluated: true,
    },
  };
}
