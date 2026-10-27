import "dotenv/config";
import ExcelJS from "exceljs";
import { db } from "../src/lib/db";
import { parsePlanillaDiaria } from "../src/lib/excel/planilla-diaria";
import { parseRigIntervals } from "../src/lib/excel/rig-intervals";
import { registerCargosFromExcel } from "../src/lib/positions/registry";
import type { Prisma } from "@prisma/client";

async function main() {
  // --- planilla import simulation (same as uploadExcelAction) ---
  const wb1 = new ExcelJS.Workbook();
  await wb1.xlsx.readFile("data-samples/PLANILLA DIARIA RECON DRILLING AGOSTO 2026.xlsx");
  const parsed1 = parsePlanillaDiaria(wb1);
  const up1 = await db.excelUpload.create({
    data: {
      fileName: "TEST planilla.xlsx",
      kind: "planilla_diaria",
      rowCount: parsed1.sheets.reduce((n, s) => n + s.entries.length, 0),
      sheetCount: parsed1.sheets.length,
      dataSnapshot: JSON.parse(JSON.stringify(parsed1)) as Prisma.InputJsonValue,
    },
  });
  for (const sheet of parsed1.sheets) {
    for (const e of sheet.entries) {
      await db.dailyCrewEntry.create({
        data: {
          uploadId: up1.id,
          sheetName: e.sheetName,
          date: new Date(e.date),
          projectName: e.projectName,
          orderNumber: e.orderNumber,
          rut: e.rut,
          rutNormalized: e.rutNormalized,
          fullName: e.fullName,
          cargoRaw: e.cargoRaw,
          cargoNormalized: e.cargoNormalized,
          machine: e.machine,
          diameter: e.diameter,
          escala: e.escala,
          metros: e.metros,
          horasExtras: e.horasExtras,
          workeraMarkedIn: e.workeraMarkedIn,
          workeraMarkedOut: e.workeraMarkedOut,
          motivoHorasExtra: e.motivoHorasExtra,
          shiftDayNight: e.shiftDayNight,
          turnoAB: e.turnoAB,
          rawData: JSON.parse(JSON.stringify(e.rawData)) as Prisma.InputJsonValue,
        },
      });
    }
  }
  const newAliases = await registerCargosFromExcel();
  console.log("planilla upload:", up1.rowCount, "rows; new aliases:", newAliases);

  // --- rig import simulation ---
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.readFile("data-samples/detailed-intervals-cost-report_20260701-20260731.xlsx");
  const parsed2 = parseRigIntervals(wb2);
  const up2 = await db.excelUpload.create({
    data: {
      fileName: "TEST rig.xlsx",
      kind: "rig_intervals",
      rowCount: parsed2.sheets.reduce((n, s) => n + s.rows.length, 0),
      sheetCount: parsed2.sheets.length,
    },
  });
  for (const sheet of parsed2.sheets) {
    for (const row of sheet.rows) {
      const rig = await db.rig.upsert({
        where: { code: `rig:${row.rigName}` },
        create: { name: `Rig ${row.rigName}`, code: `rig:${row.rigName}` },
        update: { name: `Rig ${row.rigName}` },
      });
      await db.rigShiftPerformance.upsert({
        where: { rigId_date_shift: { rigId: rig.id, date: new Date(row.date), shift: row.shift } },
        create: {
          rigId: rig.id,
          uploadId: up2.id,
          date: new Date(row.date),
          shift: row.shift,
          hole: row.hole,
          metersDrilled: row.metersDrilled ?? 0,
          hoursSpent: row.hoursSpent,
          intervals: JSON.parse(JSON.stringify(row.intervals)) as Prisma.InputJsonValue,
          rawData: JSON.parse(JSON.stringify(row.rawData)) as Prisma.InputJsonValue,
        },
        update: {
          uploadId: up2.id,
          hole: row.hole,
          metersDrilled: row.metersDrilled ?? 0,
          hoursSpent: row.hoursSpent,
          intervals: JSON.parse(JSON.stringify(row.intervals)) as Prisma.InputJsonValue,
          rawData: JSON.parse(JSON.stringify(row.rawData)) as Prisma.InputJsonValue,
        },
      });
    }
  }
  console.log("rig upload:", up2.rowCount, "rows");

  // summary
  const entries = await db.dailyCrewEntry.count({ where: { uploadId: up1.id } });
  const withTurno = await db.dailyCrewEntry.count({ where: { uploadId: up1.id, turnoAB: "A" } });
  const night = await db.dailyCrewEntry.count({ where: { uploadId: up1.id, shiftDayNight: "night" } });
  const perfs = await db.rigShiftPerformance.count({ where: { uploadId: up2.id } });
  console.log({ entries, withTurnoA: withTurno, night, rigPerfRows: perfs });

  // cleanup test uploads (cascades entries)
  await db.excelUpload.delete({ where: { id: up1.id } });
  await db.rigShiftPerformance.deleteMany({ where: { uploadId: up2.id } });
  await db.excelUpload.delete({ where: { id: up2.id } });
  console.log("cleanup done");
  await db.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
