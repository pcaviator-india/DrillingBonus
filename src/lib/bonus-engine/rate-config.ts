/**
 * Configurable drilling types, depth scales, and drilling-type aliases.
 *
 * These were previously hard-coded inside individual bonus handlers and in
 * src/lib/calculations/run.ts. Centralizing them here lets the Rules UI render
 * data-driven dropdowns without hard-coding any of the codes in components,
 * while the pure engine functions simply import the same list.
 */

/** A drilling-type code the engine uses as a rate-table key, with its UI label
 * and the rig-type group it belongs to (Diamantina vs Aire Reverso).
 *
 * These are REAL diameters / methods only (never internal codes):
 *   HQ, NQ, PQ, DDH, NAVI  -> Diamantina
 *   RC (RockH / RockT)     -> Aire Reverso
 */
export type DrillingTypeCode = "HQ" | "NQ" | "PQ" | "DDH" | "NAVI" | "RC";

export type DrillingTypeGroup = "DIAMANTINA" | "AIRE_REVERSO" | "ESPECIAL";

export interface DrillingTypeOption {
  code: string;
  label: string;
  group: DrillingTypeGroup;
}

/**
 * Diameter names that appear in rig-interval Excel columns (e.g. "HQ", "NQ",
 * "RockH 2m Extract Dry") map to drilling-type codes used as rate-table keys.
 * The engine in run.ts uses these to derive `drillingType` per shift.
 */
export interface DrillingTypeAlias {
  match: "exact" | "prefix";
  key: string;
  result: string;
}

export const DRILLING_TYPES: DrillingTypeOption[] = [
  { code: "HQ", label: "HQ", group: "DIAMANTINA" },
  { code: "NQ", label: "NQ", group: "DIAMANTINA" },
  { code: "PQ", label: "PQ", group: "DIAMANTINA" },
  { code: "DDH", label: "DDH (Diamantina generic)", group: "DIAMANTINA" },
  { code: "NAVI", label: "NAVI", group: "DIAMANTINA" },
  { code: "RC", label: "RC (Aire Reverso, RockH / RockT)", group: "AIRE_REVERSO" },
];

/** Default depth-scale buckets used by every handler's `getDepthScale`. */
export const DEPTH_SCALES: string[] = ["0-500", "500-1000", "1000-1500", "1500-2000", "2000-2500", "2500+"];

/**
 * Pseudo drilling-type keys that are not real diameters but are used as
 * rate-table keys. The best-rig (MEJOR MAQUINA) flat fallback reads
 *   rateTable["BEST_RIG"]["MONTHLY"][role]
 * when no per-type/per-band rig totals are available.
 */
export const BEST_RIG_FLAT_TYPE = "BEST_RIG";

/** The depth-scale key used together with BEST_RIG_FLAT_TYPE. */
export const BEST_RIG_FLAT_SCALE = "MONTHLY";

export const SPECIAL_DRILLING_TYPES: DrillingTypeOption[] = [
  { code: BEST_RIG_FLAT_TYPE, label: "Mejor maquina (flat monthly)", group: "ESPECIAL" },
];

/** Every drilling-type option the UI offers (real diameters + special keys). */
export const ALL_DRILLING_TYPES: DrillingTypeOption[] = [...DRILLING_TYPES, ...SPECIAL_DRILLING_TYPES];

/** True for pseudo keys such as BEST_RIG that are not real diameters. */
export function isSpecialDrillingType(code: string): boolean {
  return SPECIAL_DRILLING_TYPES.some((d) => d.code === code);
}

/** Aliases from raw diameter column text → drilling-type code. */
export const DRILLING_TYPE_ALIASES: DrillingTypeAlias[] = [
  { match: "exact", key: "HQ", result: "HQ" },
  { match: "exact", key: "NQ", result: "NQ" },
  { match: "exact", key: "PQ", result: "PQ" },
  { match: "exact", key: "DDH", result: "DDH" },
  { match: "exact", key: "NAVI", result: "NAVI" },
  { match: "prefix", key: "RockH", result: "RC" },
  { match: "prefix", key: "RockT", result: "RC" },
  { match: "exact", key: "RC", result: "RC" },
];

/**
 * Legacy internal codes (H1 = HQ, H2 = NQ) found in OLD calculation snapshots
 * and rig totals. H3–H5 were never real diameters, so they have no mapping.
 */
const LEGACY_TYPE_ALIASES: Record<string, string> = { H1: "HQ", H2: "NQ" };

/** Map a legacy internal code (H1/H2) to its real diameter; pass through others. */
export function normalizeLegacyDrillingType(type: string): string {
  return LEGACY_TYPE_ALIASES[type] ?? type;
}

/**
 * Resolve a raw diameter string (from rig-interval columns) to a drilling-type
 * code. Exact matches first, then prefix matches (RockH*, RockT*).
 */
export function resolveDrillingTypeFromDiameter(diameter: string | null | undefined): string | null {
  if (!diameter) return null;
  const trimmed = diameter.trim();
  for (const alias of DRILLING_TYPE_ALIASES) {
    if (alias.match === "exact" && trimmed === alias.key) return alias.result;
    if (alias.match === "prefix" && trimmed.startsWith(alias.key)) return alias.result;
  }
  return trimmed; // pass through unknown diameters unchanged
}

/**
 * Derive the canonical depth-scale bucket from a numeric drilling depth.
 * Replaces the duplicated `getDepthScale` function in every handler.
 */
export function getDepthScale(depth: number): string {
  if (depth < 500) return "0-500";
  if (depth < 1000) return "500-1000";
  if (depth < 1500) return "1000-1500";
  if (depth < 2000) return "1500-2000";
  if (depth < 2500) return "2000-2500";
  return "2500+";
}

/**
 * Interval bands/diameters that must NEVER count as drilled production.
 * Grouting / reaming passes (e.g. "Grouting HQ") only clear an already-drilled
 * hole, so their metres are excluded from metersDrilled, rig totals and bonus
 * lookups. Centralized here (configuration, not hard-coded in handlers) so new
 * non-productive keywords can be added without code changes elsewhere.
 */
export const NON_PRODUCTIVE_INTERVAL_KEYWORDS: string[] = ["grout"];

/** True when a rig-interval band/diameter is non-productive (e.g. grouting). */
export function isNonProductiveInterval(band?: string | null, diameter?: string | null): boolean {
  const hay = `${band ?? ""} ${diameter ?? ""}`.toLowerCase();
  return NON_PRODUCTIVE_INTERVAL_KEYWORDS.some((k) => hay.includes(k.toLowerCase()));
}

/** Map a depth-scale string (e.g. "500-1000") to the numeric lower bound. */
export function depthScaleLower(scale: string): number {
  const m = scale.match(/^(\d+)/);
  return m ? Number.parseInt(m[1], 10) : 0;
}
