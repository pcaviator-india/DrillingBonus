import "dotenv/config";
import ExcelJS from "exceljs";

/**
 * Scans EVERY sheet of a workbook for cells containing any of the given
 * fragments and prints the surrounding row (real cell addresses), so we can
 * see which sheet/machine a person is listed under and with which cargo/RUT.
 * Usage: npx tsx scripts/tmp-find-ariel.ts <file> ARIEL SILVA LISBOA 15613806 14156135
 */
async function main() {
  const file = process.argv[2] ?? "data-samples/PLANILLA DIARIA RECON DRILLING AGOSTO 2026 coipa.xlsx";
  const frags = (process.argv.slice(3).length ? process.argv.slice(3) : ["ARIEL", "SILVA", "LISBOA"]).map((f) => f.toUpperCase());

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  console.log(`FILE "${file}" — ${wb.worksheets.length} sheets`);
  console.log(`Sheets: ${wb.worksheets.map((w) => w.name).join(", ")}`);

  for (const ws of wb.worksheets) {
    const hits: Array<{ row: number; text: string }> = [];
    ws.eachRow((row, rowNum) => {
      const rowText = `r${rowNum}: `;
      const rowTextParts: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        const v = cell.value;
        if (v == null) return;
        const text = typeof v === "object" && v !== null && "richText" in (v as object)
          ? ((v as { richText: Array<{ text: string }> }).richText ?? []).map((t) => t.text).join("")
          : typeof v === "object" && v !== null && "result" in (v as object)
            ? String((v as { result?: unknown }).result ?? "")
            : v instanceof Date
              ? v.toISOString().slice(0, 10)
              : String(v);
        rowTextParts.push(`${cell.address}=${JSON.stringify(text)}`);
      });
      const text = rowTextParts.join(" | ");
      if (frags.some((f) => text.toUpperCase().includes(f))) hits.push({ row: rowNum, text });
      void rowText;
    });
    if (hits.length) {
      console.log(`\n=== SHEET "${ws.name}" (rows=${ws.rowCount}) — ${hits.length} hits ===`);
      for (const h of hits) console.log(`  ${h.text.slice(0, 700)}`);
    }
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
