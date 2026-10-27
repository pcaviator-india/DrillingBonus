import "dotenv/config";
import ExcelJS from "exceljs";
import { detectWorkbookKind } from "../src/lib/excel/detect-kind";
import { parsePlanillaDiaria } from "../src/lib/excel/planilla-diaria";
import { parseRigIntervals } from "../src/lib/excel/rig-intervals";

async function main() {
  for (const f of [
    "data-samples/PLANILLA DIARIA RECON DRILLING AGOSTO 2026.xlsx",
    "data-samples/detailed-intervals-cost-report_20260701-20260731.xlsx",
  ]) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(f);
    const kind = detectWorkbookKind(wb);
    console.log("\n===", f, "-> kind:", kind);
    if (kind === "planilla_diaria") {
      const parsed = parsePlanillaDiaria(wb);
      console.log("sheets:", parsed.sheets.length);
      const s = parsed.sheets[0];
      console.log("first sheet:", s?.sheetName, s?.date, s?.projectName, "entries:", s?.entries.length, "warnings:", s?.warnings);
      for (const e of s?.entries.slice(0, 3) ?? []) {
        console.log("  ", e.orderNumber, e.rutNormalized, e.fullName.slice(0, 20), "|", e.cargoNormalized, "|", e.turnoAB, e.shiftDayNight, "| metros:", e.metros, "| in/out:", e.workeraMarkedIn, e.workeraMarkedOut);
      }
      // count day vs night across all sheets, distinct cargos
      let day = 0, night = 0;
      const cargos = new Map<string, number>();
      for (const sh of parsed.sheets)
        for (const e of sh.entries) {
          if (e.shiftDayNight === "day") day++;
          else night++;
          cargos.set(e.cargoNormalized, (cargos.get(e.cargoNormalized) ?? 0) + 1);
        }
      console.log("total entries:", day + night, "day:", day, "night:", night);
      console.log("distinct cargos:", [...cargos.keys()].sort().join(", "));
    } else if (kind === "rig_intervals") {
      const parsed = parseRigIntervals(wb);
      for (const s of parsed.sheets) {
        console.log("rig sheet:", s.sheetName, "rows:", s.rows.length, "warnings:", s.warnings);
        for (const r of s.rows.slice(0, 4)) {
          console.log("  ", r.date, r.shift, r.hole, "meters:", r.metersDrilled, "hours:", r.hoursSpent, "drillingH:", r.drillingHours);
          for (const i of r.intervals) {
            console.log("     interval:", i.band, "| escala:", i.escala, "| diameter:", i.diameter, "| meters:", i.meters);
          }
        }
      }
    }
  }
}
main();
