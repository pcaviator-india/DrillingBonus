/**
 * Shared normalization helpers for Excel parsing and position matching.
 * Pure functions only.
 */

/** Uppercase, strip accents, collapse whitespace. */
export function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** RUT: keep digits + verification char only (handles "16.706.064-1" and "17643998-k"). */
export function normalizeRut(input: string): string {
  const cleaned = input.replace(/[^0-9kK]/g, "").toUpperCase();
  return cleaned;
}

/** Parse Chilean/decimal numbers written with comma: "15,00" -> 15, "7,05" -> 7.05 */
export function parseDecimal(input: unknown): number | null {
  if (input === null || input === undefined || input === "") return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (input instanceof Date) return null;
  const raw = String(input).trim().replace(/\s/g, "");
  // 1.234,56 or 15,00
  const normalized = raw.includes(",") && raw.includes(".")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(",", ".");
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Levenshtein distance (iterative, two rows). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/** Similarity 0..1 based on Levenshtein relative to the longer string. */
export function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}

/** True when one string contains the other (after normalization). */
export function containsMatch(a: string, b: string): boolean {
  return a.includes(b) || b.includes(a);
}

/**
 * Collapse a rig/machine identifier into a stable key that ignores zero-padding
 * in numeric segments. e.g. "740-07", "740-7" and "Rig 740-07" all normalize.
 * We canonicalize each number segment: "740-07" -> "740-7", "1200-01" -> "1200-1".
 * Letter suffixes are kept (so "HQ" stays).
 */
export function normalizeRigKey(input: string): string {
  return normalizeText(input)
    .replace(/^RIG\s*/, "") // drop leading "RIG " prefix from interval-file names
    .replace(/RIG/g, "") // also inside compound keys; safe for machine ids
    .replace(/\d+/g, (m) => String(Number.parseInt(m, 10)))
    .replace(/[^0-9A-Z]/g, "");
}

/** Alias-safe normalize: also strips zero padding, useful for matching rig names. */
export function rigKeyOf(v: string | null | undefined): string {
  return v ? normalizeRigKey(v) : "";
}
