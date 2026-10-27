/**
 * Central date/time helpers.
 *
 * The company operates in Chile, so all user-facing times are rendered in
 * America/Santiago regardless of the server's timezone (UTC on Vercel).
 * Workera returns naive local timestamps (yyyy-MM-ddTHH:mm:ss) in Chilean
 * wall time — they are parsed to correct UTC instants here.
 */

export const CHILE_TZ = "America/Santiago";

const chileDTF = new Intl.DateTimeFormat("en-CA", {
  timeZone: CHILE_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

type ChileParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getChileParts(date: Date): ChileParts {
  const parts = chileDTF.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24, // Intl may yield 24 for midnight with hour12:false
    minute: get("minute"),
    second: get("second"),
  };
}

/** Offset (ms) of Chile from UTC at the given instant (handles DST -03/-04). */
function chileOffsetMs(utcMs: number): number {
  const p = getChileParts(new Date(utcMs));
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - utcMs;
}

/**
 * Parse a Workera timestamp ("yyyy-MM-ddTHH:mm:ss", Chile wall time, no offset)
 * into a correct UTC Date. Also tolerates strings that already carry an offset/Z.
 */
export function parseChileLocal(value: string): Date {
  // If it carries explicit zone info, let the engine handle it
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(value)) return new Date(value);
  // ZKTeco sends "yyyy-MM-dd HH:mm:ss" (space separator) or "yyyy-MM-ddTHH:mm:ss" (T separator)
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) {
    const fallback = new Date(value);
    if (Number.isNaN(fallback.getTime())) throw new Error(`Unparseable date: ${value}`);
    return fallback;
  }
  const [, y, mo, d, h, mi, s] = m;
  const asUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0));
  return new Date(asUtc - chileOffsetMs(asUtc));
}

/** Hour of day (0-23) in Chile for the given instant. */
export function chileHour(date: Date): number {
  return getChileParts(date).hour;
}

/** "yyyy-MM-dd" — the Chilean calendar date of the instant. */
export function formatDateChile(date: Date): string {
  const p = getChileParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** "yyyy-MM-dd" — UTC calendar date. Use for @db.Date columns (stored as UTC midnight). */
export function formatDateUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "HH:mm" in Chile. */
export function formatTimeChile(date: Date): string {
  const p = getChileParts(date);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/** "yyyy-MM-dd HH:mm" in Chile. */
export function formatDateTimeChile(date: Date): string {
  const p = getChileParts(date);
  return `${formatDateChile(date)} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}
