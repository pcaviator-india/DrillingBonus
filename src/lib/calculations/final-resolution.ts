/**
 * Final Resolution Logic for drilling bonus adjustments
 * 
 * Pure functions only — no DB or API calls.
 * Takes a comparison row + user selection, returns resolved values.
 * 
 * Priority:
 *   P → Use Planilla days/bonus as final
 *   W → Use Workera days/bonus as final
 *   blank + Perforista/Ayudante Perforista with days → Flag "needs_meters"
 *   blank + any other role → Auto-recalculate from days using best-rig prorate
 *   blank + Perforista/Ayudante Perforista with 0 days → Auto-recalculate (best-rig like everyone else)
 */

import type { ComparisonExportRow } from '@/lib/export/comparison-export';

// Cargo exclusion list: roles that need actual meters verification
// (Perforista and Ayudante Perforista/Ayudante de Perforista when they have actual days worked)
const PERFORISTA_ROLES = /Perforista/;

/**
 * Resolve the final days/bonus for a comparison row based on user selection
 */
export interface ResolveResult {
  finalDays: number;
  finalBonus: number;
  finalSource: 'workera' | 'planilla' | 'auto';
  finalResolution: 'used_planilla' | 'used_workera' | 'autocalc_best_rig' | 'needs_meters' | 'manual_override';
}

/**
 * Determine if a cargo role requires actual meters verification
 * Returns true if: Perforista/Ayudante Perforista role WITH actual days worked (>0)
 */
function requiresMeters(cargo: string, daysWorked: number): boolean {
  if (!PERFORISTA_ROLES.test(cargo)) return false;
  // Perforista roles with 0 days are paid via best-rig like everyone else
  // Only flag "needs_meters" when they have actual days worked
  return daysWorked > 0;
}

/**
 * Calculate the best-rig prorated bonus from a Planilla calculation line
 * Uses the existing Planilla prorated bonus (already computed from rig performance data)
 */
function calculateBestRigBonus(row: ComparisonExportRow, planillaBonus: number, daysInMonth: number = 30): number {
  // The Planilla bonus is already best-rig prorated for the month
  // We need to prorate it based on days worked vs days in period
  const planillaDays = row.planillaDays || 0;
  const workeraDays = row.workeraDays || 0;
  
  if (daysInMonth <= 0 || planillaDays <= 0) return planillaBonus;
  
  // Prorate: (bonus ÷ planillaDays) × daysWorked
  // Use the greater of planillaDays or workeraDays as the base
  const daysWorked = Math.max(planillaDays, workeraDays);
  const prorated = (planillaBonus / planillaDays) * daysWorked;
  
  return prorated;
}

/**
 * Resolve final values for a comparison row
 * 
 * @param row - Comparison row from CalculationComparison
 * @param selection - 'P' (Planilla), 'W' (Workera), or 'blank' (auto)
 * @param cargo - Employee's job position name (for role detection)
 * @param planillaBonus - Planilla bonus por pagar (for auto-recalc base)
 * 
 * @returns ResolveResult with final days, bonus, source, and resolution type
 */
export function resolveFinalRow(
  row: ComparisonExportRow,
  selection: 'P' | 'W' | 'blank',
  cargo: string,
  planillaBonus: number
): ResolveResult {
  // --- Selection P: Use Planilla days/bonus as final ---
  if (selection === 'P') {
    return {
      finalDays: row.planillaDays || 0,
      finalBonus: planillaBonus,
      finalSource: 'planilla',
      finalResolution: 'used_planilla',
    };
  }

  // --- Selection W: Use Workera days/bonus as final ---
  if (selection === 'W') {
    return {
      finalDays: row.workeraDays || 0,
      finalBonus: row.workeraBonus || 0,
      finalSource: 'workera',
      finalResolution: 'used_workera',
    };
  }

  // --- Selection blank: Auto-resolve ---
  const daysWorked = Math.max((row.planillaDays || 0), (row.workeraDays || 0));
  const needsMeters = requiresMeters(cargo, daysWorked);

  if (needsMeters) {
    // Perforista/Ayudante Perforista with actual days → Flag needs_meters
    // Use Planilla days as placeholder; will need actual meters entered later
    return {
      finalDays: row.planillaDays || row.workeraDays || 0,
      finalBonus: row.planillaBonus || row.workeraBonus || 0,
      finalSource: 'auto',
      finalResolution: 'needs_meters',
    };
  }

  // Auto-recalculate from days using best-rig prorate
  // Reuse the existing Planilla calculation's prorated bonus
  const bestRigBonus = calculateBestRigBonus(row, planillaBonus);
  
  // Use the days source that has the higher count (or planilla if equal)
  const daysSource = (row.planillaDays || 0) >= (row.workeraDays || 0) ? 'planilla' : 'workera';
  const finalDays = row.planillaDays || row.workeraDays || 0;

  return {
    finalDays,
    finalBonus: bestRigBonus,
    finalSource: 'auto',
    finalResolution: 'autocalc_best_rig',
  };
}

/**
 * Apply Chile Chico site correction multiplier
 * Multiplies the final bonus by a config factor (default 2)
 * Only applies to "Chile Chico" site to correct an accidental divide-by-2
 * that was meant for Dos Amigos only.
 */
export function applyChileChicoCorrection(
  bonus: number,
  siteName: string,
  multiplier: number = 2
): number {
  if (siteName !== 'Chile Chico') return bonus;
  return bonus * multiplier;
}

/**
 * Format the resolution result for display/export
 */
export interface ResolutionDisplay {
  finalDays: number;
  finalBonus: number;
  finalSource: string;
  finalResolution: string;
  adjustmentNote?: string;
  chileLocoApplied: boolean;
}

export function formatResolutionDisplay(
  result: ResolveResult,
  note?: string,
  siteName?: string,
  chileLocoMultiplier: number = 2
): ResolutionDisplay {
  const chileLocoApplied = siteName === 'Chile Chico' && chileLocoMultiplier !== 1 && result.finalResolution !== 'needs_meters';
  let adjustedBonus = result.finalBonus;
  
  if (chileLocoApplied) {
    adjustedBonus = applyChileChicoCorrection(result.finalBonus, siteName || '', chileLocoMultiplier);
  }

  return {
    finalDays: result.finalDays,
    finalBonus: adjustedBonus,
    finalSource: result.finalSource,
    finalResolution: result.finalResolution,
    adjustmentNote: note,
    chileLocoApplied,
  };
}