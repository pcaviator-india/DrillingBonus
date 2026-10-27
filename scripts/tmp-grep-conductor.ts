import "dotenv/config";
import ExcelJS from "exceljs";

/** Lists CONDUCTOR rows + both Ariels' RUTs in sheets dated >= 19-08. */
async function main() {
  const file = process.argv[2] ?? "data-samples/PLANILLA DIARIA RECON DRILLING AGOSTO 2026 coipa.xlsx";
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  wb.eachSheet((sheet) => {
    if (!/^(19|2[0-9]|3[01])-08-2026$/.test(sheet.name)) return;
    let header = 0;
    sheet.eachRow((row, rowNum) => {
      const vals = row.values as unknown[];
      const text = vals.map((v) => String(v ?? "")).join(" | ");
      if (/CONDUCTOR|CHOFER/i.test(text)) {
        if (header === 0) console.log(`\n=== SHEET "${sheet.name}" ===`);
        console.log(`  r${rowNum}: ${text.slice(0, 260)}`);
        header++;
      }
      if (/15613806|14156135/i.test(text)) {
        console.log(`  [RUT-HIT] r${rowNum}: ${text.slice(0, 260)}`);
      }
    });
    if (header === 0) console.log(`SHEET "${sheet.name}": no CONDUCTOR/CHOFER rows`);
  });
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
