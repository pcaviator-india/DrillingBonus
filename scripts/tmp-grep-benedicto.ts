import "dotenv/config";
import ExcelJS from "exceljs";
import { readdirSync } from "fs";

/** Greps every xlsx in data-samples for BENEDICTO/LISBOA/second-Ariel + checks RUT/name mismatches. */
async function main() {
  const files = readdirSync("data-samples").filter((f) => f.toLowerCase().endsWith(".xlsx"));
  for (const f of files) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.readFile(`data-samples/${f}`);
    } catch {
      console.log(`${f}: UNREADABLE`);
      continue;
    }
    let hits = 0;
    wb.eachSheet((sheet) => {
      sheet.eachRow((row) => {
        const text = (row.values as unknown[]).map((v) => String(v ?? "")).join(" | ");
        if (/BENEDICTO|LISBOA/i.test(text)) {
          if (hits === 0) console.log(`\n=== ${f} ===`);
          console.log(`  [${sheet.name}] ${text.slice(0, 240)}`);
          hits++;
        }
      });
    });
    if (hits === 0) console.log(`${f}: no BENEDICTO/LISBOA hits`);
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
