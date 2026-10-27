import "dotenv/config";
import { db } from "../src/lib/db";

/** Overview of remaining planilla data + any rows for both Ariels. */
async function main() {
  const total = await db.dailyCrewEntry.count();
  console.log(`DailyCrewEntry total: ${total}`);
  if (total > 0) {
    const min = await db.dailyCrewEntry.findFirst({ orderBy: { date: "asc" }, select: { date: true } });
    const max = await db.dailyCrewEntry.findFirst({ orderBy: { date: "desc" }, select: { date: true } });
    console.log(`  date range: ${min?.date.toISOString().slice(0, 10)} .. ${max?.date.toISOString().slice(0, 10)}`);
  }
  const uploads = await db.excelUpload.findMany({
    orderBy: { uploadedAt: "desc" },
    select: { id: true, fileName: true, kind: true, status: true, rowCount: true, uploadedAt: true },
    take: 30,
  });
  console.log(`\nUploads (${uploads.length}):`);
  for (const u of uploads) {
    const n = await db.dailyCrewEntry.count({ where: { uploadId: u.id } });
    console.log(`  ${u.uploadedAt.toISOString().slice(0, 10)} "${u.fileName}" kind=${u.kind} status=${u.status} rows=${n} entries=${n}`);
  }

  // Any planilla rows for either Ariel by name?
  for (const frag of ["ARIEL", "LISBOA", "RIQUELME"]) {
    const rows = await db.dailyCrewEntry.findMany({
      where: { fullName: { contains: frag, mode: "insensitive" } },
      select: { date: true, rut: true, fullName: true, cargoRaw: true, machine: true, projectName: true },
      orderBy: { date: "asc" },
      take: 50,
    });
    console.log(`\nDailyCrewEntry fullName~"${frag}": ${rows.length}`);
    for (const r of rows) {
      console.log(`  ${r.date.toISOString().slice(0, 10)} "${r.fullName}" rut=${r.rut ?? "?"} cargo="${r.cargoRaw}" machine=${r.machine} project=${r.projectName}`);
    }
  }

  // Employees with cargo Conductor/Chofer at Coipa
  const coipa = await db.site.findFirst({ where: { name: "Proyecto La Coipa" } });
  const conductores = await db.employee.findMany({
    where: { siteId: coipa?.id, OR: [{ jobPositionName: { contains: "onductor", mode: "insensitive" } }, { jobPositionName: { contains: "hof", mode: "insensitive" } }] },
    select: { id: true, fullName: true, rut: true, jobPositionName: true },
  });
  console.log(`\nCoipa conductores/choferes: ${conductores.length}`);
  for (const c of conductores) console.log(`  ${c.fullName} rut=${c.rut ?? "?"} job=${c.jobPositionName}`);
}

main()
  .catch((e) => {
    console.error("FAILED:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
