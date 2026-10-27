import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

/**
 * Deletes MOCK / TEST-only data so the DB holds only real Workera data.
 * Keeps: real employees (workeraId without wk-), real roles, real branch/department,
 * real project sites, current scope selections, and the admin User.
 * Deletes: the 5 mock employees (wk-001..005) + all their related records,
 * mock rigs (RIG-01/02), mock rig-shift performances, mock crew assignments,
 * legacy English roles with no source, bonus rule sets / calculations (test data),
 * and any mock-only branch/department/site codes (SITE-01/02).
 */

function report(name: string, n: number) {
  console.log(`${name.padEnd(40)} ${n}`);
}

async function main() {
  const mockEmp = await p.employee.findMany({
    where: { workeraId: { startsWith: "wk-" } },
    select: { id: true, workeraId: true },
  });
  const mockIds = mockEmp.map((e) => e.id);

  console.log("=== Deleting MOCK / TEST data ===");

  // 1. Mock employees + dependent rows (attendance, crew assignments, bonus lines)
  if (mockIds.length) {
    const delAttendance = await p.attendanceRecord.deleteMany({
      where: { employeeId: { in: mockIds } },
    });
    const delCrew = await p.crewAssignment.deleteMany({
      where: { employeeId: { in: mockIds } },
    });
    const delLines = await p.bonusCalculationLine.deleteMany({
      where: { employeeId: { in: mockIds } },
    });
    const delEmp = await p.employee.deleteMany({ where: { id: { in: mockIds } } });
    report("attendance (mock employees)", delAttendance.count);
    report("crew assignments (mock employees)", delCrew.count);
    report("bonus lines (mock employees)", delLines.count);
    report("employees (mock)", delEmp.count);
  } else {
    report("employees (mock)", 0);
  }

  // 2. Bonus calculations + rule sets (test data referencing mock, keep DB clean)
  const delLinesAll = await p.bonusCalculationLine.deleteMany({});
  const delCalcs = await p.bonusCalculation.deleteMany({});
  const delRules = await p.bonusRule.deleteMany({});
  const delRuleSets = await p.bonusRuleSet.deleteMany({});
  report("bonus lines (all test)", delLinesAll.count);
  report("bonus calculations (test)", delCalcs.count);
  report("bonus rules (test)", delRules.count);
  report("bonus rule sets (test)", delRuleSets.count);

  // 3. Mock rigs + performances
  const mockRigs = await p.rig.findMany({
    where: { code: { in: ["RIG-01", "RIG-02"] } },
    select: { id: true },
  });
  const mockRigIds = mockRigs.map((r) => r.id);
  if (mockRigIds.length) {
    const delCrewRig = await p.crewAssignment.deleteMany({ where: { rigId: { in: mockRigIds } } });
    const delPerf = await p.rigShiftPerformance.deleteMany({ where: { rigId: { in: mockRigIds } } });
    const delRig = await p.rig.deleteMany({ where: { id: { in: mockRigIds } } });
    report("crew assignments (mock rigs)", delCrewRig.count);
    report("rig shift performances (mock rigs)", delPerf.count);
    report("rigs (mock)", delRig.count);
  } else {
    report("rigs (mock)", 0);
  }

  // 4. Legacy English roles with no source (Supervisor, Driller, Driver, Helper)
  const legacyRoles = await p.role.findMany({
    where: { source: null, name: { in: ["Supervisor", "Driller", "Driver", "Helper"] } },
    select: { id: true },
  });
  if (legacyRoles.length) {
    const rids = legacyRoles.map((r) => r.id);
    await p.employee.updateMany({ where: { defaultRoleId: { in: rids } }, data: { defaultRoleId: null } });
    const delRoles = await p.role.deleteMany({ where: { id: { in: rids } } });
    report("legacy roles (no source)", delRoles.count);
  } else {
    report("legacy roles (no source)", 0);
  }

  // 5. Mock-only sites (SITE-01/02) and branches/departments (SITE-01/02)
  const mockSite = await p.site.findMany({ where: { code: { in: ["SITE-01", "SITE-02"] } }, select: { id: true } });
  if (mockSite.length) {
    await p.employee.updateMany({ where: { siteId: { in: mockSite.map((s) => s.id) } }, data: { siteId: null } });
    const del = await p.site.deleteMany({ where: { id: { in: mockSite.map((s) => s.id) } } });
    report("mock sites (SITE-01/02)", del.count);
  } else {
    report("mock sites (SITE-01/02)", 0);
  }
  const delBranchMock = await p.branchOffice.deleteMany({ where: { code: { in: ["SITE-01", "SITE-02"] } } });
  const delDeptMock = await p.department.deleteMany({ where: { code: { in: ["SITE-01", "SITE-02"] } } });
  report("mock branches (SITE-01/02)", delBranchMock.count);
  report("mock departments (SITE-01/02)", delDeptMock.count);

  console.log("\n=== FINAL COUNTS ===");
  const counts: Record<string, number> = {
    Employee: await p.employee.count(),
    Site: await p.site.count(),
    BranchOffice: await p.branchOffice.count(),
    Department: await p.department.count(),
    Role: await p.role.count(),
    AttendanceRecord: await p.attendanceRecord.count(),
    CrewAssignment: await p.crewAssignment.count(),
    Rig: await p.rig.count(),
    RigShiftPerformance: await p.rigShiftPerformance.count(),
    BonusCalculation: await p.bonusCalculation.count(),
    BonusRuleSet: await p.bonusRuleSet.count(),
    User: await p.user.count(),
  };
  console.log(JSON.stringify(counts, null, 1));

  await p.$disconnect();
}
main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});