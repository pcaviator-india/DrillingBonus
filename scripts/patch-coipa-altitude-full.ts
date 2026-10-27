/**
 * Sets payMode="full" on the high_altitude rule of Proyecto La Coipa (code 03).
 * Pure data patch — no formula or site hard-coding in the engine; the handler
 * reads payMode from each rule's parameters (default "prorated" elsewhere).
 * Re-runnable.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const site = await prisma.site.findFirst({ where: { code: "03" } });
  if (!site) throw new Error('Site code "03" (Proyecto La Coipa) not found');
  console.log(`Site: ${site.name} (${site.code}) ${site.id}`);

  const altitudeType = await prisma.bonusType.findUnique({ where: { code: "high_altitude" } });
  if (!altitudeType) throw new Error("Bonus type high_altitude missing — run seed first");

  const ruleSet = await prisma.bonusRuleSet.findFirst({
    where: { siteId: site.id, isActive: true },
    include: { rules: true },
  });
  if (!ruleSet) throw new Error(`No active rule set for site ${site.name}`);

  const targets = ruleSet.rules.filter((r) => r.bonusTypeId === altitudeType.id);
  if (targets.length === 0) throw new Error("No high_altitude rule found on Coipa active rule set");
  for (const r of targets) {
    const params = { ...((r.parameters as Record<string, unknown>) ?? {}) };
    params.monthlyAmount = (params.monthlyAmount as number | undefined) ?? 250000;
    params.daysInMonth = (params.daysInMonth as number | undefined) ?? 30;
    params.payMode = "full";
    await prisma.bonusRule.update({ where: { id: r.id }, data: { parameters: params as object } });
    console.log(`Updated rule ${r.id}: payMode=full`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
