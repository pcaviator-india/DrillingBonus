import { db } from "../src/lib/db";
async function main() {
  const sr = await db.siteRig.findMany({ include: { rig: true, site: true } });
  for (const s of sr) console.log("SiteRig:", s.site?.name, "|", s.rig?.name, "| rig.siteId=", s.rig?.siteId);
  console.log("--- rigAlias ---");
  const ra = await db.rigAlias.findMany({ include: { rig: true } });
  for (const a of ra.slice(0,40)) console.log(a.normalized, "->", a.rig?.name, "rigSite=", a.rig?.siteId);
  console.log("--- rigs with siteId ---");
  const rigs = await db.rig.findMany({ select: { id: true, name: true, siteId: true } });
  console.log(rigs.map(r=>`${r.name}:${r.siteId??"null"}`).join(" | "));
  await db.$disconnect();
}
main();
