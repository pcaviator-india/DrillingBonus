import type { Workbook } from "exceljs";
import { parseDecimal, normalizeRut, normalizeText } from "./normalize";

/**
 * Parser for "PLANILLA DIARIA" workbooks: one sheet per day per site.
 * Structure per sheet:
 *  - Row 1: "PROYECTO:" <site>, DIA/MES/AÑO columns
 *  - Section rows containing "TURNO ..." in column A/B separate crew blocks.
 *    The sheet declares its crew ("TURNO A" or "TURNO B") and then has a day
 *    block AND a night block for that same crew (the night block is labeled
 *    just "TURNO NOCHE"), so the night block inherits the declared letter.
 *  - Header row with RUT | NOMBRE COMPLETO | CARGO | MAQUINA | DIAMETRO | ESCALA |
 *    METROS | ASISTENCIA | WORKERA ENTRADA | WORKERA SALIDA | OBSERVACIONES
 *
 * Header spellings vary by site/era and are resolved by alias, e.g.:
 *   name   : "NOMBRE COMPLETO" (legacy) | "NOMBRES Y APELLIDOS" (new)
 *   diam   : "DIAMATRO" (legacy typo)  | "DIAMETRO" (new)
 *   notes  : "MOTIVO HORAS EXTRA"      | "OBSERVACIONES" (new)
 *   order  : "N°" | "#"
 * A single employee may occupy SEVERAL rows in one shift when they drill
 * different ESCALA (depth bands); each row keeps its own meters and the
 * ASISTENCIA marker appears only on the first (primary) row.
 */

export type ParsedPlanillaEntry = {
  sheetName: string;
  date: string; // ISO yyyy-MM-dd
  projectName: string | null;
  orderNumber: number | null;
  rut: string;
  rutNormalized: string;
  fullName: string;
  cargoRaw: string;
  cargoNormalized: string;
  machine: string | null;
  diameter: string | null;
  escala: string | null;
  metros: number | null;
  horasExtras: number | null;
  workeraMarkedIn: boolean | null;
  workeraMarkedOut: boolean | null;
  motivoHorasExtra: string | null;
  /**
   * ASISTENCIA column (new format). Raw + normalized presence marker:
   * "PRESENTE" | "DESCANSO" | "AUSENTE" | "OBSERVACIÓN".
   * NOTE: only the PRIMARY row of an employee+shift carries this; continuation
   * rows (same employee, different ESCALA) leave it blank and inherit the
   * primary value at aggregation time.
   */
  asistenciaRaw: string | null;
  asistencia: string | null;
  shiftDayNight: "day" | "night";
  turnoAB: "A" | "B" | null;
  rawData: Record<string, unknown>;
};

export type ParsedPlanillaSheet = {
  sheetName: string;
  date: string;
  projectName: string | null;
  entries: ParsedPlanillaEntry[];
  warnings: string[];
};

export type ParsedPlanilla = { sheets: ParsedPlanillaSheet[] };

export function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const obj = value as { text?: string; result?: unknown };
    if (typeof obj.text === "string") return obj.text;
    if (obj.result !== undefined) return cellText(obj.result);
    return "";
  }
  return String(value).trim();
}

/**
 * Calendar parts of an ExcelJS Date cell.
 *
 * ExcelJS materializes Excel serial dates as UTC midnight (e.g. 2026-09-01
 * becomes 2026-09-01T00:00:00.000Z). Reading them with the LOCAL getters
 * (getDate/getMonth/getFullYear) shifts the calendar day backwards in any
 * timezone west of UTC (UTC-3 in Chile -> 2026-08-31), which silently moved
 * September planilla tabs into August. The UTC getters expose the real
 * calendar date the workbook stores, so they are the only safe source here.
 */
function utcDateParts(value: Date): { year: number; month: number; day: number } {
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
  };
}

/**
 * Parse a date-like text cell ("13/9/2026", "13-9-2026", "2026-09-13") into a
 * {day, month, year} triple. Day-first is assumed first (matches the D/M/YYYY
 * cells some sites use); a year-first form is also accepted. Returns null when
 * the text is not a recognizable date. Only used to recover the YEAR (and, for
 * day-only tabs, the month) when the date cell is stored as text instead of a
 * real Date — the day/month still come from the sheet name when present.
 */
function parseTextDate(text: string): { day: number; month: number; year: number } | null {
  const t = text.trim();
  let m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (m) return { day: Number(m[1]), month: Number(m[2]), year: Number(m[3]) };
  m = t.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/);
  if (m) return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  return null;
}

/** Sheet name like "01-08-2026" or "01-08" -> ISO date, using DIA/MES/AÑO cells as fallback. */
function parseSheetDate(sheetName: string, topRowCells: unknown[][]): string | null {
  const normalizedSheetName = sheetName.trim();
  let m = normalizedSheetName.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // Day-only sheet name ("01", "02", ...): some planillas name each daily tab
  // with just the day number. The month+year then must come from the header
  // cells (a Date cell, or a legacy DIA/MES/AÑO triple), since the tab name
  // only carries the day.
  const dayOnly = normalizedSheetName.match(/^(\d{1,2})$/);
  if (dayOnly) {
    const nameDay = Number(dayOnly[1]);
    if (nameDay >= 1 && nameDay <= 31) {
      for (const cells of topRowCells) {
        // New format: a single Date cell -> year/month from it, day from the tab.
        // The Date cell holds UTC midnight, so read its UTC calendar parts.
        const dateCell = cells.find((v): v is Date => v instanceof Date);
        if (dateCell && Number.isFinite(dateCell.getTime())) {
          const { year, month: cellMonth, day: cellDay } = utcDateParts(dateCell);
          // The new format's Date cell can store a swapped month/day (cell.month
          // = the real day, cell.day = the real month). When the tab day matches
          // one of them, recover the true month accordingly.
          const month =
            cellDay === nameDay ? cellMonth : cellMonth === nameDay ? cellDay : cellMonth;
          if (month >= 1 && month <= 12) {
            return `${year}-${String(month).padStart(2, "0")}-${String(nameDay).padStart(2, "0")}`;
          }
        }
        // Legacy format: a year (>2000) plus an adjacent month (1..12) in the
        // header numbers. Works whether the header is a full DIA/MES/AÑO triple
        // or just MES/AÑO, since the day already comes from the tab name.
        const numbers = cells.filter((v): v is number => typeof v === "number");
        const yearIdx = numbers.findIndex((n) => n > 2000);
        if (yearIdx > 0) {
          const y = numbers[yearIdx];
          const mo = numbers[yearIdx - 1];
          if (mo >= 1 && mo <= 12) {
            return `${y}-${String(mo).padStart(2, "0")}-${String(nameDay).padStart(2, "0")}`;
          }
        }
        // Text date cell ("13/9/2026"): recover month+year from it for a
        // day-only tab, keeping the day from the tab name.
        const textDate = cells.reduce<{ month: number; year: number } | null>((acc, v) => {
          if (acc !== null) return acc;
          if (typeof v !== "string") return acc;
          const parsed = parseTextDate(v);
          return parsed ? { month: parsed.month, year: parsed.year } : null;
        }, null);
        if (textDate && textDate.month >= 1 && textDate.month <= 12) {
          return `${textDate.year}-${String(textDate.month).padStart(2, "0")}-${String(nameDay).padStart(2, "0")}`;
        }
      }
    }
    // Day-only name with no usable header month/year: reject (ambiguous).
    return null;
  }

  // Sheet name without year ("01-08"): day/month from the name, year from the header cells
  m = normalizedSheetName.match(/^(\d{1,2})-(\d{1,2})$/);
  const nameD = m ? Number(m[1]) : null;
  const nameMo = m ? Number(m[2]) : null;
  // Scan the top rows for the year:
  //  - legacy DIA/MES/AÑO number triple (e.g. 1 | 8 | 2026), or
  //  - a single Date cell (new format) -> take its UTC year.
  // We only trust the YEAR from the header; day+month stay authoritative from
  // the sheet name, because the new format's Date cell can carry a swapped
  // month/day (e.g. sheet "01-09" = Sept 1 but the cell stores Jan-09).
  for (const cells of topRowCells) {
    const yearFromDate = cells.reduce<number | null>((acc, v) => {
      if (acc !== null) return acc;
      if (v instanceof Date && Number.isFinite(v.getTime())) return utcDateParts(v).year;
      return acc;
    }, null);
    if (yearFromDate !== null && nameD && nameMo && nameMo >= 1 && nameMo <= 12) {
      return `${yearFromDate}-${String(nameMo).padStart(2, "0")}-${String(nameD).padStart(2, "0")}`;
    }
    // Text date cell ("13/9/2026"): some sheets store the DIA cell as text instead
    // of a real Date. Only the YEAR is trusted here; day+month stay from the name.
    const yearFromText = cells.reduce<number | null>((acc, v) => {
      if (acc !== null) return acc;
      if (typeof v !== "string") return acc;
      const parsed = parseTextDate(v);
      return parsed ? parsed.year : null;
    }, null);
    if (yearFromText !== null && nameD && nameMo && nameMo >= 1 && nameMo <= 12) {
      return `${yearFromText}-${String(nameMo).padStart(2, "0")}-${String(nameD).padStart(2, "0")}`;
    }
    const numbers = cells.filter((v) => typeof v === "number") as number[];
    const y = numbers.find((n) => n > 2000);
    if (y === undefined) continue;
    if (nameD && nameMo && nameMo >= 1 && nameMo <= 12) {
      return `${y}-${String(nameMo).padStart(2, "0")}-${String(nameD).padStart(2, "0")}`;
    }
    if (numbers.length >= 3) {
      const [d, mo] = numbers.slice(-3);
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      }
    }
  }
  // Year-less name with no header year: reject (ambiguous)
  return null;
}

type SectionState = { shiftDayNight: "day" | "night"; turnoAB: "A" | "B" | null };

/**
 * Recognizes the crew block labels used across sites:
 *   "TURNO A", "TURNO A DÍA", "TURNO B DÍA", "TURNO DIA A", "TURNO DIA B"
 *   "TURNO NOCHE" / "TURNO NIGHT" (night block; inherits the A/B letter
 *   declared earlier in the sheet)
 * The A/B letter is matched as a standalone word, so words like "DIA"/"DÍA" never
 * match while "TURNO DIA A" still yields turn A.
 */
function detectSection(label: string, current: SectionState): SectionState | null {
  const l = normalizeText(label);
  if (!l.includes("TURNO")) return null;
  const isNight = l.includes("NOCHE") || l.includes("NIGHT") || l.includes("NOCTURN");
  const m = l.match(/\b([AB])\b/);
  // A section without its own A/B letter (e.g. "TURNO NOCHE") belongs to the
  // same crew declared earlier in the sheet, so both the day and night blocks
  // of a sheet share the same turnoAB. Explicit letters (e.g. "TURNO B DÍA")
  // switch the crew.
  const turnoAB = m ? (m[1] as "A" | "B") : current.turnoAB;
  return {
    shiftDayNight: isNight ? "night" : "day",
    turnoAB,
  };
}

function looksLikeRut(value: string): boolean {
  // Accepts "12419789-9", "16.706.064-1", "122192016" (no dash), "13176765-K"
  return /^\d{1,2}\.?\d{3}\.?\d{3}-?[0-9kK]$/.test(value.trim());
}

function parseYesNo(value: string): boolean | null {
  const v = normalizeText(value);
  if (!v) return null;
  // Some sites mark the Workera columns with a check mark instead of Sí/No.
  if (v === "SI" || v === "S" || v === "YES" || v === "X" || v === "1" || v === "✓" || v === "✔") {
    return true;
  }
  if (v === "NO" || v === "N" || v === "-" || v === "0" || v === "—") return false;
  return null; // "DESCANSO", free-text reasons, etc. stay null
}

/**
 * Fallback proyecto text when the sheet has no "PROYECTO:" cell: some sites only
 * print a title such as "PLANILLA DIARIA FENIX GOLD" in the top rows. Keeping the
 * raw text means an admin can map it to a Site (config, not code).
 */
function detectProjectTitle(topRowCells: unknown[][], sheetName: string): string | null {
  const skip = new Set([
    "DIA", "MES", "ANO", "PLANILLA", "PLANILLA DIARIA", "PLANILLA DIARIA ", "PROYECTO",
    "TURNO", "#", "RUT", "NOMBRE COMPLETO", "OBSERVACIONES",
  ]);
  const sheetNorm = normalizeText(sheetName);
  for (const cells of topRowCells) {
    for (const cell of cells) {
      const t = cellText(cell).trim();
      const n = normalizeText(t);
      if (!n || skip.has(n)) continue;
      if (/^\d/.test(n)) continue; // dates / day / month / year numbers
      if (n === sheetNorm) continue;
      if (n.split(" ").length > 6) continue; // free text / notes
      return t;
    }
  }
  return null;
}

export function parsePlanillaDiaria(wb: Workbook): ParsedPlanilla {
  const sheets: ParsedPlanillaSheet[] = [];

  for (const ws of wb.worksheets) {
    const warnings: string[] = [];
    const sheetName = ws.name;

    const colCount = Math.max(ws.columnCount, 16);

    // Locate the header block: the first row containing "RUT" plus any directly
    // following row that repeats "RUT" (some planillas split the header in two,
    // e.g. "WORKERA" on one row and "ENTRADA"/"SALIDA" on the next).
    const rowHasRutHeader = (r: number): boolean => {
      const row = ws.getRow(r);
      for (let c = 1; c <= colCount; c++) {
        if (normalizeText(cellText(row.getCell(c).value)) === "RUT") return true;
      }
      return false;
    };
    let headerRow = 0;
    let headerEnd = 0;
    for (let r = 1; r <= Math.min(ws.rowCount, 20); r++) {
      if (!rowHasRutHeader(r)) continue;
      headerRow = r;
      headerEnd = r;
      while (headerEnd < r + 2 && rowHasRutHeader(headerEnd + 1)) headerEnd++;
      break;
    }
    if (!headerRow) {
      warnings.push(`No header row (RUT) found in sheet "${sheetName}", sheet skipped`);
      continue;
    }

    // Everything above the header block carries the project / date / section labels.
    const topRowCells: unknown[][] = [];
    for (let r = 1; r < headerRow; r++) {
      const cells: unknown[] = [];
      for (let c = 1; c <= colCount; c++) {
        cells.push(ws.getRow(r).getCell(c).value);
      }
      topRowCells.push(cells);
    }

    // Project name: cell after "PROYECTO:", else the sheet title text (kept raw so
    // an admin can map it to a Site through the SiteAlias registry).
    let projectName: string | null = null;
    for (const cells of topRowCells) {
      for (let i = 0; i < cells.length; i++) {
        if (normalizeText(cellText(cells[i])).startsWith("PROYECTO")) {
          projectName = cellText(cells[i + 1]) || null;
          break;
        }
      }
      if (projectName) break;
    }
    if (!projectName) projectName = detectProjectTitle(topRowCells, sheetName);

    const date = parseSheetDate(sheetName, topRowCells);
    if (!date) {
      warnings.push(`Could not determine date for sheet "${sheetName}", sheet skipped`);
      continue;
    }

    // Merged header map: single-row labels plus "<row1> <row2>" pairs, so a split
    // "WORKERA" / "ENTRADA" header resolves to "WORKERA ENTRADA".
    const headerMap = new Map<string, number>();
    {
      const headerRows: string[][] = [];
      for (let r = headerRow; r <= headerEnd; r++) {
        const labels: string[] = [];
        for (let c = 1; c <= colCount; c++) {
          labels.push(normalizeText(cellText(ws.getRow(r).getCell(c).value)));
        }
        headerRows.push(labels);
      }
      for (let c = 1; c <= colCount; c++) {
        const parts = headerRows.map((labels) => labels[c - 1]).filter((t) => t && t !== "#");
        if (parts.length === 0) continue;
        headerMap.set(parts[0], c);
        if (parts.length > 1) headerMap.set(`${parts[0]} ${parts[1]}`, c);
      }
    }

    // Section rows can appear ABOVE the header (e.g. "TURNO A" in row 4):
    // pre-scan everything before the header for section labels.
    let section: SectionState = { shiftDayNight: "day", turnoAB: null };
    let sawAnySection = false;
    for (let r = 1; r < headerRow; r++) {
      const row = ws.getRow(r);
      for (let c = 1; c <= colCount; c++) {
        const detected = detectSection(cellText(row.getCell(c).value), section);
        if (detected) {
          section = detected;
          sawAnySection = true;
          break;
        }
      }
      if (sawAnySection) break;
    }

    const col = (...names: string[]): number | undefined => {
      for (const n of names) {
        const idx = headerMap.get(normalizeText(n));
        if (idx) return idx;
      }
      return undefined;
    };
    const cRut = col("RUT") ?? 2;
    const cNombre = col("NOMBRE COMPLETO", "NOMBRES Y APELLIDOS") ?? 3;
    const cCargo = col("CARGO", "PUESTO");
    const cMaquina = col("MAQUINA", "MAQUINAS");
    const cDiametro = col("DIAMATRO", "DIAMETRO");
    const cEscala = col("ESCALA");
    const cMetros = col("METROS");
    const cHorasExtras = col("H. EXTRAS", "H EXTRAS", "HORAS EXTRAS");
    const cWIn = col("WORKERA ENTRADA");
    const cWOut = col("WORKERA SALIDA");
    const cMotivo = col("MOTIVO HORAS EXTRA", "MOTIVO HORAS EXTRAS", "OBSERVACIONES");
    const cAsistencia = col("ASISTENCIA");
    // Order number: header "N°"/"#" when present, else the first column.
    const cOrder = col("N°", "Nº", "#") ?? 1;

    const entries: ParsedPlanillaEntry[] = [];

    for (let r = headerEnd + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const firstCell = cellText(row.getCell(1).value);
      const rutCell = cellText(row.getCell(cRut).value);

      // Section separator row (TURNO A / TURNO B / TURNO NOCHE)
      const sectionLabel = firstCell || rutCell;
      const detected = detectSection(sectionLabel, section);
      if (detected) {
        section = detected;
        sawAnySection = true;
        continue;
      }
      if (!looksLikeRut(rutCell)) continue;

      const fullName = cellText(row.getCell(cNombre)).trim();
      const cargoRaw = cCargo ? cellText(row.getCell(cCargo)).trim() : "";
      if (!fullName && !cargoRaw) continue;

      const rawRecord: Record<string, unknown> = { row: r };
      if (cCargo) rawRecord["CARGO"] = row.getCell(cCargo).value;
      if (cMaquina) rawRecord["MAQUINA"] = row.getCell(cMaquina).value;
      if (cDiametro) rawRecord["DIAMATRO"] = row.getCell(cDiametro).value;
      if (cEscala) rawRecord["ESCALA"] = row.getCell(cEscala).value;
      if (cMetros) rawRecord["METROS"] = row.getCell(cMetros).value;
      if (cHorasExtras) rawRecord["H. EXTRAS"] = row.getCell(cHorasExtras).value;
      if (cWIn) rawRecord["workera entrada"] = row.getCell(cWIn).value;
      if (cWOut) rawRecord["workera salida"] = row.getCell(cWOut).value;
      if (cMotivo) rawRecord["MOTIVO HORAS EXTRA"] = row.getCell(cMotivo).value;
      if (cAsistencia) rawRecord["ASISTENCIA"] = row.getCell(cAsistencia).value;

      // Order number: prefer the dedicated "N°" column, fall back to col 1.
      const orderCell = cellText(row.getCell(cOrder).value);
      const orderNum = parseDecimal(orderCell) ?? parseDecimal(firstCell);
      const meters = cMetros ? parseDecimal(row.getCell(cMetros).value) : null;
      const horasExtras = cHorasExtras ? parseDecimal(row.getCell(cHorasExtras).value) : null;
      const asistenciaRaw = cAsistencia ? cellText(row.getCell(cAsistencia).value).trim() || null : null;

      entries.push({
        sheetName,
        date,
        projectName,
        orderNumber: orderNum !== null ? Math.round(orderNum) : null,
        rut: rutCell.trim(),
        rutNormalized: normalizeRut(rutCell),
        fullName,
        cargoRaw,
        cargoNormalized: normalizeText(cargoRaw),
        machine: cMaquina ? cellText(row.getCell(cMaquina)).trim() || null : null,
        diameter: cDiametro ? cellText(row.getCell(cDiametro)).trim() || null : null,
        escala: cEscala ? cellText(row.getCell(cEscala)).trim() || null : null,
        metros: meters,
        horasExtras,
        workeraMarkedIn: cWIn ? parseYesNo(cellText(row.getCell(cWIn))) : null,
        workeraMarkedOut: cWOut ? parseYesNo(cellText(row.getCell(cWOut))) : null,
        motivoHorasExtra: cMotivo ? cellText(row.getCell(cMotivo)).trim() || null : null,
        asistenciaRaw,
        asistencia: asistenciaRaw ? normalizeText(asistenciaRaw) : null,
        shiftDayNight: section.shiftDayNight,
        turnoAB: section.turnoAB,
        rawData: rawRecord,
      });
    }

    if (!sawAnySection) {
      warnings.push(`No TURNO section rows found in sheet "${sheetName}"; rows default to day`);
    }

    sheets.push({ sheetName, date, projectName, entries, warnings });
  }

  return { sheets };
}

