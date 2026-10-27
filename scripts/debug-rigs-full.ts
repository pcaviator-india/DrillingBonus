import "dotenv/config";
import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  const rigs = await p.rig.findMany({
    orderBy: { name: "asc" },
    include: {
      site: true,
      siteRigs: true,
      _count: { select: { performances: true, assignments: true, rigAliases: true, workDays: true } },
    },
  });
  for (const r of rigs) {
    console.log(
      `RIG id=${r.id} name=${JSON.stringify(r.name)} code=${r.code} type=${r.rigType} site=${r.site?.name ?? "null"} perfs=${r._count.performances} assigns=${r._count.assignments} aliases=${r._count.rigAliases} workdays=${r._count.workDays} siteRigs=${JSON.stringify(r.siteRigs.map((s) => s.effectiveType))}`,
    );
  }
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
