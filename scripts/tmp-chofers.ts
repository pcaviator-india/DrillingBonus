import "dotenv/config";
import { db } from "../src/lib/db";
import ExcelJS from "exceljs";
import { normalizeRut, normalizeText } from "../src/lib/excel/normalize";

/**
 * Dumps every CHOFER/CONDUCTOR row of a planilla (row, RUT, written name,
 * registry name of that RUT, and the registry name of the neighbouring rows)
 * to expose stale RUTs / shifted rows in the source file.
 *
 * Usage: npx tsx scripts/tmp-chofers.ts <file> [sheetLimit] [cargoRegex]
 */
async function main() {
  const file = process.argv[2] ?? "data-samples/PLANILLA DIARIA RECON DRILLING AGOSTO 2026 coipa.xlsx";
  const cargoRegex = new RegExp(process.argv[3] ?? "CHOFER|CONDUCTOR", "i");

  const emps = await db.employee.findMany({ select: { fullName: true, rut: true, jobPositionName: true } });
  const byRut = new Map(
    emps.filter((e) => e.rut).map((e) => [normalizeRut(e.rut as string), `${e.fullName} (${e.jobPositionName ?? "-"})`]),
  );

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);

  for (const ws of wb.worksheets) {
    type Row = { row: number; rut: string; rutNorm: string; name: string; cargo: string };
    const rows: Row[] = [];
    ws.eachRow((row, rowNum) => {
      const rawRut = row.getCell(2).value;
      const rawName = row.getCell(3).value;
      const rawCargo = row.getCell(6).value;
      if (rawRut == null || rawName == null || rawCargo == null) return;
      const rut = String(rawRut).trim();
      if (!/^\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]$/.test(rut)) return;
      rows.push({
        row: rowNum,
        rut,
        rutNorm: normalizeRut(rut),
        name: String(rawName).trim(),
        cargo: String(rawCargo).trim(),
      });
    });

    const hits = rows.filter((r) => cargoRegex.test(normalizeText(r.cargo)));
    if (hits.length === 0) continue;

    console.log(`\n=== SHEET ${ws.name} — ${hits.length} ${cargoRegex.source} row(s) ===`);
    for (const h of hits) {
      const registry = byRut.get(h.rutNorm) ?? "(RUT NOT IN REGISTRY)";
      const nameMatch = registry.toUpperCase().startsWith(normalizeText(h.name)) ? "OK" : "MISMATCH";
      // offset test: which row's RUT resolves to the name written here?
      const owner = rows.find((r) => byRut.get(r.rutNorm)?.toUpperCase().startsWith(normalizeText(h.name)) && h.name.length > 8);
      console.log(
        `  r${h.row} rut=${h.rut.padEnd(12)} written="${h.name}" | registry for rut="${registry}" [${nameMatch}]${owner ? ` | written name belongs to RUT ${owner.rut} (row r${owner.row}, cargo ${owner.cargo})` : ""}`,
      );
    }
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
