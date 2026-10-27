import { PrismaClient } from "@prisma/client";
import { calculateBonuses } from "../src/lib/bonus-engine/engine";
import type { BonusEngineInput } from "../src/types/bonus";

/**
 * Validates the two reported Coipa cases (role "bodeguero", role "HSEC")
 * against the ACTIVE Coipa rule set using the PURE engine, mimicking the
 * role-token resolution now performed by src/lib/calculations/run.ts.
 */
const p = new PrismaClient();
async function main() {
  const site = await p.site.findFirst({ where: { name: "Proyecto La Coipa" } });
  if (!site) throw new Error("no site");
  const rs = await p.bonusRuleSet.findFirst({
    where: { siteId: site.id, isActive: true },
    include: { rules: { include: { bonusType: true } } },
  });
  if (!rs) throw new Error("no active rule set");
  console.log("Active ruleset:", rs.name, "v" + rs.version);

  // Simulate the registry token resolution (bodeguero/HSEC aliases -> group1/2).
  const tokenFor = (role: string) => {
    const n = role.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    if (n === "BODEGUERO") return [role, n, "group2"]; // alias as assigned in the registry
    if (n === "HSEC") return [role, n, "group1"];
    return [role, n];
  };

  const input: BonusEngineInput = {
    period: { start: "2026-08-01", end: "2026-08-31" },
    rules: rs.rules.map((r) => ({
      ruleId: r.id,
      bonusTypeCode: r.bonusType.code,
      positionFilter: r.positionFilter,
      drillingTypeFilter: r.drillingTypeFilter,
      priority: r.priority,
      parameters: r.parameters as never,
      minAttendanceDays: r.minAttendanceDays ?? null,
    })),
    employees: [
      {
        employeeId: "e1",
        fullName: "Felipe Ivan Zambra Gonzalez",
        daysWorked: 11,
        attendanceHours: 88,
        defaultRole: "bodeguero",
        roleTokens: tokenFor("bodeguero"),
        shifts: [{ date: "2026-08-05", shift: "day", rigName: "none", role: "bodeguero", meters: 0, hours: 8, drillingLevel: null, drillingType: null, drillingDepth: null }],
      },
      {
        employeeId: "e2",
        fullName: "Nora Alexandra Salas Rojas",
        daysWorked: 10,
        attendanceHours: 80,
        defaultRole: "HSEC",
        roleTokens: tokenFor("HSEC"),
        shifts: [{ date: "2026-08-05", shift: "day", rigName: "none", role: "HSEC", meters: 0, hours: 8, drillingLevel: null, drillingType: null, drillingDepth: null }],
      },
    ],
    monthlyRigTotals: { "RIG-TEST": 2000 },
    rigTotalsByType: { "RIG-TEST": { H1: 2000 } },
    rigTotalsByTypeAndScale: { "RIG-TEST": { H1: { "0-500": 2000 } } },
    rigTypes: { "RIG-TEST": "DIAMANTINA" },
  };

  const out = calculateBonuses(input);
  for (const line of out.lines) {
    console.log(`\n${line.fullName} role=${line.roleUsed} days=${line.daysWorked} total=${line.calculatedBonus}`);
    for (const c of line.components) {
      console.log(`  - ${c.bonusTypeName}: ${c.amount}`, JSON.stringify(c.details).slice(0, 200));
    }
  }
  const e1 = out.lines.find((l) => l.fullName.includes("Felipe"));
  const e2 = out.lines.find((l) => l.fullName.includes("Nora"));
  if (!e1 || e1.calculatedBonus <= 0) throw new Error("FAIL: bodeguero still 0");
  if (!e2 || e2.calculatedBonus <= 0) throw new Error("FAIL: HSEC still 0");
  console.log("\nPASS: both employees now receive a bonus.");
}
main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => p.$disconnect());
