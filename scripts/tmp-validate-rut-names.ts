import "dotenv/config";
import { db } from "../src/lib/db";
import ExcelJS from "exceljs";
import { normalizeRut, normalizeText } from "../src/lib/excel/normalize";

/**
 * Validates the planilla's RUT <-> NOMBRE pairing against the employee registry
 * (Workera), per sheet/row, and tests the "RUT column shifted by one row"
 * hypothesis (common when rows are copy-pasted in the source file).
 *
 * Usage: npx tsx scripts/tmp-validate-rut-names.ts <file> [sheet...]
 */
async function main() {
  const file = process.argv[2] ?? "data-samples/PLANILLA DIARIA RECON DRILLING AGOSTO 2026 coipa.xlsx";
  const wantedSheets = process.argv.slice(3);

  const emps = await db.employee.findMany({ select: { fullName: true, rut: true } });
  const byRut = new Map(emps.filter((e) => e.rut).map((e) => [normalizeRut(e.rut as string), normalizeText(e.fullName)]));

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);

  type Pair = { row: number; rut: string; rutNorm: string; name: string; nameNorm: string; cargo: string };
  const sheets = wb.worksheets.filter((w) => wantedSheets.length === 0 || wantedSheets.includes(w.name));
  let totalRows = 0;
  let nameMatchesRut = 0;
  let nameIsOtherEmployee = 0;
  let rutUnknown = 0;
  const offsetEvidence: string[] = [];
  const suspicious: string[] = [];

  for (const ws of sheets) {
    const pairs: Pair[] = [];
    ws.eachRow((row, rowNum) => {
      const rawRut = row.getCell(2).value;
      const rawName = row.getCell(3).value;
      const rawCargo = row.getCell(6).value;
      const rut = rawRut == null ? "" : String(rawRut).trim();
      const name = rawName == null ? "" : String(rawName).trim();
      const cargo = rawCargo == null ? "" : String(rawCargo).trim();
      if (!rut || !name) return;
      if (!/^\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]$/.test(rut)) return;
      pairs.push({ row: rowNum, rut, rutNorm: normalizeRut(rut), name, nameNorm: normalizeText(name), cargo });
    });

    for (const p of pairs) {
      totalRows++;
      const expected = byRut.get(p.rutNorm);
      if (!expected) rutUnknown++;
      else if (expected === p.nameNorm) nameMatchesRut++;
      else {
        nameIsOtherEmployee++;
        suspicious.push(
          `[${ws.name}] r${p.row} RUT ${p.rut} -> registry="${expected}" but file wrote "${p.name}" (cargo ${p.cargo})`,
        );
      }
    }

    // Offset test: does the RUT of a row match the NAME of the NEXT row?
    for (let i = 0; i < pairs.length - 1; i++) {
      const a = pairs[i];
      const b = pairs[i + 1];
      if (byRut.get(b.rutNorm) === a.nameNorm) offsetEvidence.push(`[${ws.name}] name r${a.row} "${a.name}" matches RUT of r${b.row} (${b.rut})`);
    }
  }

  console.log(`FILE ${file}`);
  console.log(`Checked ${totalRows} RUT/name rows across ${sheets.length} sheets`);
  console.log(`  RUT matches the written name (OK)      : ${nameMatchesRut}`);
  console.log(`  RUT belongs to a DIFFERENT employee    : ${nameIsOtherEmployee}`);
  console.log(`  RUT not in the employee registry       : ${rutUnknown}`);
  if (offsetEvidence.length) {
    console.log(`\nROW-OFFSET evidence (${offsetEvidence.length}) — name of row X carries RUT of row X+1:`);
    for (const e of offsetEvidence.slice(0, 40)) console.log(`  ${e}`);
  }
  if (suspicious.length) {
    console.log(`\nSUSPICIOUS rows (first 40 of ${suspicious.length}):`);
    for (const s of suspicious.slice(0, 40)) console.log(`  ${s}`);
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
