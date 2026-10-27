import "dotenv/config";
import ExcelJS from "exceljs";
import { normalizeRut } from "../src/lib/excel/normalize";
import { db } from "../src/lib/db";

/**
 * For a workbook, prints every sheet row of the turns whose RUT is one of the
 * given RUTs (columns: ORD | RUT | NOMBRE | CARGO | MAQUINA), cross-checked with
 * the registered employee. Reveals RUT/name pool errors in the source file.
 *
 * Usage: npx tsx scripts/tmp-rut-pool.ts <file> <rut> [rut...]
 */
async function main() {
  const file = process.argv[2];
  const ruts = process.argv.slice(3).map((r) => normalizeRut(r));
  if (!file || ruts.length === 0) throw new Error("usage: tmp-rut-pool.ts <file> <rut...>");

  const employees = await db.employee.findMany({ select: { fullName: true, rut: true, jobPositionName: true } });
  const byRut = new Map(employees.filter((e) => e.rut).map((e) => [normalizeRut(e.rut as string), e]));

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  console.log(`FILE "${file}" — ${wb.worksheets.length} sheets; looking for ${ruts.join(", ")}`);
  for (const r of ruts) {
    const reg = byRut.get(r);
    console.log(`  RUT ${r} registered to: ${reg ? `"${reg.fullName}" (${reg.jobPositionName ?? "-"})` : "(NOT REGISTERED)"}`);
  }

  for (const ws of wb.worksheets) {
    const hits: string[] = [];
    ws.eachRow({ includeEmpty: true }, (row, rowNum) => {
      const rutCell = row.getCell(2).value;
      if (rutCell == null) return;
      const rutText = String(rutCell);
      const normalized = normalizeRut(rutText);
      if (!ruts.includes(normalized)) return;
      const name = String(row.getCell(3).value ?? "").trim();
      const cargo = String(row.getCell(6).value ?? "").trim();
      const machine = String(row.getCell(9).value ?? "").trim();
      const meters = String(row.getCell(12).value ?? "").trim();
      const regName = byRut.get(normalized)?.fullName ?? "(unregistered)";
      const flag = name.toUpperCase().split(/\s+/).some((t) => t.length > 3 && regName.toUpperCase().includes(t)) ? "ok " : "MISMATCH";
      hits.push(`    r${rowNum} #${row.getCell(1).value} rut=${rutText} name="${name}" cargo="${cargo}" maq="${machine}" m=${meters} | reg="${regName}" ${flag}`);
    });
    if (hits.length) console.log(`  [${ws.name}]\n${hits.join("\n")}`);
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
