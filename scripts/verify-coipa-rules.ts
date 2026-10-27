import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
async function main() {
  const site = await p.site.findFirst({ where: { name: "Proyecto La Coipa" } });
  if (!site) throw new Error("no site");
  const rs = await p.bonusRuleSet.findMany({
    where: { siteId: site.id },
    orderBy: { version: "desc" },
    include: { rules: true },
  });
  for (const r of rs) {
    console.log("RULESET", r.name, "v" + r.version, "active:", r.isActive, "rules:", r.rules.length);
    if (r.isActive) {
      for (const rule of r.rules) {
        console.log("  rule pos=", JSON.stringify(rule.positionFilter));
        console.log("    params=", JSON.stringify(rule.parameters).slice(0, 700));
      }
    }
  }
}
main().finally(() => p.$disconnect());
