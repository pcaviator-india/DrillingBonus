/**
 * Shared types for the two data-reconciliation ("matching") pages.
 *
 *  - Attendance : Workera attendance  vs  Planilla Diaria attendance
 *  - Drilling   : daily drilling row  vs  Planilla Diaria METROS
 *
 * The drilling side is deliberately provider-agnostic: today the daily
 * drilling row comes from the Excel intervals report (a CorePlan export) and
 * later it will come from the CorePlan API. The comparison never changes — only
 * the `source` label carried on each row.
 */

// ======================
// ATTENDANCE (Workera vs Planilla Diaria)
// ======================

export type AttendanceMatchVerdict =
  | "matched"
  | "workera-absent"
  | "planilla-only"
  | "workera-only"
  | "says-no-but-present"
  | "shift-mismatch"
  | "multi-shift-planilla";

export type AttendanceMatchFlag =
  | "unmatched-rut"
  | "no-site"
  | "no-workera-columns"
  | "claims-mark-no-record"
  | "present-but-zero-hours";

/** One Planilla Diaria row, with the employee/site already resolved. */
export type PlanillaAttendanceRow = {
  id: string;
  date: string; // yyyy-MM-dd
  rut: string;
  rutNormalized: string;
  fullName: string;
  projectName: string | null;
  shiftDayNight: "day" | "night";
  turnoAB: "A" | "B" | null;
  machine: string | null;
  metros: number | null;
  horasExtras: number | null;
  workeraMarkedIn: boolean | null;
  workeraMarkedOut: boolean | null;
  /** Resolved from rutNormalized; null = no Employee matches this RUT. */
  employeeId: string | null;
  /** Resolved from SiteAlias(proyecto) ?? ExcelUpload.siteId. */
  siteId: string | null;
};

/** One Workera attendance row (times already formatted for display). */
export type AttendanceInputRow = {
  employeeId: string;
  date: string; // yyyy-MM-dd
  status: string;
  shift: string | null;
  hoursWorked: number | null;
  timeIn: string | null; // HH:mm Chile
  timeOut: string | null; // HH:mm Chile
  corrected: boolean;
};

export type EmployeeRef = {
  id: string;
  fullName: string;
  rut: string | null;
  siteId: string | null;
  departmentName: string | null;
};

export type AttendanceBuildInput = {
  planilla: PlanillaAttendanceRow[];
  attendance: AttendanceInputRow[];
  /** employeeId -> employee details (display + site). */
  employees: Map<string, EmployeeRef>;
  /** siteId -> site name. */
  siteNames: Map<string, string>;
};

export type AttendanceMatchRow = {
  key: string;
  date: string;
  employeeId: string | null;
  employeeName: string;
  rut: string | null;
  siteId: string | null;
  siteName: string | null;
  department: string | null;
  /** "day" | "night" | "day+night" when the planilla has both blocks. */
  planillaShift: string | null;
  turnoAB: string | null;
  machine: string | null;
  planillaMarkedIn: boolean | null;
  planillaMarkedOut: boolean | null;
  planillaRows: number;
  planillaMetros: number | null; // max across the crew rows
  planillaHorasExtras: number | null;
  workeraStatus: string | null;
  workeraShift: string | null;
  timeIn: string | null;
  timeOut: string | null;
  hoursWorked: number | null;
  corrected: boolean;
  verdict: AttendanceMatchVerdict;
  flags: AttendanceMatchFlag[];
};

export type AttendanceMatchSummary = {
  planillaRows: number;
  employeeDays: number;
  matched: number;
  workeraAbsent: number;
  planillaOnly: number;
  planillaOnlyClaimsMark: number;
  workeraOnly: number;
  saysNoButPresent: number;
  shiftMismatch: number;
  multiShift: number;
  unmatchedRut: number;
  noSite: number;
};

// ======================
// DRILLING (daily drilling vs Planilla Diaria METROS)
// ======================

export type DrillingMatchVerdict =
  | "matched"
  | "value-diff"
  | "values-disagree"
  | "no-planilla-meters"
  | "planilla-only"
  | "source-only";

export type DrillingMatchFlag =
  | "unmapped-machine"
  | "no-machine"
  | "rig-no-site"
  | "planilla-values-disagree"
  | "matched-from-excel";

/** One Planilla Diaria row that carries a machine + meters, rig-resolved. */
export type PlanillaRigRow = {
  date: string; // yyyy-MM-dd
  shiftDayNight: "day" | "night";
  machine: string | null;
  /** Resolved through RigAlias/Rig name; null = unmapped machine. */
  rigId: string | null;
  metros: number | null;
  diameter: string | null;
  escala: string | null;
};

/** A drilling interval band carried by a performance row. */
export type DrillingInterval = {
  band: string;
  escala: string | null;
  diameter: string | null;
  meters: number;
};

/**
 * A normalized daily drilling row — anything that ends up in
 * RigShiftPerformance, whatever provider produced it.
 */
export type RigPerformanceRow = {
  rigId: string;
  date: string; // yyyy-MM-dd
  shift: string; // "day" | "night"
  metersDrilled: number;
  hoursSpent: number | null;
  hole: string | null;
  drillingLevel: string | null;
  intervals: DrillingInterval[] | null;
  source: string; // "excel" | "coreplan"
};

export type RigRef = {
  id: string;
  name: string;
  code: string | null;
  siteId: string | null;
};

export type DrillingBuildInput = {
  planilla: PlanillaRigRow[];
  performance: RigPerformanceRow[];
  rigs: Map<string, RigRef>;
  siteNames: Map<string, string>;
  /** Absolute meters tolerance (from RECONCILIATION_CONFIG by default). */
  tolerance: number;
};

export type DrillingMatchRow = {
  key: string; // rigId|date|shift  (machine:<key>|date|shift when unmapped)
  date: string;
  shift: string;
  rigId: string | null;
  rigName: string | null;
  siteId: string | null;
  siteName: string | null;
  planillaRows: number;
  planillaMeters: number | null; // max across the crew rows
  planillaMinMeters: number | null;
  planillaDistinctValues: number;
  planillaMachines: string[];
  planillaDiameters: string[];
  planillaEscalas: string[];
  sourceMeters: number | null;
  sourceHours: number | null;
  sourceHole: string | null;
  sourceDrillingLevel: string | null;
  sourceLabel: string | null;
  sourceIntervals: number;
  sourceDiameters: string[];
  sourceEscalas: string[];
  delta: number | null;
  deltaPct: number | null;
  verdict: DrillingMatchVerdict;
  flags: DrillingMatchFlag[];
};

export type UnmappedMachine = {
  machine: string;
  keys: number; // rig/day/shift combinations
  planillaRows: number;
  meters: number;
};

/** Planilla rows with a blank MAQUINA: structurally not comparable. */
export type NoMachineSummary = {
  keys: number; // date/shift combinations
  planillaRows: number;
  meters: number;
  samples: string[]; // "yyyy-MM-dd day" examples
};

export type RigRollup = {
  rigId: string;
  rigName: string;
  siteName: string | null;
  keys: number;
  matched: number;
  valueDiff: number;
  planillaOnly: number;
  sourceOnly: number;
  planillaMeters: number;
  sourceMeters: number;
  delta: number;
};

export type DrillingMatchSummary = {
  keys: number;
  matched: number;
  valueDiff: number;
  valuesDisagree: number;
  noPlanillaMeters: number;
  planillaOnly: number;
  sourceOnly: number;
  planillaMeters: number;
  sourceMeters: number;
  deltaMeters: number;
  unmappedMachines: UnmappedMachine[];
  noMachine: NoMachineSummary;
  bySource: Record<string, number>;
  byRig: RigRollup[];
};
