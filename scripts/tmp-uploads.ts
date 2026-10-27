import "dotenv/config";
import { db } from "../src/lib/db";

/** Lists ExcelUpload rows and the DailyCrewEntry rows for a given RUT. */
async function main() {
  const rut = process.argv[2] ?? "156138061";
  const uploads = await db.excelUpload.findMany({
    orderBy: { uploadedAt: "desc" },
    include: { site: { select: { name: true } }, _count: { select: { entries: true } } },
    take: 20,
  });
  console.log(`Latest ${uploads.length} uploads:`);
  for (const u of uploads) {
    console.log(
      `  ${u.uploadedAt.toISOString().slice(0, 19)} kind=${u.kind} status=${u.status} site=${u.site?.name ?? "-"} rows=${u.rowCount} crew=${u._count.entries} file="${u.fileName}"`,
    );
  }

  const entries = await db.dailyCrewEntry.findMany({
    where: { rutNormalized: rut },
    orderBy: [{ date: "asc" }],
    include: { upload: { select: { fileName: true } } },
  });
  console.log(`\nDailyCrewEntry rows for RUT ${rut}: ${entries.length}`);
  for (const e of entries) {
    console.log(
      `  sheet=${e.sheetName} date=${e.date.toISOString().slice(0, 10)} rut="${e.rut}" name="${e.fullName}" cargo="${e.cargoRaw}" machine=${e.machine} shift=${e.shiftDayNight} turno=${e.turnoAB} upload="${e.upload.fileName}" raw=${JSON.stringify(e.rawData)}`,
    );
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
