import "dotenv/config";
import { db } from "../src/lib/db";

async function main() {
  // create a rig + performance linked to a throwaway upload
  const rig = await db.rig.upsert({
    where: { code: "rig:TEST-DEL" },
    create: { name: "Rig TEST-DEL", code: "rig:TEST-DEL" },
    update: {},
  });
  const up = await db.excelUpload.create({
    data: { fileName: "TEST delete.xlsx", kind: "rig_intervals", rowCount: 1, sheetCount: 1 },
  });
  const perf = await db.rigShiftPerformance.create({
    data: {
      rigId: rig.id,
      uploadId: up.id,
      date: new Date("2026-01-01"),
      shift: "day",
      metersDrilled: 1,
    },
  });

  // also test planilla cascade
  const up2 = await db.excelUpload.create({
    data: { fileName: "TEST delete 2.xlsx", kind: "planilla_diaria", rowCount: 1, sheetCount: 1 },
  });
  const entry = await db.dailyCrewEntry.create({
    data: {
      uploadId: up2.id,
      sheetName: "01-01-2026",
      date: new Date("2026-01-01"),
      rut: "1-1",
      rutNormalized: "11",
      fullName: "Test",
      cargoRaw: "TEST",
      cargoNormalized: "TEST",
      shiftDayNight: "day",
    },
  });

  // delete both uploads (same as deleteUploadAction does)
  await db.excelUpload.delete({ where: { id: up.id } });
  await db.excelUpload.delete({ where: { id: up2.id } });

  const perfAfter = await db.rigShiftPerformance.findUnique({ where: { id: perf.id } });
  const entryAfter = await db.dailyCrewEntry.findUnique({ where: { id: entry.id } });
  console.log("rig perf after delete:", perfAfter ? `exists, uploadId=${perfAfter.uploadId}` : "deleted");
  console.log("planilla entry after delete:", entryAfter ? "STILL EXISTS (cascade broken!)" : "deleted (cascade OK)");

  // cleanup
  await db.rigShiftPerformance.delete({ where: { id: perf.id } });
  await db.rig.delete({ where: { id: rig.id } });
  console.log("cleanup done");
  await db.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
