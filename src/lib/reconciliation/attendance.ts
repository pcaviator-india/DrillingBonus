import type {
  AttendanceBuildInput,
  AttendanceInputRow,
  AttendanceMatchFlag,
  AttendanceMatchRow,
  AttendanceMatchSummary,
  AttendanceMatchVerdict,
  EmployeeRef,
  PlanillaAttendanceRow,
} from "./types";

export type AttendanceReconciliationResult = {
  rows: AttendanceMatchRow[];
  summary: AttendanceMatchSummary;
};

function maxOrNull(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return nums.length ? Math.max(...nums) : null;
}

function emptySummary(): AttendanceMatchSummary {
  return {
    planillaRows: 0,
    employeeDays: 0,
    matched: 0,
    workeraAbsent: 0,
    planillaOnly: 0,
    planillaOnlyClaimsMark: 0,
    workeraOnly: 0,
    saysNoButPresent: 0,
    shiftMismatch: 0,
    multiShift: 0,
    unmatchedRut: 0,
    noSite: 0,
  };
}

type Group = {
  key: string;
  employeeId: string | null;
  rutNormalized: string;
  date: string;
  rows: PlanillaAttendanceRow[];
};

/**
 * PURE. Reconciles Workera attendance against the Planilla Diaria.
 *
 * Grain: one row per (employee, day) plus one row per Workera-only day.
 * Workera keeps a single attendance row per employee per day
 * (AttendanceRecord is unique on employeeId+date) while the planilla can hold
 * a DAY and a NIGHT block for the same person on the same day. The planilla
 * side is therefore collapsed per day, and the shift is only compared when
 * that day has a single block (a two-block day is flagged instead).
 *
 * The planilla's own "workera entrada / salida" columns are compared with the
 * real attendance row — that is where the valuable conflicts show up (the
 * sheet claims a Workera mark that Workera has no record of, or the sheet says
 * "No" while an attendance record exists).
 */
export function buildAttendanceReconciliation(
  input: AttendanceBuildInput,
): AttendanceReconciliationResult {
  const { planilla, attendance, employees, siteNames } = input;

  // 1) Group the planilla rows by employee+day.
  const groups = new Map<string, Group>();
  for (const row of planilla) {
    const idPart = row.employeeId ?? `rut:${row.rutNormalized}`;
    const key = `${idPart}|${row.date}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        employeeId: row.employeeId,
        rutNormalized: row.rutNormalized,
        date: row.date,
        rows: [],
      };
      groups.set(key, group);
    }
    group.rows.push(row);
  }

  // 2) Index the attendance rows; consumed keys stop being "workera-only".
  const attendanceByKey = new Map<string, AttendanceInputRow>();
  for (const row of attendance) {
    attendanceByKey.set(`${row.employeeId}|${row.date}`, row);
  }

  const rows: AttendanceMatchRow[] = [];
  const summary = emptySummary();

  for (const group of groups.values()) {
    const employeeId = group.employeeId;
    const attKey = employeeId ? `${employeeId}|${group.date}` : null;
    const att = attKey ? attendanceByKey.get(attKey) ?? null : null;
    if (attKey && att) attendanceByKey.delete(attKey);

    const employee: EmployeeRef | null = employeeId ? employees.get(employeeId) ?? null : null;
    const shifts = new Set(group.rows.map((r) => r.shiftDayNight));
    const anyMarkedIn = group.rows.some((r) => r.workeraMarkedIn === true);
    const anySaysNo = group.rows.some((r) => r.workeraMarkedIn === false);
    const noMarkColumns = group.rows.every(
      (r) => r.workeraMarkedIn === null && r.workeraMarkedOut === null,
    );
    const planillaShift =
      shifts.size > 1 ? "day+night" : shifts.size === 1 ? [...shifts][0] : null;
    const siteId = group.rows.find((r) => r.siteId)?.siteId ?? null;
    const turnoAB =
      group.rows.find((r) => r.turnoAB === "A")?.turnoAB ??
      group.rows.find((r) => r.turnoAB === "B")?.turnoAB ??
      null;

    const flags: AttendanceMatchFlag[] = [];
    if (!employeeId) flags.push("unmatched-rut");
    if (!siteId) flags.push("no-site");
    if (noMarkColumns) flags.push("no-workera-columns");
    if (anyMarkedIn && !att) flags.push("claims-mark-no-record");
    if (att && att.status !== "absent" && (!att.hoursWorked || att.hoursWorked <= 0)) {
      flags.push("present-but-zero-hours");
    }

    let verdict: AttendanceMatchVerdict;
    if (!att) {
      verdict = "planilla-only";
    } else if (att.status === "absent") {
      verdict = "workera-absent";
    } else if (anySaysNo) {
      verdict = "says-no-but-present";
    } else if (shifts.size > 1) {
      verdict = "multi-shift-planilla";
    } else if (att.shift && planillaShift && att.shift !== planillaShift) {
      verdict = "shift-mismatch";
    } else {
      verdict = "matched";
    }

    const markedOut = group.rows.some((r) => r.workeraMarkedOut === true)
      ? true
      : group.rows.some((r) => r.workeraMarkedOut === false)
        ? false
        : null;

    rows.push({
      key: group.key,
      date: group.date,
      employeeId,
      employeeName: employee?.fullName ?? group.rows[0]?.fullName ?? "(unknown)",
      rut: employee?.rut ?? group.rows[0]?.rut ?? null,
      siteId,
      siteName: siteId ? siteNames.get(siteId) ?? null : null,
      department: employee?.departmentName ?? null,
      planillaShift,
      turnoAB,
      machine: group.rows.find((r) => r.machine)?.machine ?? null,
      planillaMarkedIn: anyMarkedIn ? true : anySaysNo ? false : null,
      planillaMarkedOut: markedOut,
      planillaRows: group.rows.length,
      planillaMetros: maxOrNull(group.rows.map((r) => r.metros)),
      planillaHorasExtras: maxOrNull(group.rows.map((r) => r.horasExtras)),
      workeraStatus: att?.status ?? null,
      workeraShift: att?.shift ?? null,
      timeIn: att?.timeIn ?? null,
      timeOut: att?.timeOut ?? null,
      hoursWorked: att?.hoursWorked ?? null,
      corrected: att?.corrected ?? false,
      verdict,
      flags,
    });

    summary.planillaRows += group.rows.length;
    summary.employeeDays += 1;
    if (verdict === "matched") summary.matched += 1;
    if (verdict === "workera-absent") summary.workeraAbsent += 1;
    if (verdict === "planilla-only") {
      summary.planillaOnly += 1;
      if (anyMarkedIn) summary.planillaOnlyClaimsMark += 1;
    }
    if (verdict === "says-no-but-present") summary.saysNoButPresent += 1;
    if (verdict === "shift-mismatch") summary.shiftMismatch += 1;
    if (verdict === "multi-shift-planilla") summary.multiShift += 1;
    if (!employeeId) summary.unmatchedRut += 1;
    if (!siteId) summary.noSite += 1;
  }

  // 3) Workera days that never appear in the planilla.
  for (const leftover of attendanceByKey.values()) {
    const employee = employees.get(leftover.employeeId) ?? null;
    const siteId = employee?.siteId ?? null;
    rows.push({
      key: `${leftover.employeeId}|${leftover.date}`,
      date: leftover.date,
      employeeId: leftover.employeeId,
      employeeName: employee?.fullName ?? leftover.employeeId,
      rut: employee?.rut ?? null,
      siteId,
      siteName: siteId ? siteNames.get(siteId) ?? null : null,
      department: employee?.departmentName ?? null,
      planillaShift: null,
      turnoAB: null,
      machine: null,
      planillaMarkedIn: null,
      planillaMarkedOut: null,
      planillaRows: 0,
      planillaMetros: null,
      planillaHorasExtras: null,
      workeraStatus: leftover.status,
      workeraShift: leftover.shift,
      timeIn: leftover.timeIn,
      timeOut: leftover.timeOut,
      hoursWorked: leftover.hoursWorked,
      corrected: leftover.corrected,
      verdict: "workera-only",
      flags: [],
    });
    summary.workeraOnly += 1;
  }

  rows.sort((a, b) =>
    a.date === b.date ? a.employeeName.localeCompare(b.employeeName) : a.date < b.date ? 1 : -1,
  );
  return { rows, summary };
}
