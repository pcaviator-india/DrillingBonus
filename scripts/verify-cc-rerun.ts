import { PrismaClient } from "@prisma/client";
import { runCalculation } from "../src/lib/calculations/run";

/**
 * Re-runs the Chile Chico AUGUST 2026 calculation end-to-end and prints the
 * result — live validation that the depth-scale alias fix yields non-zero pay.
 */
const prisma = new PrismaClient();

type LineBreakdown = {
  shifts?: Array<{ rigName?: string; drillingType?: string | null; depthScale?: string | null; meters?: number; rate?: number }>;
};

async function main() {
  const site = (await prisma.site.findMany()).find((s) => s.name.toLowerCase().includes("chile chico"));
  if (!site) throw new Error("no Chile Chico site");
  const ruleSet = await prisma.bonusRuleSet.findFirst({
    where: { siteId: site.id, isActive: true },
    orderBy: { version: "desc" },
  });
  if (!ruleSet) throw new Error("no active Chile Chico rule set");
  console.log("Active rule set:", ruleSet.name, "v" + ruleSet.version, ruleSet.id);

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
    const bd = l.breakdown as LineBreakdown | null;
    const scales = [...new Set((bd?.shifts ?? []).map((s) => `${s.drillingType}@${s.depthScale}`))].slice(0, 4);
    console.log(
      `  ${nameById.get(l.employeeId) ?? l.employeeId} | role=${l.roleUsed} | days=${l.daysWorked} | m=${l.totalMeters} | bonus=${l.calculatedBonus} | [${scales.join(", ")}]`,
    );
  }

  const zeroCount = await prisma.bonusCalculationLine.count({
    where: { calculationId: res.calculationId, calculatedBonus: 0 },
  });
  console.log(`Lines with 0 bonus: ${zeroCount} of ${res.linesCount}`);
  console.log("calculationId=" + res.calculationId);
}

main()
  .catch((e) => { console.error("FAIL:", String(e)); process.exit(1); })
  .finally(() => prisma.$disconnect());
