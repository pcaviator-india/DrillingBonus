import "dotenv/config";
import { db } from "../src/lib/db";
import { normalizeRut } from "../src/lib/excel/normalize";

/** Looks up employees by a list of RUTs plus dumps the Coipa rigs. */
async function main() {
  const ruts = (process.argv.slice(2).length
    ? process.argv.slice(2)
    : ["15613806-1", "14156135-9", "8851221-9", "13809180-5", "19460207-3", "19804200-5"]
  ).map((r) => normalizeRut(r));
  const emps = await db.employee.findMany({ include: { site: true, defaultRole: true } });
  console.log(`Employees with any of those RUTs:`);
  for (const rn of ruts) {
    const hit = emps.filter((e) => e.rut && normalizeRut(e.rut) === rn);
    console.log(
      `  RUT ${rn}: ${hit.length ? hit.map((h) => `"${h.fullName}" job=${h.jobPositionName ?? "-"} role=${h.defaultRole?.name ?? "-"} site=${h.site?.name ?? "-"} id=${h.id}`).join(" / ") : "(no employee)"}`,
    );
  }

  const site = await db.site.findFirst({ where: { name: { contains: "Coipa", mode: "insensitive" } } });
  console.log(`\nCoipa site: ${site?.name} (${site?.id})`);
  const siteRigs = await db.siteRig.findMany({
    where: { siteId: site?.id },
    include: { rig: true },
  });
  console.log(`SiteRig rows: ${siteRigs.length}`);
  for (const sr of siteRigs) {
    console.log(
      `  rig "${sr.rig.name}" (${sr.rig.id}) rigType=${sr.rig.rigType} effectiveType=${sr.effectiveType} aliases=${JSON.stringify(sr.rig.aliases ?? null)}`,
    );
  }
  const rigCount = await db.rig.count();
  console.log(`\nTotal rigs in DB: ${rigCount}`);
  const arielRigs = await db.rig.findMany({ where: { name: { contains: "47K2", mode: "insensitive" } }, include: { sites: true } });
  for (const r of arielRigs) {
    console.log(`  rig "${r.name}" id=${r.id} aliases=${JSON.stringify(r.aliases ?? null)} sites=${r.sites.map((s) => s.siteId).join(",")}`);
  }
}

main()
  .catch((e) => {
    console.error("FAILED:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
