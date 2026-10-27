import type { Workbook } from "exceljs";
import { normalizeText } from "./normalize";
import { cellText } from "./planilla-diaria";

/**
 * Detects the kind of an uploaded Excel workbook.
 *  - "planilla_diaria": sheets contain a header row with RUT
 *  - "rig_intervals":   sheets have a row with Date | Hole | Shift columns
 */
export type ExcelKind = "planilla_diaria" | "rig_intervals" | "unknown";

export function detectWorkbookKind(wb: Workbook): ExcelKind {
  for (const ws of wb.worksheets) {
    const colCount = Math.max(ws.columnCount, 16);
    let hasRutHeader = false;
    let hasRigHeader = false;
    for (let r = 1; r <= Math.min(ws.rowCount, 10); r++) {
      const row = ws.getRow(r);
      for (let c = 1; c <= colCount; c++) {
        const v = normalizeText(cellText(row.getCell(c).value));
        if (v === "RUT") hasRutHeader = true;
        if (v === "DATE" || v === "HOLE" || v === "SHIFT") hasRigHeader = true;
      }
      if (hasRutHeader) return "planilla_diaria";
    }
    if (hasRigHeader) return "rig_intervals";
  }
  return "unknown";
}
