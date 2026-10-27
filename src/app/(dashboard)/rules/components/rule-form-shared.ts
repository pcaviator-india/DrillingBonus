/**
 * Shared types + pure helpers for the structured (non-JSON) Rules forms.
 *
 * This module intentionally has NO "use client" directive: it is imported by
 * both server components (pages, to build the option lists) and client
 * components (the form builders). It contains no React and no DB access.
 */

import { ALL_DRILLING_TYPES, DEPTH_SCALES } from "@/lib/bonus-engine/rate-config";

/** rateTable[drillingType][depthScale][position] = rate per meter. */
export type RateTable = Record<string, Record<string, Record<string, number>>>;

/** rateTable[drillingType][depthScale] = rate (used by the directional bonus). */
export type SimpleRateTable = Record<string, Record<string, number>>;

/** A selectable chip in the pickers. */
export interface ChipOption {
  value: string;
  label: string;
  /** Optional heading the chip is rendered under (e.g. "Group 2 – Drilling Crew"). */
  groupLabel?: string;
  /** Extra tooltip text. */
  hint?: string;
}

/** A canonical cargo/position that can be used as a rate-table column. */
export interface PositionOption {
  /** Canonical cargo name — also the key stored in the rate table JSON. */
  name: string;
  groupKey: string | null;
  groupName: string | null;
}

/** A bonus group (group1 / group2 / ...) coming from the PositionGroup table. */
export interface GroupOption {
  key: string;
  name: string;
}

/** Props every structured parameter form receives. */
export interface BonusParameterFormProps {
  /** Current `parameters` JSON of the rule (may be `{}` for a fresh rule). */
  value: Record<string, unknown>;
  /** Emits the complete replacement `parameters` object. */
  onChange: (next: Record<string, unknown>) => void;
  /** Canonical cargos available as rate-table roles. */
  positions: PositionOption[];
  /** Bonus groups (group1, group2, ...) available as filters/rate keys. */
  groups: GroupOption[];
  /**
   * Rule-level position filter. Only forms that own a group-level decision
   * (best-rig MEJOR MÁQUINA) read/write it; when omitted those controls are
   * hidden.
   */
  positionFilter?: string[];
  onPositionFilterChange?: (next: string[]) => void;
}

/** Chip options for every canonical cargo, grouped by bonus group. */
export function buildRoleChipOptions(positions: PositionOption[]): ChipOption[] {
  return positions.map((p) => ({
    value: p.name,
    label: p.name,
    groupLabel: p.groupName ?? p.groupKey ?? "Sin grupo",
  }));
}

/**
 * Role chips that also expose the bonus-group keys themselves, so a rule can
 * target "group1"/"group2" instead of enumerating every cargo name. The engine
 * already resolves group keys as position tokens (buildRoleTokenResolver).
 */
export function buildRoleAndGroupChipOptions(
  positions: PositionOption[],
  groups: GroupOption[],
): ChipOption[] {
  return [
    ...groups.map((g) => ({ value: g.key, label: `${g.name} (${g.key})`, groupLabel: "Bonus groups" })),
    ...buildRoleChipOptions(positions),
  ];
}

/** Chip options for drilling types, grouped by Diamantina / Aire Reverso. */
export function buildDrillingTypeChipOptions(): ChipOption[] {
  return ALL_DRILLING_TYPES.map((d) => ({
    value: d.code,
    label: `${d.label} (${d.code})`,
    groupLabel: DRILLING_TYPE_GROUP_LABELS[d.group],
  }));
}

/** Localized headings for the drilling-type chip groups. */
export const DRILLING_TYPE_GROUP_LABELS: Record<string, string> = {
  DIAMANTINA: "Diamantina",
  AIRE_REVERSO: "Aire reverso",
  ESPECIAL: "Especial (mejor maquina)",
};

/** Chip options for the standard depth scales (tramos) plus any extras. */
export function buildDepthScaleOptions(extra: string[] = []): ChipOption[] {
  const all = [...DEPTH_SCALES];
  for (const e of extra) if (!all.includes(e)) all.push(e);
  return all.map((s) => ({ value: s, label: s }));
}

/** Human label for a drilling-type code, falling back to the raw code. */
export function drillingTypeLabel(code: string): string {
  const found = ALL_DRILLING_TYPES.find((d) => d.code === code);
  return found ? `${found.label} (${found.code})` : code;
}

/** Read a rate from a 3-level table, defaulting to 0. */
export function getRate(table: RateTable, drillingType: string, scale: string, role: string): number {
  return table[drillingType]?.[scale]?.[role] ?? 0;
}

/** Immutably write a rate, pruning empty branches so the stored JSON stays clean. */
export function setRate(
  table: RateTable,
  drillingType: string,
  scale: string,
  role: string,
  rate: number,
): RateTable {
  const next: RateTable = { ...table };
  const scales: Record<string, Record<string, number>> = { ...(next[drillingType] ?? {}) };
  const roles: Record<string, number> = { ...(scales[scale] ?? {}) };

  if (!Number.isFinite(rate) || rate === 0) {
    delete roles[role];
  } else {
    roles[role] = rate;
  }

  if (Object.keys(roles).length === 0) delete scales[scale];
  else scales[scale] = roles;

  if (Object.keys(scales).length === 0) delete next[drillingType];
  else next[drillingType] = scales;

  return next;
}

/** Read a rate from a 2-level table (directional), defaulting to 0. */
export function getSimpleRate(table: SimpleRateTable, drillingType: string, scale: string): number {
  return table[drillingType]?.[scale] ?? 0;
}

/** Immutably write a rate in a 2-level table, pruning empty branches. */
export function setSimpleRate(
  table: SimpleRateTable,
  drillingType: string,
  scale: string,
  rate: number,
): SimpleRateTable {
  const next: SimpleRateTable = { ...table };
  const scales: Record<string, number> = { ...(next[drillingType] ?? {}) };

  if (!Number.isFinite(rate) || rate === 0) delete scales[scale];
  else scales[scale] = rate;

  if (Object.keys(scales).length === 0) delete next[drillingType];
  else next[drillingType] = scales;

  return next;
}

/** Remove a role column from every drilling type / scale in a 3-level table. */
export function pruneRole(table: RateTable, role: string): RateTable {
  const next: RateTable = {};
  for (const [dt, scales] of Object.entries(table)) {
    const scaleOut: Record<string, Record<string, number>> = {};
    for (const [scale, roles] of Object.entries(scales)) {
      const filtered: Record<string, number> = {};
      for (const [r, v] of Object.entries(roles)) if (r !== role) filtered[r] = v;
      if (Object.keys(filtered).length > 0) scaleOut[scale] = filtered;
    }
    if (Object.keys(scaleOut).length > 0) next[dt] = scaleOut;
  }
  return next;
}

/** Remove a whole drilling type branch from a 3-level table. */
export function pruneDrillingType(table: RateTable, drillingType: string): RateTable {
  const next: RateTable = { ...table };
  delete next[drillingType];
  return next;
}

/** Remove a depth scale across every drilling type in a 3-level table. */
export function pruneScale(table: RateTable, scale: string): RateTable {
  const next: RateTable = {};
  for (const [dt, scales] of Object.entries(table)) {
    const filtered: Record<string, Record<string, number>> = {};
    for (const [s, roles] of Object.entries(scales)) if (s !== scale) filtered[s] = roles;
    if (Object.keys(filtered).length > 0) next[dt] = filtered;
  }
  return next;
}

/** Remove a depth scale across every drilling type in a 2-level table. */
export function pruneSimpleScale(table: SimpleRateTable, scale: string): SimpleRateTable {
  const next: SimpleRateTable = {};
  for (const [dt, scales] of Object.entries(table)) {
    const filtered: Record<string, number> = {};
    for (const [s, v] of Object.entries(scales)) if (s !== scale) filtered[s] = v;
    if (Object.keys(filtered).length > 0) next[dt] = filtered;
  }
  return next;
}

/** Remove a drilling type from a 2-level table. */
export function pruneSimpleDrillingType(table: SimpleRateTable, drillingType: string): SimpleRateTable {
  const next: SimpleRateTable = { ...table };
  delete next[drillingType];
  return next;
}

/** Count configured (non-zero) rates in a 3-level table. */
export function countRates(table: RateTable): number {
  let n = 0;
  for (const scales of Object.values(table)) {
    for (const roles of Object.values(scales)) {
      for (const v of Object.values(roles)) if (v) n++;
    }
  }
  return n;
}

/** Count configured (non-zero) rates in a 2-level table. */
export function countSimpleRates(table: SimpleRateTable): number {
  let n = 0;
  for (const scales of Object.values(table)) {
    for (const v of Object.values(scales)) if (v) n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Introspection helpers for existing tables (used to seed pickers).
// ---------------------------------------------------------------------------

/** Every role (cargo) column present in a 3-level rate table, in first-seen order. */
export function tableRoles(table: RateTable): string[] {
  const found: string[] = [];
  for (const byScale of Object.values(table)) {
    for (const byRole of Object.values(byScale)) {
      for (const role of Object.keys(byRole)) if (!found.includes(role)) found.push(role);
    }
  }
  return found;
}

/** Every drilling type present in a 3-level rate table, in first-seen order. */
export function tableDrillingTypes(table: RateTable): string[] {
  return Object.keys(table);
}

/** Every depth scale present in a 3-level rate table, in first-seen order. */
export function tableScales(table: RateTable): string[] {
  const found: string[] = [];
  for (const byScale of Object.values(table)) {
    for (const scale of Object.keys(byScale)) if (!found.includes(scale)) found.push(scale);
  }
  return found;
}

/** Every depth scale present in a 2-level rate table, in first-seen order. */
export function simpleTableScales(table: SimpleRateTable): string[] {
  const found: string[] = [];
  for (const byScale of Object.values(table)) {
    for (const scale of Object.keys(byScale)) if (!found.includes(scale)) found.push(scale);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Defensive coercion helpers — read the stored JSON without ever using `any`.
// ---------------------------------------------------------------------------

/** Returns `v` when it is a plain object, else an empty object. */
export function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Returns `v` when it is a finite number, else `fallback`. */
export function asNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Returns `v` when it is a string, else "". */
export function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Returns `v` when it is exactly `true`. */
export function asBool(v: unknown): boolean {
  return v === true;
}

/** Coerce an unknown value into a well-formed 3-level rate table. */
export function asRateTable(v: unknown): RateTable {
  const out: RateTable = {};
  for (const [dt, scales] of Object.entries(asRecord(v))) {
    const scaleOut: Record<string, Record<string, number>> = {};
    for (const [scale, roles] of Object.entries(asRecord(scales))) {
      const roleOut: Record<string, number> = {};
      for (const [role, rate] of Object.entries(asRecord(roles))) {
        if (typeof rate === "number" && Number.isFinite(rate)) roleOut[role] = rate;
      }
      if (Object.keys(roleOut).length > 0) scaleOut[scale] = roleOut;
    }
    if (Object.keys(scaleOut).length > 0) out[dt] = scaleOut;
  }
  return out;
}

/** Coerce an unknown value into a well-formed 2-level rate table. */
export function asSimpleRateTable(v: unknown): SimpleRateTable {
  const out: SimpleRateTable = {};
  for (const [dt, scales] of Object.entries(asRecord(v))) {
    const scaleOut: Record<string, number> = {};
    for (const [scale, rate] of Object.entries(asRecord(scales))) {
      if (typeof rate === "number" && Number.isFinite(rate)) scaleOut[scale] = rate;
    }
    if (Object.keys(scaleOut).length > 0) out[dt] = scaleOut;
  }
  return out;
}

/** Coerce an unknown value into a `Record<string, number>`. */
export function asNumberMap(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(asRecord(v))) {
    if (typeof n === "number" && Number.isFinite(n)) out[k] = n;
  }
  return out;
}

/** Coerce an unknown value into a `Record<string, string>`. */
export function asStringMap(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, s] of Object.entries(asRecord(v))) {
    if (typeof s === "string" && s.trim() !== "") out[k] = s;
  }
  return out;
}

/**
 * Starting parameters for each bonus type, so a newly added rule already
 * validates against its Zod schema instead of saving an empty `{}`.
 *
 * These are neutral placeholders (no business values): every rate/amount is
 * still chosen by the user.
 */
export function defaultParametersFor(bonusTypeCode: string): Record<string, unknown> {
  switch (bonusTypeCode) {
    case "production_meter":
      return { rateTable: {}, bestRigSelection: "employee_rig_month" };
    case "above_threshold":
      return { thresholds: {}, multiplier: 1.5, baseRateTable: {}, incrementOnly: true };
    case "monthly_goal":
      return { goals: {}, amounts: {} };
    case "high_altitude":
      return { monthlyAmount: 0, daysInMonth: 30, payMode: "prorated" };
    case "end_of_season":
      return { salaryMultiplier: 1, totalDays: 30, baseSalary: 0 };
    case "directional":
      return { rateTable: {}, hoursFactor: 1 };
    case "termination_adjustment":
      return { terminationMultiplier: 1, reason: "" };
    default:
      return {};
  }
}

/** Remove a key from a parameters object (used when an optional block is cleared). */
export function withoutKey(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const next = { ...value };
  delete next[key];
  return next;
}

/** Returns `v` when it is a string array, else []. */
export function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
}

/** Layout of a guided rate-table grid, persisted next to the rates themselves. */
export interface RateTableLayout {
  roles: string[];
  drillingTypes: string[];
  depthScales: string[];
}

/**
 * Resolve the grid layout for a rate table.
 *
 * Priority: the explicit `rateTable*` layout keys (written by the builder) →
 * whatever keys the stored table already contains (so hand-written JSON still
 * opens with the right columns) → the standard defaults.
 *
 * Persisting the layout means a role the user selected keeps its column even
 * before any rate is typed into it.
 */
export function resolveLayout(value: Record<string, unknown>, table: RateTable): RateTableLayout {
  const foundTypes = new Set<string>();
  const foundScales = new Set<string>();
  const foundRoles = new Set<string>();
  for (const [dt, byScale] of Object.entries(table)) {
    foundTypes.add(dt);
    for (const [scale, byRole] of Object.entries(byScale)) {
      foundScales.add(scale);
      for (const role of Object.keys(byRole)) foundRoles.add(role);
    }
  }

  const storedTypes = asStringArray(value.rateTableTypes);
  const storedScales = asStringArray(value.rateTableScales);
  const storedRoles = asStringArray(value.rateTableRoles);

  return {
    drillingTypes: storedTypes.length > 0 ? storedTypes : [...foundTypes],
    depthScales: storedScales.length > 0 ? storedScales : [...foundScales],
    roles: storedRoles.length > 0 ? storedRoles : [...foundRoles],
  };
}

/** Write the layout keys, dropping empty ones so the JSON stays minimal. */
export function writeLayout(
  value: Record<string, unknown>,
  layout: Partial<RateTableLayout>,
): Record<string, unknown> {
  let next = value;
  const pairs: [string, string[] | undefined][] = [
    ["rateTableTypes", layout.drillingTypes],
    ["rateTableScales", layout.depthScales],
    ["rateTableRoles", layout.roles],
  ];
  for (const [key, list] of pairs) {
    if (list === undefined) continue;
    next = list.length > 0 ? { ...next, [key]: list } : withoutKey(next, key);
  }
  return next;
}
