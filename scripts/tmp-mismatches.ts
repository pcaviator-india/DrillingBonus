import "dotenv/config";
import ExcelJS from "exceljs";

/** For the Coipa planilla: every row whose RUT belongs to a Coipa employee but whose
 *  name differs (RUT/name mismatches that mis-attribute crew rows). */
async function main() {
  const { db } = await import("../src/lib/db");
  const { normalizeRut, normalizeText } = await import("../src/lib/excel/normalize");
  const coipa = await db.site.findFirst({ where: { name: "Proyecto La Coipa" } });
  const emps = await db.employee.findMany({ where: { siteId: coipa?.id }, select: { rut: true, fullName: true, jobPositionName: true } });
  const byRut = new Map<string, { fullName: string; job: string | null }>();
  for (const e of emps) if (e.rut) byRut.set(normalizeRut(e.rut), { fullName: e.fullName, job: e.jobPositionName });

  const file = process.argv[2] ?? "data-samples/PLANILLA DIARIA RECON DRILLING AGOSTO 2026 coipa.xlsx";
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  let mismatches = 0;
  wb.eachSheet((sheet) => {
    sheet.eachRow((row, rowNum) => {
      const vals = Array.from(row.values as unknown[], (v) => (v == null ? "" : String(v).trim()));
      // find a cell that normalizes to a known employee RUT
      for (const cell of vals) {
        const rut = cell.replace(/[^0-9kK]/g, "");
        if (rut.length < 8) continue;
        const norm = normalizeRut(cell);
        const emp = byRut.get(norm);
        if (!emp) continue;
        // find name cells: any cell with >= 2 words that isn't the RUT
        const nameLike = vals.filter((v) => /\s/.test(v) && v.length > 5 && !/^[0-9]/.test(v));
        const empNorm = normalizeText(emp.fullName);
        const nameMatches = nameLike.some((n) => normalizeText(n) === empNorm);
        if (!nameMatches) {
          mismatches++;
          console.log(`MISMATCH [${sheet.name}] r${rowNum}: RUT ${cell} belongs to "${emp.fullName}" (${emp.job}) but name cell(s)=${JSON.stringify(nameLike.slice(0, 3))}`);
        }
        break;
      }
    });
  });
  console.log(`\nTotal RUT/name mismatches: ${mismatches}`);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
