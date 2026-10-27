import { PrismaClient } from "@prisma/client";

/**
 * One-time repair for Chile Chico uploads (run before the code fix):
 *  1. Creates the missing site alias so future planilla files auto-assign.
 *  2. Claims the orphaned rigs (parsed from the CC interval reports, all with
 *     siteId = null) to the Chile Chico site. The parsed RigShiftPerformance
 *     rows already point at these rigs, so no re-parse is needed.
 */
const p = new PrismaClient();
async function main() {
  const site = await p.site.findFirst({ where: { name: { contains: "Chile Chico" } } });
  if (!site) throw new Error("Chile Chico site not found");

  const aliasNormalized = "CERRO BAYO / CHILE CHICO";
  const alias = await p.siteAlias.upsert({
    where: { normalized: aliasNormalized },
    create: { normalized: aliasNormalized, siteId: site.id, source: "manual", variants: ["CERRO BAYO / CHILE CHICO"] },
    update: { siteId: site.id },
  });
  console.log("siteAlias:", alias.normalized, "->", site.name);

  // Rigs referenced by the CC interval uploads (parsed meters already in DB).
  const rigs = await p.rig.updateMany({
    where: { code: { in: ["rig:20011", "rig:20013", "rig:OPERACIONES", "rig:FLOTA", "rig:MANTENCION", "rig:TALLER", "rig:HSEC"] }, siteId: null },
    data: { siteId: site.id },
  });
  console.log("rigs claimed to", site.name, ":", rigs.count);

  const after = await p.rig.findMany({ where: { siteId: site.id }, select: { name: true } });
  console.log("site rigs now:", after);
  const perf = await p.rigShiftPerformance.count({ where: { rig: { siteId: site.id } } });
  console.log("site rigShiftPerformance rows:", perf);
}
main().finally(() => p.$disconnect());

