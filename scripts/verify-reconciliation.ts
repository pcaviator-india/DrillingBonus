/**
 * Verification of the pure reconciliation builders (no DB, no server):
 *   - attendance: Workera attendance vs Planilla Diaria
 *   - drilling:   daily drilling rows vs Planilla Diaria METROS
 *
 * Usage: npx tsx scripts/verify-reconciliation.ts [--db] [from] [to]
 *   --db  additionally load a real period through lib/reconciliation/load and
 *         print the KPI summary (cross-check the numbers against
 *         scripts/verify-planilla-sources.ts for the same range).
 */
import "dotenv/config";
import { buildAttendanceReconciliation } from "../src/lib/reconciliation/attendance";
import { buildDrillingReconciliation } from "../src/lib/reconciliation/drilling";
import type {
  AttendanceInputRow,
  EmployeeRef,
  PlanillaAttendanceRow,
  RigPerformanceRow,
  RigRef,
} from "../src/lib/reconciliation/types";

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// ======================
// ATTENDANCE
// ======================

const employees = new Map<string, EmployeeRef>([
  ["e1", { id: "e1", fullName: "Ana Perez", rut: "11111111-1", siteId: "s1", departmentName: "Perforacion" }],
  ["e2", { id: "e2", fullName: "Beto Diaz", rut: "22222222-2", siteId: "s1", departmentName: "Perforacion" }],
]);
const siteNames = new Map<string, string>([["s1", "La Coipa"]]);

function planillaRow(over: Partial<PlanillaAttendanceRow>): PlanillaAttendanceRow {
  return {
    id: `p-${Math.random()}`,
    date: "2026-08-01",
    rut: "11111111-1",
    rutNormalized: "111111111",
    fullName: "Ana Perez",
    projectName: "LA COIPA",
    shiftDayNight: "day",
    turnoAB: "A",
    machine: "740-7",
    metros: 100,
    horasExtras: null,
    workeraMarkedIn: true,
    workeraMarkedOut: true,
    employeeId: "e1",
    siteId: "s1",
    ...over,
  };
}

function attendanceRow(over: Partial<AttendanceInputRow>): AttendanceInputRow {
  return {
    employeeId: "e1",
    date: "2026-08-01",
    status: "present",
    shift: "day",
    hoursWorked: 9.5,
    timeIn: "07:02",
    timeOut: "16:35",
    corrected: false,
    ...over,
  };
}

console.log("ATTENDANCE (Workera vs Planilla Diaria)");

// 1) matched
{
  const res = buildAttendanceReconciliation({
    planilla: [planillaRow({ id: "a1" })],
    attendance: [attendanceRow({})],
    employees,
    siteNames,
  });
  check("matched: verdict", res.rows[0]?.verdict === "matched", res.rows[0]?.verdict);
  check("matched: summary", res.summary.matched === 1 && res.summary.planillaOnly === 0);
}

// 2) planilla only, sheet claims a Workera mark
{
  const res = buildAttendanceReconciliation({
    planilla: [planillaRow({ id: "a2", workeraMarkedIn: true })],
    attendance: [],
    employees,
    siteNames,
  });
  const row = res.rows[0];
  check("planilla-only: verdict", row?.verdict === "planilla-only", row?.verdict);
  check("planilla-only: flag claims-mark-no-record", row?.flags.includes("claims-mark-no-record") === true);
  check(
    "planilla-only: KPI claims mark",
    res.summary.planillaOnly === 1 && res.summary.planillaOnlyClaimsMark === 1,
  );
}

// 3) Workera has the day as absent
{
  const res = buildAttendanceReconciliation({
    planilla: [planillaRow({ id: "a3" })],
    attendance: [attendanceRow({ status: "absent", hoursWorked: 0 })],
    employees,
    siteNames,
  });
  check("workera-absent: verdict", res.rows[0]?.verdict === "workera-absent", res.rows[0]?.verdict);
  check("workera-absent: KPI", res.summary.workeraAbsent === 1);
}

// 4) sheet says No but the record exists
{
  const res = buildAttendanceReconciliation({
    planilla: [planillaRow({ id: "a4", workeraMarkedIn: false })],
    attendance: [attendanceRow({})],
    employees,
    siteNames,
  });
  check(
    "says-no-but-present: verdict",
    res.rows[0]?.verdict === "says-no-but-present",
    res.rows[0]?.verdict,
  );
}

// 5) shift mismatch (single block that day)
{
  const res = buildAttendanceReconciliation({
    planilla: [planillaRow({ id: "a5", shiftDayNight: "night" })],
    attendance: [attendanceRow({ shift: "day" })],
    employees,
    siteNames,
  });
  check("shift-mismatch: verdict", res.rows[0]?.verdict === "shift-mismatch", res.rows[0]?.verdict);
}

// 6) day + night block for the same person -> shift not comparable
{
  const res = buildAttendanceReconciliation({
    planilla: [
      planillaRow({ id: "a6-day", shiftDayNight: "day" }),
      planillaRow({ id: "a6-night", shiftDayNight: "night" }),
    ],
    attendance: [attendanceRow({})],
    employees,
    siteNames,
  });
  check(
    "day+night: verdict",
    res.rows[0]?.verdict === "multi-shift-planilla",
    res.rows[0]?.verdict,
  );
  check(
    "day+night: one row per employee/day",
    res.rows.length === 1 && res.rows[0]?.planillaShift === "day+night",
  );
}

// 7) attendance with no planilla row + 8) planilla row with an unknown RUT
{
  const res = buildAttendanceReconciliation({
    planilla: [
      planillaRow({ id: "a8", rut: "99999999-9", rutNormalized: "999999999", employeeId: null }),
    ],
    attendance: [attendanceRow({ employeeId: "e2", date: "2026-08-02" })],
    employees,
    siteNames,
  });
  const workeraOnly = res.rows.find((r) => r.verdict === "workera-only");
  const unmatched = res.rows.find((r) => r.flags.includes("unmatched-rut"));
  check("workera-only: row", Boolean(workeraOnly), JSON.stringify(res.summary));
  check("unmatched RUT: flag", Boolean(unmatched));
  check("unmatched RUT: KPI", res.summary.unmatchedRut === 1 && res.summary.workeraOnly === 1);
}

// ======================
// DRILLING
// ======================

const rigs = new Map<string, RigRef>([
  ["r1", { id: "r1", name: "740-7", code: "rig:7407", siteId: "s1" }],
  ["r2", { id: "r2", name: "1200-1", code: "rig:12001", siteId: "s1" }],
]);

function perfRow(over: Partial<RigPerformanceRow>): RigPerformanceRow {
  return {
    rigId: "r1",
    date: "2026-08-01",
    shift: "day",
    metersDrilled: 100,
    hoursSpent: 12,
    hole: "H-1",
    drillingLevel: "500",
    intervals: [{ band: "HQ (0.00 - 200.00)", escala: "0-200", diameter: "HQ", meters: 100 }],
    source: "excel",
    ...over,
  };
}

console.log("\nDRILLING (daily drilling vs Planilla Diaria METROS)");

// 1) matched (METROS repeated on both crew rows -> max, one distinct value)
{
  const res = buildDrillingReconciliation({
    planilla: [
      { date: "2026-08-01", shiftDayNight: "day", machine: "740-7", rigId: "r1", metros: 100, diameter: "HQ", escala: "0-200" },
      { date: "2026-08-01", shiftDayNight: "day", machine: "740-7", rigId: "r1", metros: 100, diameter: "HQ", escala: "0-200" },
    ],
    performance: [perfRow({})],
    rigs,
    siteNames,
    tolerance: 0,
  });
  check("matched: verdict", res.rows[0]?.verdict === "matched", res.rows[0]?.verdict);
  check(
    "matched: max of crew rows",
    res.rows[0]?.planillaMeters === 100 && res.rows[0]?.planillaRows === 2,
  );
  check(
    "matched: source label",
    res.rows[0]?.sourceLabel === "Intervals file",
    res.rows[0]?.sourceLabel ?? "null",
  );
}

// 2) value diff
{
  const res = buildDrillingReconciliation({
    planilla: [{ date: "2026-08-01", shiftDayNight: "day", machine: "740-7", rigId: "r1", metros: 100, diameter: null, escala: null }],
    performance: [perfRow({ metersDrilled: 90 })],
    rigs,
    siteNames,
    tolerance: 0,
  });
  const row = res.rows[0];
  check("value-diff: verdict", row?.verdict === "value-diff", row?.verdict);
  check(
    "value-diff: delta + pct",
    row?.delta === 10 && row?.deltaPct === 11.1,
    `${row?.delta} / ${row?.deltaPct}`,
  );
}

// 3) tolerance
{
  const res = buildDrillingReconciliation({
    planilla: [{ date: "2026-08-01", shiftDayNight: "day", machine: "740-7", rigId: "r1", metros: 103, diameter: null, escala: null }],
    performance: [perfRow({ metersDrilled: 100 })],
    rigs,
    siteNames,
    tolerance: 5,
  });
  check("tolerance: 3 m diff with ±5 m -> matched", res.rows[0]?.verdict === "matched", res.rows[0]?.verdict);
}

// 4) crew rows disagree on METROS
{
  const res = buildDrillingReconciliation({
    planilla: [
      { date: "2026-08-01", shiftDayNight: "day", machine: "740-7", rigId: "r1", metros: 100, diameter: null, escala: null },
      { date: "2026-08-01", shiftDayNight: "day", machine: "740-7", rigId: "r1", metros: 90, diameter: null, escala: null },
    ],
    performance: [perfRow({ metersDrilled: 100 })],
    rigs,
    siteNames,
    tolerance: 0,
  });
  const row = res.rows[0];
  check("values-disagree: verdict", row?.verdict === "values-disagree", row?.verdict);
  check(
    "values-disagree: flag + min/max",
    row?.flags.includes("planilla-values-disagree") === true &&
      row?.planillaMinMeters === 90 &&
      row?.planillaMeters === 100,
  );
}

// 5) planilla only / 6) drilling only (CorePlan source label)
{
  const res = buildDrillingReconciliation({
    planilla: [
      { date: "2026-08-02", shiftDayNight: "night", machine: "1200-1", rigId: "r2", metros: 50, diameter: null, escala: null },
    ],
    performance: [perfRow({ rigId: "r2", date: "2026-08-03", shift: "night", source: "coreplan" })],
    rigs,
    siteNames,
    tolerance: 0,
  });
  const planillaOnly = res.rows.find((r) => r.verdict === "planilla-only");
  const sourceOnly = res.rows.find((r) => r.verdict === "source-only");
  check("planilla-only: row", Boolean(planillaOnly));
  check("drilling-only: row", Boolean(sourceOnly));
  check("drilling-only: CorePlan label", sourceOnly?.sourceLabel === "CorePlan", sourceOnly?.sourceLabel ?? "null");
}

// 7) unmapped machine + 8) totals / roll-up
{
  const res = buildDrillingReconciliation({
    planilla: [
      { date: "2026-08-04", shiftDayNight: "day", machine: "EDM 2000-7", rigId: null, metros: 20, diameter: "PQ", escala: "0-500" },
    ],
    performance: [perfRow({ rigId: "r1", date: "2026-08-04", metersDrilled: 120 })],
    rigs,
    siteNames,
    tolerance: 0,
  });
  const unmappedRow = res.rows.find((r) => r.flags.includes("unmapped-machine"));
  check("unmapped machine: flag", Boolean(unmappedRow));
  check(
    "unmapped machine: bucket",
    res.summary.unmappedMachines[0]?.machine === "EDM 2000-7" &&
      res.summary.unmappedMachines[0]?.meters === 20,
  );
  check(
    "totals: planilla vs drilling",
    res.summary.planillaMeters === 20 &&
      res.summary.sourceMeters === 120 &&
      res.summary.deltaMeters === -100,
    JSON.stringify({
      p: res.summary.planillaMeters,
      s: res.summary.sourceMeters,
      d: res.summary.deltaMeters,
    }),
  );
  check(
    "roll-up: only mapped rigs",
    res.summary.byRig.length === 1 && res.summary.byRig[0]?.rigId === "r1",
  );
  check("bySource: counted per drilling row", res.summary.bySource.excel === 1);
}

// 7b) blank MAQUINA rows group per date+shift, flag no-machine, and roll into
// the noMachine summary instead of the unmapped-machine list.
{
  const res = buildDrillingReconciliation({
    planilla: [
      { date: "2026-08-05", shiftDayNight: "day", machine: null, rigId: null, metros: 10, diameter: null, escala: null },
      { date: "2026-08-05", shiftDayNight: "day", machine: "  ", rigId: null, metros: 10, diameter: null, escala: null },
    ],
    performance: [],
    rigs,
    siteNames,
    tolerance: 0,
  });
  check("blank machine: single no-machine key", res.rows.length === 1);
  check("blank machine: flag", res.rows[0]?.flags.includes("no-machine") === true);
  check(
    "blank machine: summary bucket",
    res.summary.noMachine.keys === 1 &&
      res.summary.noMachine.planillaRows === 2 &&
      res.summary.unmappedMachines.length === 0,
    JSON.stringify(res.summary.noMachine),
  );
}


// ======================
// OPTIONAL: real period through the DB loader
// ======================

async function realPeriod() {
  const args = process.argv.slice(2).filter((a) => a !== "--db");
  const now = new Date();
  const lastMonthFirst = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const lastMonthLast = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const from = args[0] ?? lastMonthFirst.toISOString().slice(0, 10);
  const to = args[1] ?? lastMonthLast.toISOString().slice(0, 10);

  const { loadAttendanceReconciliation, loadDrillingReconciliation } = await import(
    "../src/lib/reconciliation/load"
  );
  const attendance = await loadAttendanceReconciliation({ from, to });
  console.log(`\nDB attendance ${from}..${to}:`, JSON.stringify(attendance.summary));
  console.log(`DB attendance rows=${attendance.rows.length} truncated=${attendance.truncated}`);
  const drilling = await loadDrillingReconciliation({ from, to });
  console.log(`DB drilling ${from}..${to}:`, JSON.stringify(drilling.summary));
  console.log(`DB drilling rows=${drilling.rows.length} rigs=${drilling.rigOptions.length}`);
}

async function main() {
  if (process.argv.includes("--db")) await realPeriod();

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed`);
    process.exitCode = 1;
    return;
  }
  console.log("\nPASS: reconciliation builders verified");
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exitCode = 1;
});
