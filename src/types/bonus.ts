/**
 * Normalized internal models for the bonus engine.
 * The engine only ever sees these types – never DB rows or raw API payloads.
 */

export type ShiftRole = string; // Supervisor, Driller, Driver, Helper, ... (extensible)

export interface CalculationPeriod {
  start: string; // yyyy-MM-dd
  end: string; // yyyy-MM-dd
}

export interface EmployeeShiftContribution {
  date: string; // yyyy-MM-dd
  shift: "day" | "night" | string;
  rigName: string;
  role: ShiftRole;
  meters: number;
  hours: number | null;
  drillingLevel: string | null;
  /** Drilling type for this shift (PQ, H1, H2, ..., NAVI, RC, DDH) */
  drillingType: string | null;
  /** Actual drilling depth in meters for this shift (used for depth-scale rate lookups) */
  drillingDepth?: number | null;
  /** Depth scale string from the rig performance intervals (e.g. "0-500", "500-1000") */
  depthScale?: string | null;
  /** A/B crew turn (14-day rotation) for this shift, if known */
  turn?: "A" | "B" | null;
}

export interface EmployeeWork {
  employeeId: string;
  fullName: string;
  /** Attendance days counted (present / late), within the period */
  daysWorked: number;
  /** Attendance hours worked within the period */
  attendanceHours: number;
  /** Rig shift contributions joined from crew assignments + rig performance */
  shifts: EmployeeShiftContribution[];
  /** Job position / role (from defaultRole). Used as fallback for support/no-shift
   * staff so MEJOR MÁQUINA (best_rig) rules still apply. */
  defaultRole?: string | null;
  /** Optional Planilla allocation by actual site, for multi-site audits. */
  siteDaysWorked?: Record<string, number>;
  /** Employee/date/site conflicts found while normalizing Planilla. */
  siteConflicts?: Array<{ date: string; siteIds: string[] }>;
  /**
   * All tokens that should match a rule's positionFilter for this employee:
   * raw shift roles, their normalized forms, resolved main-position names and
   * bonus group keys (from the PositionAlias registry). Rule matching is done
   * against roleUsed + these tokens, case-insensitively.
   */
  roleTokens?: string[];
}

// ======================
// BONUS TYPE DEFINITIONS
// ======================

/**
 * Production Meter Bonus - Per-meter rate based on drilling type, depth scale, and position.
 * This is the primary bonus type used across all sites.
 *
 * Parameters:
 * - rateTable: Record<drillingType, Record<depthScale, Record<position, rate>>>
 *   e.g. { "H1": { "0-500": { "Driller": 750, "Helper": 500 }, "500-1000": { ... } } }
 * - bestRigSelection: "employee_rig" | "best_rig_month"
 *   - "employee_rig": use the meters from the rig the employee worked on
 *   - "best_rig_month": use the best performing rig of the month (for support staff)
 * - maxMetersPerShift: optional cap on meters counted per shift (e.g. 22 for DDH)
 * - attendanceProrate: optional pro-rating for support staff (NO OP / SUP-PREV sheets).
 *   "days_in_month" is a fixed standard of 30 days (regardless of actual calendar
 *   length). Formula: (bestRigTotalPesos / divisorDays) * daysWorked
 * - depthScaleAliases: optional config map from the depth-scale key the source
 *   report produces to the key the rateTable is authored with. Sources do not
 *   always use the memo's tramo width — Chile Chico's interval report drills in
 *   100 m bands ("0-100", "100-200", ...) while its memo pays Tramo 1/2/3 =
 *   0-200 / 200-400 / 400-600. Keys with no alias resolve to themselves, so a
 *   rateTable may safely omit (and never double-count) the canonical buckets.
 */
export interface ProductionMeterParams {
  rateTable: Record<string, Record<string, Record<string, number>>>;
  bestRigSelection: "employee_rig" | "employee_rig_month" | "best_rig_month";
  maxMetersPerShift?: number;
  /** Raw report band -> rateTable key (e.g. { "0-100": "0-200", "100-200": "0-200" }) */
  depthScaleAliases?: Record<string, string>;
  attendanceProrate?: {
    /** "days_in_month" = calendar days derived from period end (e.g. July => 31) */
    divisor: "days_in_month" | number;
  };
  /** For best_rig_month (MEJOR MÁQUINA): key used to look up the rate table row.
   * Memo MV PRIMERO §2-3: jefes/supervisores/HSEC use Tabla 1 (rateKey="Perforista"),
   * admin/apoyo use Tabla 2 (rateKey="Ayudante"). Defaults to the employee's role. */
  rateKey?: string;
  /**
   * Shift split factor (default 1).
   * When set (e.g. 2 in Chile Chico / Dos Amigos September 2026 memos:
   * "producción del turno día y noche dividida en dos"), the best rig's raw total
   * bonus is divided by this factor before prorating by attendance:
   * ((rawTotal / splitFactor) / divisorDays) * daysWorked
   */
  splitFactor?: number;
  /**
   * MEJOR MÁQUINA selection rule (configurable — never hard-coded):
   * when set and bestRigSelection is "best_rig_month", the best rig is the top
   * AIRE_REVERSO rig (by rig monthly total) when it exceeds arThresholdMeters,
   * otherwise the top DIAMANTINA rig. Rig classification comes from the
   * rigTypes map on BonusEngineInput (effective type per site).
   */
  bestRigRule?: {
    /** Minimum monthly meters an AR rig must exceed to win (e.g. 2500). Strictly-greater. */
    arThresholdMeters: number;
  };
}

/**
 * Above Threshold Bonus - 1.5x bonus for meters exceeding daily threshold.
 * Used for: Diamantina (>22m/shift), Aire Reverso (>50m/shift)
 *
 * Memo MV SEGUNDO: "a partir del metro 23 se pagará el valor del metro
 * multiplicado por 1.5, por cada metro que supere el tramo mínimo" —
 * evaluated PER machine, separating day/night turno, on effective shifts.
 *
 * July sheet reality: PERFOR./AYUD. already pay the BASE for all meters,
 * and BONO EXTRA stores only the +50% increment (headers: 750x0.5=375,
 * 900x0.5=450, 500x0.5=250, 700x0.5=350, RC 300x0.5=150/200x0.5=100).
 * So when combined with production_meter, set incrementOnly=true to pay
 * only (multiplier - 1) and avoid double-paying the base.
 *
 * Parameters:
 * - thresholds: Record<drillingType, thresholdMeters>
 *   e.g. { "DDH": 22, "RC": 50 }
 * - multiplier: number (e.g. 1.5 for 50% bonus)
 * - baseRateTable: same structure as ProductionMeterParams.rateTable
 * - incrementOnly: when true, pays metersAbove * baseRate * (multiplier - 1)
 */
export interface AboveThresholdParams {
  thresholds: Record<string, number>;
  multiplier: number;
  baseRateTable: Record<string, Record<string, Record<string, number>>>;
  incrementOnly?: boolean;
}

/**
 * Monthly Goal Bonus - Flat amount when monthly production goal is exceeded.
 * Used for: Fenix (1500m DDH / 3000m RC), MV (1000m DDH / 2500m RC)
 *
 * Parameters:
 * - goals: Record<drillingType, goalMeters>
 *   e.g. { "DDH": 1500, "RC": 3000 }
 * - amounts: Record<position, amount>
 *   e.g. { "Driller": 250000, "Helper": 125000 }
 */
export interface MonthlyGoalParams {
  goals: Record<string, number>;
  amounts: Record<string, number>;
}

/**
 * High Altitude Bonus - Flat monthly bonus, optionally pro-rated by days onsite.
 * Used for: Coipa ($250,000/month)
 *
 * Parameters:
 * - monthlyAmount: number (e.g. 250000)
 * - daysInMonth: number (default 30, for pro-rating)
 * - payMode: "prorated" (default) | "full" — "full" pays the whole
 *   monthlyAmount to anyone with daysWorked >= 1 (Coipa override).
 */
export interface HighAltitudeParams {
  monthlyAmount: number;
  daysInMonth: number;
  payMode?: "prorated" | "full";
}

/**
 * End of Season Bonus - Base salary multiplier pro-rated by contract days.
 * Used for: Fenix (1 salary), ATEX (3 salaries)
 *
 * Parameters:
 * - salaryMultiplier: number (e.g. 1 for 1 salary, 3 for 3 salaries)
 * - totalDays: number (total days in the season)
 * - baseSalary: number (employee's base salary)
 */
export interface EndOfSeasonParams {
  salaryMultiplier: number;
  totalDays: number;
  baseSalary: number;
  /**
   * Optional 50/50 evaluation (Fenix): the season bonus is gated on
   *   - Attendance (weight 50%)
   *   - Operational Excellence & Safety (weight 50%)
   * Each concept at 100% = full; partial = proportional reduction.
   * If either is below 100%, the bonus is reduced in direct proportion.
   */
  excellenceWeight?: number; // default 0.5
  attendanceWeight?: number; // default 0.5
}

/** Per-employee proof that feeds the 50/50 seasonal evaluation. */
export interface SeasonEvaluationInput {
  employeeId: string;
  /** Attendance score 0..1 (100% = all days present, no unjustified absences) */
  attendanceScore?: number;
  /** Operational excellence & safety score 0..1 */
  excellenceScore?: number;
}

/**
 * Directional Drilling Bonus - Hours × factor × rate by depth/diameter.
 * Used for: ATEX
 *
 * Parameters:
 * - rateTable: Record<drillingType, Record<depthScale, rate>>
 * - hoursFactor: number (e.g. 22/10.5 = 2.1)
 */
export interface DirectionalParams {
  rateTable: Record<string, Record<string, number>>;
  hoursFactor: number;
}

/**
 * Termination Adjustment Bonus
 *
 * Encodes the "Condiciones de Pago de los Bonos en Caso de Término de Relación Laboral"
 * rules from every project memo. This is NOT a bonus in its own right — it is a
 * gate that can zero-out or reduce other bonuses for the month in which the
 * employment relationship ends.
 *
 * Rules (all from the memos):
 *   1. Renuncia voluntaria sin aviso previo (no 30-day notice) → 0% of other bonuses
 *   2. Renuncia voluntaria con aviso de 30 días → 100% (no adjustment)
 *   3. Término por Necesidades de la Empresa (Art. 161) → 0% (unless company overrides)
 *   4. Vencimiento de contrato sin renovación → 100% (no adjustment)
 *   5. Desvinculación por causales del Art. 160 → 0% regardless of period worked
 *
 * Additionally, all memos state bonuses are conditional on proper witness
 * orientation ("orientaciones de testigo") and immediate notification of
 * defective equipment. Failure = loss of bonus.
 */
export interface TerminationParams {
  /** Multiplier applied to other bonuses in the termination month. 0 = forfeit, 1 = full. */
  terminationMultiplier: number;
  /** Human-readable reason code for audit */
  reason: string;
  /** Whether witness orientation was completed correctly */
  witnessOrientationOk?: boolean;
  /** Whether defective equipment was notified in time */
  equipmentNotificationOk?: boolean;
}

/**
 * Union type for all bonus type parameters
 */
export type BonusTypeParams =
  | ProductionMeterParams
  | AboveThresholdParams
  | MonthlyGoalParams
  | HighAltitudeParams
  | EndOfSeasonParams
  | DirectionalParams
  | TerminationParams;

// ======================
// ENGINE INPUT/OUTPUT
// ======================

export interface BonusRuleConfig {
  ruleId: string;
  bonusTypeCode: string;
  positionFilter: string[];
  /**
   * Role tokens that DISQUALIFY the employee from this rule (exclusion filter).
   * Matched with the same token set as positionFilter (raw role, normalized,
   * main position, bonus group key), case-insensitive. Empty = no exclusion.
   */
  positionExclude?: string[];
  drillingTypeFilter: string[];
  priority: number;
  parameters: BonusTypeParams;
  minAttendanceDays: number | null;
}

export interface BonusEngineInput {
  period: CalculationPeriod;
  employees: EmployeeWork[];
  rules: BonusRuleConfig[];
  /** Monthly rig totals for best-rig calculations: rigName -> totalMeters */
  monthlyRigTotals?: Record<string, number>;
  /**
   * Effective drilling type per rig for best-rig selection: rigName -> "DIAMANTINA" | "AIRE_REVERSO".
   * Resolved from Rig.rigType + SiteRig.effectiveType (see lib/rigs/effective-type.ts).
   * When a rig has no entry here, the engine falls back to today's max-meters behavior.
   */
  rigTypes?: Record<string, "DIAMANTINA" | "AIRE_REVERSO">;
  /**
   * Monthly rig totals broken down by drilling type: rigName -> { drillingType -> totalMeters }
   * Used for per-rig monthly goal evaluation (the memo says the bonus is paid
   * when "the machine" exceeds the goal, to the crew of that machine).
   */
  rigTotalsByType?: Record<string, Record<string, number>>;
  /** Monthly rig totals by drilling TYPE + DEPTH SCALE: rigName -> { drillingType -> { depthScale -> meters } }
   * Used for THE BEST RIG of the month (MEJOR MÁQUINA) so per-tramo rates of
   * Tabla 1 (Perforistas) / Tabla 2 (Ayudantes) are applied to the best rig's
   * meters, per Memo MV PRIMERO §2-3. */
  rigTotalsByTypeAndScale?: Record<string, Record<string, Record<string, number>>>;
  /** PER-DAY rig totals by drilling TYPE + DEPTH SCALE:
   * rigName -> { date -> { drillingType -> { depthScale -> meters } } }
   * Used for the Bono Metro of Perforistas/Ayudantes (PRIMERO §1): the base is
   * the machine's production "durante las 24 horas de su turno" — i.e. BOTH the
   * day and night turn summed per date the employee was on site. Defaults to the
   * employee's own shift contribution when not provided. */
  rigDailyTotalsByTypeAndScale?: Record<string, Record<string, Record<string, Record<string, number>>>>;
  /** Employee base salaries for end-of-season calculations */
  employeeBaseSalaries?: Record<string, number>;
  /** Per-employee attendance/excellence scores for the seasonal 50/50 evaluation */
  seasonEvaluations?: SeasonEvaluationInput[];
  /**
   * Per-employee termination state for the month in which the employment
   * relationship ends. Drives the termination_adjustment gate (see memo
   * "Condiciones de Pago de los Bonos en Caso de Término de Relación Laboral").
   * When an employee has no entry here, no termination adjustment applies.
   */
  employeeTerminations?: Record<string, TerminationParams>;
}

export interface BonusComponentResult {
  bonusTypeCode: string;
  bonusTypeName: string;
  amount: number;
  details: Record<string, unknown>;
}

export interface BonusLineResult {
  employeeId: string;
  fullName: string;
  roleUsed: string;
  daysWorked: number;
  totalMeters: number;
  totalHours: number;
  calculatedBonus: number;
  components: BonusComponentResult[];
  breakdown: BonusBreakdown;
}

export interface BonusBreakdown {
  skipped?: string;
  shifts: {
    date: string;
    shift: string;
    rigName: string;
    role: string;
    meters: number;
    drillingType: string | null;
    drillingLevel: string | null;
    /** Depth range (tramo) the rate was looked up on, when known (e.g. "0-500") */
    depthScale?: string | null;
    turn?: "A" | "B" | null;
    componentBreakdown: BonusComponentResult[];
  }[];
  monthlyGoalResults?: {
    drillingType: string;
    goal: number;
    actual: number;
    achieved: boolean;
    amount: number;
  }[];
  attendanceGate: string | null;
}

export interface BonusEngineResult {
  lines: BonusLineResult[];
  totalBonus: number;
}
