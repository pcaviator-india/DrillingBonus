import fs from "fs";
import ExcelJS from "exceljs";
import { detectWorkbookKind } from "@/lib/excel/detect-kind";
import { parsePlanillaDiaria } from "@/lib/excel/planilla-diaria";
import { normalizeText } from "@/lib/excel/normalize";

(async () => {
  const fileName =
    "data-samples/PLANILLA DIARIA RECON DRILLING SPA TA Y TB 30-08-2026.xlsx";
  const buffer = fs.readFileSync(fileName);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const kind = detectWorkbookKind(wb);
  console.log("Detected kind:", kind);

  if (kind === "planilla_diaria") {
    const parsed = parsePlanillaDiaria(wb);
    console.log("Sheets:", parsed.sheets.length);

    // distinct machines
    const machines = new Map<
      string,
      { name: string; project: string | null }
    >();
    for (const sheet of parsed.sheets) {
      for (const e of sheet.entries) {
        if (!e.machine) continue;
        const key = normalizeText(e.machine);
        if (!machines.has(key)) {
          machines.set(key, { name: e.machine.trim(), project: sheet.projectName });
        }
      }
    }
    console.log("Distinct machines:", machines.size);
    for (const [_k, v] of machines) {
      console.log("  ", v.name, "<-", v.project);
    }
  } else {
    console.log("Not a planilla file — skip");
  }
})();
