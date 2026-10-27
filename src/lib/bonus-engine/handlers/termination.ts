import type { TerminationParams, EmployeeWork } from "@/types/bonus";

/**
 * Termination Adjustment Handler
 *
 * Encodes the "Condiciones de Pago de los Bonos en Caso de Término de Relación
 * Laboral" rules from every project memo. This is NOT a bonus in its own
 * right — it is a gate that can zero-out or reduce other bonuses for the
 * month in which the employment relationship ends.
 *
 * Rules (all from the memos):
 *   1. Renuncia voluntaria sin aviso previo (no 30-day notice) → 0%
 *   2. Renuncia voluntaria con aviso de 30 días → 100% (no adjustment)
 *   3. Término por Necesidades de la Empresa (Art. 161) → 0% (unless company overrides)
 *   4. Vencimiento de contrato sin renovación → 100% (no adjustment)
 *   5. Desvinculación por causales del Art. 160 → 0% regardless of period worked
 *
 * Additionally, all memos state bonuses are conditional on proper witness
 * orientation ("orientaciones de testigo") and immediate notification of
 * defective equipment. Failure = loss of bonus.
 *
 * The multiplier returned here is applied to ALL other bonus components
 * calculated for the employee in the same period.
 */

export interface TerminationResult {
  multiplier: number;
  reason: string;
  witnessOrientationOk: boolean;
  equipmentNotificationOk: boolean;
  /** Human-readable explanation of the decision */
  explanation: string;
}

/**
 * Resolve the effective multiplier for an employee.
 *
 * @param params The termination rule parameters.
 * @param witnessFailOverride If true, the witness orientation requirement
 *   overrides everything else and forces multiplier = 0 regardless of
 *   termination reason. This is used when witness orientation is not
 *   recorded / not correct.
 */
export function resolveTerminationMultiplier(
  params: TerminationParams,
  witnessFailOverride: boolean,
): number {
  // Witness orientation gate — applies to ALL bonus types per the memos.
  // "Todos los bonos antes mencionados se encuentran sujetos a que las
  //  orientaciones de testigo se lleven a cabo correctamente."
  if (witnessFailOverride || params.witnessOrientationOk === false) {
    return 0;
  }

  // Equipment notification gate — "en caso de no notificar a tiempo/ de
  // inmediato la existencia de una herramienta defectuosa" → loss of bonus.
  if (params.equipmentNotificationOk === false) {
    return 0;
  }

  return params.terminationMultiplier;
}

export function calculateTerminationAdjustment(
  employee: EmployeeWork,
  params: TerminationParams,
): TerminationResult {
  // Default: assume witness orientation and equipment notification are OK
  // unless explicitly set to false. The engine can override these per-employee.
  const witnessOk = params.witnessOrientationOk ?? true;
  const equipmentOk = params.equipmentNotificationOk ?? true;

  let explanation: string;
  if (!witnessOk) {
    explanation = "Witness orientation not completed correctly — bonus forfeited per memo.";
  } else if (!equipmentOk) {
    explanation = "Defective equipment not notified in time — bonus forfeited per memo.";
  } else if (params.terminationMultiplier === 0) {
    explanation = `Termination (${params.reason}) — bonus forfeited for this month.`;
  } else if (params.terminationMultiplier === 1) {
    explanation = `Termination (${params.reason}) — full bonus applies per memo.`;
  } else {
    explanation = `Termination (${params.reason}) — bonus adjusted to ${(params.terminationMultiplier * 100).toFixed(0)}%.`;
  }

  return {
    multiplier: params.terminationMultiplier,
    reason: params.reason,
    witnessOrientationOk: witnessOk,
    equipmentNotificationOk: equipmentOk,
    explanation,
  };
}