import "dotenv/config";
import ExcelJS from "exceljs";

/**
 * Dumps a sheet's REAL cell grid (address -> value) plus the workbook's merged
 * ranges, so we can tell a genuine name from a merged-cell artifact.
 * Usage: npx tsx scripts/tmp-sheet-grid.ts <file> <sheetName> [fromRow] [toRow]
 */
async function main() {
  const file = process.argv[2] ?? "data-samples/PLANILLA DIARIA RECON DRILLING AGOSTO 2026 coipa.xlsx";
  const sheetName = process.argv[3];
  const from = Number(process.argv[4] ?? 1);
  const to = Number(process.argv[5] ?? 40);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = sheetName ? wb.getWorksheet(sheetName) : wb.worksheets[0];
  if (!ws) throw new Error(`Sheet "${sheetName}" not found. Sheets: ${wb.worksheets.map((w) => w.name).join(", ")}`);

  console.log(`FILE "${file}" SHEET "${ws.name}" rows=${ws.rowCount} cols=${ws.columnCount}`);
  const merges = (ws.model as unknown as { merges?: string[] }).merges ?? [];
  console.log(`MERGES (${merges.length}): ${merges.slice(0, 60).join(", ")}`);

  for (let r = from; r <= Math.min(to, ws.rowCount); r++) {
    const row = ws.getRow(r);
    const parts: string[] = [];
    for (let c = 1; c <= Math.min(ws.columnCount, 14); c++) {
      const cell = row.getCell(c);
      const v = cell.value;
      let text: string;
      if (v == null) text = "";
      else if (typeof v === "object" && "richText" in (v as object)) {
        text = ((v as { richText: Array<{ text: string }> }).richText ?? []).map((t) => t.text).join("");
      } else if (typeof v === "object" && "result" in (v as object)) {
        text = String((v as { result?: unknown }).result ?? "");
      } else if (v instanceof Date) {
        text = v.toISOString().slice(0, 10);
      } else {
        text = String(v);
      }
      const master = cell.isMerged ? `(master=${cell.master.address})` : "";
      if (text.trim() !== "" || master) parts.push(`${cell.address}=${JSON.stringify(text)}${master}`);
    }
    if (parts.length) console.log(`r${r}: ${parts.join(" | ")}`);
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
