import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const groups = await prisma.positionGroup.findMany({ include: { aliases: true } });
  for (const g of groups) {
    const mains = g.aliases.filter((a) => !a.mainPositionId);
    const aliases = g.aliases.filter((a) => a.mainPositionId);
    console.log(`\n${g.key} | ${g.name}`);
    console.log(`  mains (${mains.length}):`, mains.map((a) => a.normalized).join(", "));
    console.log(`  aliases (${aliases.length}):`, aliases.map((a) => a.normalized).join(", "));
  }
  // Also show unlinked aliases awaiting review
  const unlinked = await prisma.positionAlias.findMany({ where: { groupId: null } });
  console.log(`\nUnlinked aliases (${unlinked.length}):`, unlinked.map((a) => a.normalized).join(", "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());