/**
 * Tunables for the data-reconciliation (matching) pages.
 *
 * Kept here — never hard-coded inside the pages or the pure builders — so the
 * comparison thresholds stay configurable (see .clinerules rule #5).
 */
export const RECONCILIATION_CONFIG = {
  /**
   * Absolute tolerance in meters when comparing the Planilla Diaria METROS
   * against the daily drilling row (intervals report today, CorePlan API
   * later) for the same rig + date + shift.
   * 0 = both values must match exactly.
   */
  metersTolerance: 0,
  /**
   * Maximum rows a reconciliation page loads for a period. Guards the
   * whole-period queries on very large ranges; the page shows a warning when
   * the cap is reached.
   */
  maxRows: 20000,
} as const;

/** Tolerance choices offered in the drilling page UI (meters). */
export const METERS_TOLERANCE_OPTIONS = [0, 0.5, 1, 2, 5] as const;
