import { db } from "../src/lib/db";
import {
  listProyectos,
  assignProyectoToSite,
  listSiteAliases,
} from "../src/lib/matching/site-aliases";

async function main() {
  // Create throwaway site + rig
  const site = await db.site.create({ data: { name: "Test Site Mandoverde" } });
  const rig = await db.rig.create({ data: { name: "740-7", code: "rig:740-7" } });

  // Simulate a planilla entry for proyecto MantoVerde on that rig
  const upload = await db.excelUpload.create({
    data: { fileName: "TEST site.xlsx", kind: "planilla_diaria", rowCount: 1, sheetCount: 1 },
  });
  const entry = await db.dailyCrewEntry.create({
    data: {
      uploadId: upload.id,
      sheetName: "01-08",
      date: new Date("2026-08-01T00:00:00Z"),
      projectName: "MantoVerde",
      rut: "11111111-1",
      rutNormalized: "111111111",
      fullName: "Test Worker",
      cargoRaw: "PERFORISTA",
      cargoNormalized: "perforista",
      machine: "740-7",
      shiftDayNight: "day",
    },
  });

  // Discover proyectos
  const proyectos = await listProyectos();
  console.log("proyectos:", JSON.stringify(proyectos.map((p) => ({ ...p, machines: undefined }))));
  const rec = proyectos.find((p) => p.normalized === "mantoverde");
  console.log("found proyecto:", rec?.proyecto, "machines:", rec?.machines);

  // Assign MantoVerde -> site, should auto-link 740-7
  const res = await assignProyectoToSite("MantoVerde", site.id);
  console.log("assign result:", JSON.stringify(res));

  // Check the rig now has siteId
  const rigAfter = await db.rig.findUnique({ where: { id: rig.id }, select: { siteId: true } });
  console.log("rig siteId:", rigAfter?.siteId, "expected:", site.id);

  const aliases = await listSiteAliases();
  console.log("aliases:", JSON.stringify(aliases.map((a) => ({ n: a.normalized, site: a.siteName }))));

  // cleanup
  await db.dailyCrewEntry.delete({ where: { id: entry.id } });
  await db.excelUpload.delete({ where: { id: upload.id } });
  await db.siteAlias.deleteMany({ where: { siteId: site.id } });
  await db.rig.delete({ where: { id: rig.id } });
  await db.site.delete({ where: { id: site.id } });
  console.log("cleanup done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));