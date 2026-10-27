/**
 * Deletes ALL bonus rule sets and rules from the database so a fresh set can be
 * created in the Rules UI after the drilling-type fix (HQ, NQ, PQ, DDH, NAVI, RC).
 * Bonus calculations (and their lines) that reference the deleted rule sets are
 * removed first — they were computed with the old H1/H2-based rules and are
 * invalid under the corrected type model.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [ruleSets, rules, calcs, lines] = await Promise.all([
    prisma.bonusRuleSet.count(),
    prisma.bonusRule.count(),
    prisma.bonusCalculation.count(),
    prisma.bonusCalculationLine.count(),
  ]);
  console.log(`Before: ruleSets=${ruleSets} rules=${rules} calculations=${calcs} lines=${lines}`);

  // No cascades in the schema — delete children first.
  await prisma.bonusCalculationLine.deleteMany({});
  await prisma.bonusCalculation.deleteMany({});
  await prisma.bonusRule.deleteMany({});
  await prisma.bonusRuleSet.deleteMany({});

  const after = await Promise.all([
    prisma.bonusRuleSet.count(),
    prisma.bonusRule.count(),
    prisma.bonusCalculation.count(),
    prisma.bonusCalculationLine.count(),
  ]);
  console.log(`After:  ruleSets=${after[0]} rules=${after[1]} calculations=${after[2]} lines=${after[3]}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());