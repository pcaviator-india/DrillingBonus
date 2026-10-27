import { PrismaClient } from "@prisma/client";
import { runCalculation } from "../src/lib/calculations/run";

/**
 * Re-runs the Mantoverde AUGUST calculation end-to-end with the corrected
 * common rule set and prints the result (live validation of the zero-bonus fix).
 */
const prisma = new PrismaClient();

type LineBreakdown = {
  components?: Array<{ bonusTypeCode: string; amount: number }>;
};

async function main() {
  const site = (await prisma.site.findMany()).find((s) => s.name.toLowerCase().includes("mantoverde"));
  if (!site) throw new Error("no MV site");
  const ruleSet = await prisma.bonusRuleSet.findFirst({
    where: { siteId: site.id, isActive: true },
    orderBy: { version: "desc" },
  });
  if (!ruleSet) throw new Error("no active MV rule set");
  console.log("Active rule set:", ruleSet.name, "v" + ruleSet.version);

  const res = await runCalculation(site.id, ruleSet.id, "2026-08-01", "2026-08-31", undefined);
  console.log(`AUGUST re-run: lines=${res.linesCount} totalBonus=${res.totalBonus}`);
  if (res.totalBonus <= 0) throw new Error("FAILED: total bonus still 0");

  const lines = await prisma.bonusCalculationLine.findMany({
    where: { calculationId: res.calculationId },
    orderBy: { calculatedBonus: "desc" },
    take: 12,
  });
  const empIds = [...new Set(lines.map((l) => l.employeeId))];
  const emps = await prisma.employee.findMany({ where: { id: { in: empIds } }, select: { id: true, fullName: true } });
  const nameById = new Map(emps.map((e) => [e.id, e.fullName]));

  console.log("Top lines:");
  for (const l of lines) {
    const bd = l.breakdown as LineBreakdown;
    const comps = (bd.components ?? []).map((c) => `${c.bonusTypeCode}=${c.amount}`).join(", ");
    console.log(`  ${nameById.get(l.employeeId) ?? l.employeeId} | role=${l.roleUsed} | days=${l.daysWorked} | m=${l.totalMeters} | bonus=${l.calculatedBonus} | [${comps}]`);
  }

  const zeroCount = await prisma.bonusCalculationLine.count({ where: { calculationId: res.calculationId, calculatedBonus: 0 } });
  console.log(`Lines with 0 bonus: ${zeroCount} of ${res.linesCount}`);
}

main()
  .catch((e) => { console.error("FAIL:", String(e)); process.exit(1); })
  .finally(() => prisma.$disconnect());