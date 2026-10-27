import "dotenv/config";
import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  const site = await p.site.findFirst({ where: { name: { contains: "Mantoverde", mode: "insensitive" } } });
  console.log("SITE", site?.id, site?.name);
  const rs = await p.bonusRuleSet.findFirst({
    where: { siteId: site!.id, isActive: true },
    include: { rules: { include: { bonusType: true } } },
  });
  console.log("RULESET", rs?.name, "v" + rs?.version, rs?.id);
  for (const r of rs?.rules ?? []) {
    const params = r.parameters as Record<string, unknown>;
    console.log(
      "RULE",
      r.bonusType.code,
      "pos=" + JSON.stringify(r.positionFilter).slice(0, 60),
      "bestRigSelection=" + String((params as { bestRigSelection?: string }).bestRigSelection),
      "bestRigRule=" + JSON.stringify((params as { bestRigRule?: unknown }).bestRigRule ?? null),
    );
  }
  const rigs = await p.rig.findMany({ where: { OR: [{ name: { contains: "1200" } }, { name: { contains: "740" } }] }, include: { site: true, siteRigs: true } });
  for (const r of rigs) {
    console.log("RIG", JSON.stringify(r.name), r.id, "type=" + r.rigType, "site=" + (r.site?.name ?? null), "siteRigs=" + JSON.stringify(r.siteRigs.map((s) => ({ siteId: s.siteId, eff: s.effectiveType }))));
  }
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
