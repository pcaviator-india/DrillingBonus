import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const sites = await prisma.site.findMany({ include: { rigs: true } });
  for (const s of sites) {
    console.log(s.id, "|", s.name, "| code:", s.code, "| rigs:", s.rigs.length);
  }
  const ruleSets = await prisma.bonusRuleSet.findMany({
    where: { isActive: true },
    include: { rules: true, site: true },
  });
  console.log("\nActive rule sets:");
  for (const rs of ruleSets) {
    console.log(` - ${rs.site.name} | ${rs.name} | rules=${rs.rules.length}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());