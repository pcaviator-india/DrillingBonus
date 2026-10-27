import type { Workbook, Worksheet } from "exceljs";
import { cellText } from "./planilla-diaria";
import { isNonProductiveInterval } from "@/lib/bonus-engine/rate-config";

/**
 * Parser for "Drilling Intervals / detailed intervals cost report" workbooks:
 * one sheet per rig (sheet name = rig identifier, e.g. "740-14").
 * Rows 1-3: grouped headers (Drilling Intervals / Time Activities / Consumables).
 * Row 4: Date | Hole | Shift | Metre... | Hour... | consumable units...
 * Data from row 5. One row per date+shift.
 */

export type ParsedRigInterval = {
  band: string; // raw band header, e.g. "HQ (0.00 - 200.00)"
  escala: string | null; // normalized depth range like planilla ESCALA, e.g. "0-200"
  diameter: string | null; // bit size from header row 2, e.g. "HQ"
  meters: number;
};

export type ParsedRigRow = {
  sheetName: string;
  rigName: string;
  date: string; // ISO yyyy-MM-dd
  shift: "day" | "night";
  hole: string | null;
  metersDrilled: number | null; // sum of all "Metre" interval columns
  hoursSpent: number | null; // sum of all "Hour" activity columns
  drillingHours: number | null; // the "Drilling" hour column if present
  intervals: ParsedRigInterval[]; // meters per drilling interval band (escala equivalent)
  rawData: Record<string, unknown>; // every column by resolved header
};

export type ParsedRigIntervals = {
  sheets: { sheetName: string; rows: ParsedRigRow[]; warnings: string[] }[];
};

function toIsoDate(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = cellText(value);
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime()) && s.length >= 8) return parsed.toISOString().slice(0, 10);
  return null;
}

function normalizeShift(value: string): "day" | "night" | null {
  const v = value.trim().toLowerCase();
  if (v.startsWith("day") || v === "día" || v === "dia") return "day";
  if (v.startsWith("night") || v === "noche") return "night";
  return null;
}

function resolveHeaders(ws: Worksheet): string[] {
  // Column name = row4 (Date/Hole/Shift/Metre/Hour/...) or rows 2-3 for named activities.
  const names: string[] = [];
  const colCount = Math.max(ws.columnCount, 10);
  for (let c = 1; c <= colCount; c++) {
    const r4 = cellText(ws.getRow(4).getCell(c).value);
    const r3 = cellText(ws.getRow(3).getCell(c).value);
    const r2 = cellText(ws.getRow(2).getCell(c).value);
    let name = r4;
    if (!name || name === "Metre" || name === "Hour") {
      name = r3 || r2 || name || r4;
    }
    names.push(name.trim());
  }
  return names;
}

/** "HQ (0.00 - 200.00)" -> escala-style "0-200" (like planilla ESCALA "500-1000"). */
export function normalizeEscala(band: string): string | null {
  const m = band.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const from = Number.parseFloat(m[1]);
  const to = Number.parseFloat(m[2]);
  return `${Math.round(from)}-${Math.round(to)}`;
}

export function parseRigIntervals(wb: Workbook): ParsedRigIntervals {
  const sheets: ParsedRigIntervals["sheets"] = [];

  for (const ws of wb.worksheets) {
    const warnings: string[] = [];
    const headers = resolveHeaders(ws);

    // Classify columns
    const metreCols: number[] = [];
    const hourCols: number[] = [];
    let drillingHourCol = -1;
    let dateCol = -1;
    let holeCol = -1;
    let shiftCol = -1;
    // Per-metre-column drilling interval info (row 3 band like "HQ (0.00 - 200.00)", row 2 diameter "HQ")
    const metreBand = new Map<number, string>();
    const metreDiameter = new Map<number, string>();

    for (let c = 1; c <= headers.length; c++) {
      const r4 = cellText(ws.getRow(4).getCell(c).value).toLowerCase();
      const h3 = cellText(ws.getRow(3).getCell(c).value);
      const h2 = cellText(ws.getRow(2).getCell(c).value);
      if (r4 === "date") dateCol = c;
      else if (r4 === "hole") holeCol = c;
      else if (r4 === "shift") shiftCol = c;
      else if (r4 === "metre") {
        metreCols.push(c);
        // Band: prefer row 3 ("HQ (0.00 - 200.00)"), fall back to row 2 ("HQ")
        const band = h3 && h3 !== "Metre" ? h3 : h2 || h3 || "";
        metreBand.set(c, band.trim());
        const diameter = h2 && h2 !== "Metre" && h2 !== h3 ? h2.trim() : null;
        if (diameter) metreDiameter.set(c, diameter);
      } else if (r4 === "hour") {
        hourCols.push(c);
        if (h3.toLowerCase().startsWith("drilling")) drillingHourCol = c;
        else if (h2.toLowerCase().startsWith("drilling")) drillingHourCol = c;
      }
    }

    if (dateCol === -1 || holeCol === -1 || shiftCol === -1) {
      warnings.push(`Sheet "${ws.name}" does not look like a rig intervals report, skipped`);
      continue;
    }

    const rows: ParsedRigRow[] = [];
    for (let r = 5; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const date = toIsoDate(row.getCell(dateCol).value);
      if (!date) continue;
      const shift = normalizeShift(cellText(row.getCell(shiftCol).value));
      if (!shift) continue;

      const rawData: Record<string, unknown> = { row: r };
      const intervals: ParsedRigInterval[] = [];
      let meters = 0;
      let hasMeters = false;
      for (const c of metreCols) {
        const v = row.getCell(c).value;
        rawData[headers[c - 1] ?? `col${c}`] = v;
        const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
        if (Number.isFinite(n)) {
          const band = metreBand.get(c) ?? `col${c}`;
          const diameter = metreDiameter.get(c) ?? null;
          // Non-productive passes (e.g. "Grouting HQ" = re-clearing an
          // already-drilled hole) are kept in rawData for traceability but
          // never count as drilled metres.
          if (isNonProductiveInterval(band, diameter)) continue;
          meters += n;
          hasMeters = true;
          if (n !== 0) {
            intervals.push({
              band,
              escala: normalizeEscala(band),
              diameter,
              meters: n,
            });
          }
        }
      }
      let hours = 0;
      let hasHours = false;
      for (const c of hourCols) {
        const v = row.getCell(c).value;
        rawData[headers[c - 1] ?? `col${c}`] = v;
        const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
        if (Number.isFinite(n)) {
          hours += n;
          hasHours = true;
        }
      }
      // store non-metre/hour headers too (consumables etc.)
      for (let c = 1; c <= headers.length; c++) {
        if (metreCols.includes(c) || hourCols.includes(c)) continue;
        if (c === dateCol || c === holeCol || c === shiftCol) continue;
        const v = row.getCell(c).value;
        if (v !== null && v !== undefined && v !== "") {
          rawData[headers[c - 1] ?? `col${c}`] = v;
        }
      }

      const drillingHours =
        drillingHourCol > 0
          ? (() => {
              const v = row.getCell(drillingHourCol).value;
              const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
              return Number.isFinite(n) ? n : null;
            })()
          : null;

      rows.push({
        sheetName: ws.name,
        rigName: ws.name,
        date,
        shift,
        hole: cellText(row.getCell(holeCol).value) || null,
        metersDrilled: hasMeters ? meters : null,
        hoursSpent: hasHours ? hours : null,
        drillingHours,
        intervals,
        rawData,
      });
    }

    sheets.push({ sheetName: ws.name, rows, warnings });
  }

  return { sheets };
}
