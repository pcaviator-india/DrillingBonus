import "dotenv/config";
import ExcelJS from "exceljs";

/** Greps the Coipa August planilla for rows mentioning ARIEL (both people). */
async function main() {
  const file = process.argv[2] ?? "data-samples/PLANILLA DIARIA RECON DRILLING AGOSTO 2026 coipa.xlsx";
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  wb.eachSheet((sheet) => {
    let hits = 0;
    sheet.eachRow((row, rowNum) => {
      const vals = row.values as unknown[];
      const text = vals.map((v) => String(v ?? "")).join(" | ");
      if (/ARIEL/i.test(text)) {
        if (hits === 0) console.log(`\n=== SHEET "${sheet.name}" ===`);
        console.log(`  r${rowNum}: ${text.slice(0, 300)}`);
        hits++;
      }
    });
    if (hits === 0) console.log(`SHEET "${sheet.name}": no ARIEL hits`);
  });
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
