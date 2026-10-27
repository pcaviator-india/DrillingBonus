import "dotenv/config";
import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  const rss = await p.bonusRuleSet.findMany({
    where: { isActive: true },
    include: { site: true, rules: { include: { bonusType: true } } },
  });
  for (const rs of rss) {
    console.log("RULESET", rs.site.name, rs.name, "v" + rs.version, rs.id);
    for (const r of rs.rules) {
      console.log(" -", r.bonusType.code, "params=" + JSON.stringify(r.parameters).slice(0, 500));
    }
  }
  const rigs = await p.rig.findMany({ include: { siteRigs: true } });
  for (const r of rigs) {
    console.log("RIG", r.name, r.rigType, r.siteId, JSON.stringify(r.siteRigs.map((s) => s.effectiveType)));
  }
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
