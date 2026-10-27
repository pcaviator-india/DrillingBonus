/**
 * Minimal CSV serialization helpers (pure functions).
 */

/** Quote/escape a single cell for CSV (RFC 4180). */
export function csvCell(value: unknown): string {
  const raw =
    value === null || value === undefined
      ? ""
      : typeof value === "number"
        ? Number.isFinite(value)
          ? String(value)
          : ""
        : String(value);
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

/** Serialize a list of rows into a CSV string. Each row is an array of cells. */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const all = [headers, ...rows];
  return all.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

/** Build a recommended filename header value with optional date stamp. */
export function csvContentDisposition(baseName: string, ext = "csv"): string {
  const safe = baseName.replace(/[^a-zA-Z0-9_-]+/g, "_");
  const date = new Date().toISOString().slice(0, 10);
  return `attachment; filename="${safe}_${date}.${ext}"`;
}