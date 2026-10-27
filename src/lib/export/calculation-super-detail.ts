import ExcelJS from "exceljs";
import { formatDateUtc } from "@/lib/datetime";
import { normalizeLegacyDrillingType } from "@/lib/bonus-engine/rate-config";

/**
 * Super detailed calculation export (Excel, one sheet per employee).
 *
 * Purpose: employees asked for full transparency on how their bonus was
 * calculated — per employee, per date, per drilling range (tramo), with the
 * rate, the arithmetic and every applicable concept spelled out.
 *
 * Pure functions over already-loaded DB rows + the stored engine input
 * snapshot (audit). No DB access here.
 *
 * Layout:
 *  - "Resumen" sheet: calculation meta + per-employee totals per concept.
 *  - One sheet per employee: header info, day-by-day detail rows
 *    (date/turn/turn A-B/rig/type/tramo/meters/rate/base/bonus/concept/detail),
 *    Mejor Máquina expansion per (type, tramo) + prorate row, monthly-goal
 *    section, totals row and plain-language explanations.
 *  - "Tarifas y Reglas" sheet: the rate tables, thresholds and goals from the
 *    rule set used, so anyone can verify a rate.
 */

// ---------- input shapes (already-loaded rows + snapshot) ----------

export type SuperDetailShiftRow = {
  date?: string;
  shift?: string;
  rigName?: string;
  role?: string;
  meters?: number;
  /** Aggregate-row fields (BEST_RIG fallback) */
  rate?: number;
  bonus?: number;
  drillingType?: string | null;
  drillingLevel?: string | null;
  depthScale?: string | null;
  turn?: "A" | "B" | null;
  componentBreakdown?: unknown;
};

export type SuperDetailComponent = {
  bonusTypeCode?: string;
  bonusTypeName?: string;
  amount?: number;
  details?: Record<string, unknown>;
};

export type SuperDetailLine = {
  employeeId: string;
  employeeName: string;
  employeeRut: string | null;
  roleUsed: string;
  daysWorked: number;
  totalMeters: number;
  totalHours: number | null;
  calculatedBonus: number;
  breakdown: { components?: unknown; shifts?: unknown } | null;
};

export type SuperDetailCalc = {
  id: string;
  siteName: string;
  ruleSetName: string;
  ruleSetVersion: number;
  periodStart: Date;
  periodEnd: Date;
  status: string;
  totalBonus: number;
  createdAt: Date;
};

export type EngineInputSnapshot = {
  employees?: Array<{
    employeeId: string;
    defaultRole?: string | null;
    /** Raw role, normalized form, main position, bonus group key (run.ts). */
    roleTokens?: string[];
    shifts?: Array<{
      date: string;
      shift: string;
      rigName: string;
      role?: string;
      meters?: number;
      hours?: number | null;
      drillingType?: string | null;
      drillingDepth?: number | null;
      depthScale?: string | null;
    }>;
  }>;
  rules?: Array<{
    ruleId?: string;
    bonusTypeCode?: string;
    positionFilter?: string[];
    positionExclude?: string[];
    priority?: number;
    parameters?: Record<string, unknown>;
  }>;
  monthlyRigTotals?: Record<string, number>;
  rigTotalsByType?: Record<string, Record<string, number>>;
  rigTotalsByTypeAndScale?: Record<string, Record<string, Record<string, number>>>;
  rigDailyTotalsByTypeAndScale?: Record<
    string,
    Record<string, Record<string, Record<string, number>>>
  >;
};

// ---------- rule applicability (mirrors engine.ts token matching) ----------

/**
 * The employee's full role-token set (roleUsed + snapshot roleTokens,
 * case-insensitive). Group-based filters ("group1") match through these tokens.
 */
function employeeTokens(
  line: SuperDetailLine,
  engineInput: EngineInputSnapshot | null,
): Set<string> {
  const emp = engineInput?.employees?.find((e) => e.employeeId === line.employeeId);
  return new Set<string>(
    [line.roleUsed, ...(emp?.roleTokens ?? [])].map((t) => t.toLowerCase()),
  );
}

/** True when the rule applies to the employee (filter + exclusion). */
function ruleApplies(
  rule: NonNullable<EngineInputSnapshot["rules"]>[number],
  tokens: Set<string>,
): boolean {
  const filter = rule.positionFilter ?? [];
  if (filter.length > 0 && !filter.some((p) => tokens.has(p.toLowerCase()))) return false;
  const exclude = rule.positionExclude ?? [];
  if (exclude.some((p) => tokens.has(p.toLowerCase()))) return false;
  return true;
}

// ---------- Spanish concept names (employee-facing) ----------

const CONCEPT: Record<string, string> = {
  production_meter: "Bono Metro",
  above_threshold: "Bono Extra (sobre 22/50 m)",
  monthly_goal: "Bono Meta mensual",
  high_altitude: "Bono Altura",
  end_of_season: "Fin de Temporada",
  directional: "Perforación Direccional",
  termination_adjustment: "Ajuste por Término",
};

function conceptFor(code: string | undefined): string {
  return CONCEPT[code ?? ""] ?? code ?? "Bono";
}

// ---------- depth range helpers (mirror run.ts normalization) ----------

/** Numeric depth -> normalized tramo used by rate lookups. */
function getDepthScaleFromDepth(depth: number): string {
  if (depth < 500) return "0-500";
  if (depth < 1000) return "500-1000";
  if (depth < 1500) return "1000-1500";
  if (depth < 2000) return "1500-2000";
  if (depth < 2500) return "2000-2500";
  return "2500+";
}

/** Raw escala string (e.g. "200-400") -> normalized tramo bucket. */
function normalizeScale(raw: string): string {
  const m = raw.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
  if (m) {
    const from = Number.parseFloat(m[1]);
    if (Number.isFinite(from)) {
      if (from < 500) return "0-500";
      if (from < 1000) return "500-1000";
      if (from < 1500) return "1000-1500";
      if (from < 2000) return "1500-2000";
      return "2000-2500";
    }
  }
  return raw;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------- formatting + sheet helpers ----------

function fmtMeters(n: number): string {
  return n.toLocaleString("es-CL", { maximumFractionDigits: 2 });
}

function fmtPesos(n: number): string {
  return Math.round(n).toLocaleString("es-CL");
}

function fmtTurn(shift: string | undefined, turn: "A" | "B" | null | undefined): string {
  const base =
    shift === "day+night" ? "Día+Noche" : shift === "day" ? "Día" : shift === "night" ? "Noche" : shift ?? "";
  return turn ? `${base} (${turn})` : base;
}

function sheetRef(name: string, cell = "A1"): string {
  return `#'${name.replace(/'/g, "''")}'!${cell}`;
}

const LINK_FONT = { color: { argb: "FF2563EB" }, underline: true } as const;

function sheetName(raw: string, used: Map<string, number>): string {
  let base = raw.replace(/[:\\/?*[\]]/g, " ").trim() || "Empleado";
  if (base.length > 28) base = base.slice(0, 28);
  const n = used.get(base) ?? 0;
  used.set(base, n + 1);
  return n === 0 ? base : `${base} (${n + 1})`;
}

// ---------- detail row model ----------

type DetailRow = {
  date: string;
  shift: string;
  turn: "A" | "B" | null;
  rig: string;
  type: string;
  scale: string;
  meters: number | null;
  hours: number | null;
  rate: number | null;
  threshold: number | null;
  metersAbove: number | null;
  multiplier: number | null;
  base: number | null;
  bonus: number;
  concept: string;
  detail: string;
  /** Overrides the "Cálculo" column text for total-style rows (e.g. prorate). */
  calculatedAs?: string;
  /** True for arithmetic-only rows (e.g. Mejor Máquina per-tramo raw breakdown
   * when a prorate row carries the final payment) — excluded from totals. */
  informational?: boolean;
};

type GoalRow = {
  type: string;
  goal: number;
  actual: number;
  achieved: boolean;
  amount: number;
  rigs: string;
};

type ProrateRow = {
  rawTotal: number;
  splitFactor?: number;
  divisorDays: number;
  divisorSource: string;
  daysWorked: number;
  final: number;
};

type EmployeeSection = {
  rows: DetailRow[];
  goals: GoalRow[];
  prorate: ProrateRow | null;
  notes: string[];
  explanations: string[];
  computedTotal: number;
};

type ProductionMeterRuleParams = {
  rateTable?: Record<string, Record<string, Record<string, number>>>;
  /** Raw report band -> rateTable tramo (e.g. { "0-100": "0-200" }). */
  depthScaleAliases?: Record<string, string>;
  rateKey?: string;
  bestRigSelection?: string;
};

/**
 * Parameters of the production_meter rule that applies to the employee, picked
 * the way the engine picks it: the first applying rule that pays the BEST RIG of
 * the month when one exists (MEJOR MÁQUINA sites), otherwise the first applying
 * production_meter rule.
 */
function productionMeterParamsFor(
  engineInput: EngineInputSnapshot | null,
  line: SuperDetailLine,
): ProductionMeterRuleParams {
  const tokens = employeeTokens(line, engineInput);
  const applicable = (engineInput?.rules ?? []).filter(
    (r) => r.bonusTypeCode === "production_meter" && ruleApplies(r, tokens),
  );
  const rule =
    applicable.find(
      (r) =>
        (r.parameters as ProductionMeterRuleParams | undefined)?.bestRigSelection ===
        "best_rig_month",
    ) ?? applicable[0];
  return (rule?.parameters ?? {}) as ProductionMeterRuleParams;
}

/** Rate-table row key (memo table) for the employee: rule config, else the role. */
function rateKeyFor(line: SuperDetailLine, engineInput: EngineInputSnapshot | null): string {
  return productionMeterParamsFor(engineInput, line).rateKey ?? line.roleUsed;
}

/**
 * Mirror of the engine's resolveScaleAlias: follow the rule's report-band ->
 * memo-tramo chain (e.g. "0-100" -> "0-200") with a visited guard, so a band the
 * source report emits but the memo pays under a different tramo width resolves
 * to the key the rateTable is authored with. Keys without an alias resolve to
 * themselves, which keeps canonical buckets the table intentionally omits
 * (e.g. the "0-500" sum of all bands) unpriced and therefore never double-paid.
 */
function resolveAlias(aliases: Record<string, string> | undefined, scale: string): string {
  if (!aliases) return scale;
  let current = scale;
  const seen = new Set<string>([current]);
  let next = aliases[current];
  while (next && !seen.has(next)) {
    current = next;
    seen.add(current);
    next = aliases[current];
  }
  return current;
}

/** Alias-aware rate lookup — same order as the engine's production-meter rateFor. */
function rateFromTable(
  rateTable: Record<string, Record<string, Record<string, number>>>,
  drillingType: string,
  scale: string,
  rateKey: string,
): number {
  const type = normalizeLegacyDrillingType(drillingType);
  const table = rateTable[type] ?? rateTable[drillingType];
  return table?.[scale]?.[rateKey] ?? 0;
}

/**
 * Configured above-threshold MULTIPLIER (e.g. 1.5), NOT the effective increment
 * (0.5) that the engine stores when incrementOnly is true. Falls back to the
 * effective value stored in the breakdown when the snapshot isn't available.
 */
function configuredAboveMultiplierFor(
  engineInput: EngineInputSnapshot | null,
  line: SuperDetailLine,
  effective: number | null,
): number {
  const tokens = employeeTokens(line, engineInput);
  const rule = (engineInput?.rules ?? []).find(
    (r) => r.bonusTypeCode === "above_threshold" && ruleApplies(r, tokens),
  );
  const cfg = (rule?.parameters as { multiplier?: number } | undefined)?.multiplier;
  if (typeof cfg === "number") return cfg;
  return typeof effective === "number" ? effective : 1.5;
}

type InputShift = NonNullable<NonNullable<EngineInputSnapshot["employees"]>[number]["shifts"]>[number];

function inputShiftsFor(engineInput: EngineInputSnapshot | null, employeeId: string): InputShift[] {
  return engineInput?.employees?.find((e) => e.employeeId === employeeId)?.shifts ?? [];
}

/**
 * Resolve the normalized tramo for a stored shift row. New calculations carry
 * `depthScale` directly; older ones are resolved from the input snapshot:
 * day+night rows by matching the machine daily totals, otherwise from the
 * employee's own shift contribution (raw escala or numeric depth).
 */
function resolveScale(
  row: SuperDetailShiftRow,
  engineInput: EngineInputSnapshot | null,
  inputShifts: InputShift[],
): string {
  if (row.depthScale) return row.depthScale;
  if (row.shift === "day+night" && row.date && row.rigName && row.drillingType) {
    const byScale =
      engineInput?.rigDailyTotalsByTypeAndScale?.[row.rigName]?.[row.date]?.[row.drillingType];
    if (byScale) {
      const match = Object.entries(byScale).find(([, v]) => v === row.meters);
      if (match) return match[0];
    }
  }
  const shift = inputShifts.find(
    (s) =>
      s.date === row.date &&
      s.rigName === row.rigName &&
      (row.shift === "day+night" || s.shift === row.shift),
  );
  if (shift) {
    if (shift.depthScale) return normalizeScale(shift.depthScale);
    if (typeof shift.drillingDepth === "number") return getDepthScaleFromDepth(shift.drillingDepth);
  }
  return "";
}

function shiftHours(row: SuperDetailShiftRow, inputShifts: InputShift[]): number | null {
  const matches = inputShifts.filter(
    (s) =>
      s.date === row.date &&
      s.rigName === row.rigName &&
      (row.shift === "day+night" || s.shift === row.shift),
  );
  if (matches.length === 0) return null;
  return round2(matches.reduce((acc, s) => acc + (s.hours ?? 0), 0));
}

// ---------- section builder (line -> detail rows) ----------

type CompDetails = {
  rate?: number;
  meters?: number;
  threshold?: number;
  metersAbove?: number;
  multiplier?: number;
  hours?: number;
  hoursFactor?: number;
  explanation?: string;
  monthlyAmount?: number;
  goalResults?: Array<{
    drillingType?: string;
    goal?: number;
    actual?: number;
    achieved?: boolean;
    amount?: number;
  }>;
  qualifiedRigs?: string[];
  prorate?: { rawTotal?: number; splitFactor?: number; divisorDays?: number; divisorSource?: string; daysWorked?: number };
};

function goalRowsFrom(d: CompDetails): GoalRow[] {
  return (d.goalResults ?? []).map((g) => ({
    type: g.drillingType ?? "",
    goal: g.goal ?? 0,
    actual: g.actual ?? 0,
    achieved: g.achieved ?? false,
    amount: g.amount ?? 0,
    rigs: (d.qualifiedRigs ?? []).join(", "),
  }));
}

function buildEmployeeSection(
  line: SuperDetailLine,
  engineInput: EngineInputSnapshot | null,
): EmployeeSection {
  const rows: DetailRow[] = [];
  const goals: GoalRow[] = [];
  const notes: string[] = [];
  const explanations: string[] = [];
  let prorate: ProrateRow | null = null;
  let bestRigExpanded = false;

  const inputShifts = inputShiftsFor(engineInput, line.employeeId);
  const rateKey = rateKeyFor(line, engineInput);
  const shifts = (line.breakdown?.shifts ?? []) as SuperDetailShiftRow[];
  const components = (line.breakdown?.components ?? []) as SuperDetailComponent[];

  for (const row of shifts) {
    const comps = (Array.isArray(row.componentBreakdown) ? row.componentBreakdown : []) as SuperDetailComponent[];
    const scale = resolveScale(row, engineInput, inputShifts);
    const hours = shiftHours(row, inputShifts);

    // MEJOR MÁQUINA aggregate rows: expand to per (type, tramo) rows from the
    // snapshot rig totals so support staff see the per-range arithmetic too.
    if (row.drillingType === "BEST_RIG" && !bestRigExpanded) {
      bestRigExpanded = true;
      const rig = row.rigName ?? "";
      const byType = engineInput?.rigTotalsByTypeAndScale?.[rig];
      const pmParams = productionMeterParamsFor(engineInput, line);
      const rateTable = pmParams.rateTable ?? {};
      const aliases = pmParams.depthScaleAliases;
      // The prorate config lives on the LINE-LEVEL component (breakdown.components),
      // not on the shift-level componentBreakdown.
      const lineComp = (components ?? []).find(
        (c) => c.bonusTypeCode === "production_meter" && (c.details as CompDetails | undefined)?.prorate,
      );
      const pr = (lineComp?.details as CompDetails | undefined)?.prorate;
      const hasProrate = Boolean(pr);
      // Total meters the best rig drilled in the month — the justification for
      // why THIS rig was chosen as "mejor máquina".
      const bestRigMeters = round2(
        Object.values(engineInput?.monthlyRigTotals ?? {}).length > 0
          ? (engineInput?.monthlyRigTotals?.[rig] ?? 0)
          : Object.values(byType ?? {}).reduce(
              (acc, scales) => acc + Object.values(scales).reduce((a, m) => a + m, 0),
              0,
            ),
      );
      if (byType) {
        // Only rows the calculation actually priced (rate > 0) belong in the
        // detail: the snapshot keeps both the raw report bands (0-100, 100-200)
        // AND the normalized tramo buckets (0-500) per type. Showing both
        // double-counts the meters, so zero-rate duplicates are dropped —
        // unless nothing priced at all, in which case keep them for diagnosis.
        //
        // Bands are resolved through the rule's depthScaleAliases exactly like
        // the engine's rate lookup (report band -> memo tramo). Skipping that
        // resolution made every row of an aliased site (e.g. Chile Chico, whose
        // report drills 100 m bands while the memo pays 200 m tramos) price at
        // $0 even though the calculation paid the prorated amount.
        const priced: typeof rows = [];
        const zeroRate: typeof rows = [];
        for (const [type, scales] of Object.entries(byType)) {
          for (const [sc, meters] of Object.entries(scales)) {
            const tramo = resolveAlias(aliases, sc);
            const rate = rateFromTable(rateTable, type, tramo, rateKey);
            const base = round2(meters * rate);
            const tramoNote =
              tramo === sc ? ` (Tramo ${tramo})` : ` (banda ${sc} → Tramo ${tramo})`;
            const entry: DetailRow = {
              date: "", shift: "", turn: null, rig, type, scale: tramo,
              meters, hours: null, rate, threshold: null, metersAbove: null, multiplier: null,
              base, bonus: base,
              concept: "Mejor Máquina",
              detail: `Mejor máquina del mes (${rig}, ${fmtMeters(bestRigMeters)} m): ${fmtMeters(meters)} m${tramoNote} × $${fmtPesos(rate)}/m`,
              informational: hasProrate, // prorate row below carries the final payment
            };
            (rate > 0 ? priced : zeroRate).push(entry);
          }
        }
        rows.push(...(priced.length > 0 ? priced : zeroRate));
        // Transparency: say which bands were left out of the payment, so the
        // per-tramo rows always reconcile with the prorated raw total.
        if (priced.length > 0 && zeroRate.length > 0) {
          const excluded = zeroRate
            .map((e) => `${e.type} ${e.scale}: ${fmtMeters(e.meters ?? 0)} m`)
            .join(" · ");
          notes.push(
            `Tramos sin tarifa en el memo (no se pagan): ${excluded}. El tramo acumulado 0-500 repite metros ya pagados por banda y los tipos no listados en la tabla de tarifas (p. ej. GROUTING) no tienen tarifa definida; ninguna banda sin tarifa se paga. La suma de los tramos con tarifa da el total antes de prorratear.`,
          );
        }
      }
      if (pr && typeof pr.rawTotal === "number" && typeof pr.divisorDays === "number") {
        const amount = typeof lineComp?.amount === "number"
          ? lineComp.amount
          : comps.reduce((acc, c) => acc + (typeof c.amount === "number" ? c.amount : 0), 0);
        const divisorSource = pr.divisorSource === "days_in_month" ? "días del mes" : "divisor fijo";
        const daysWorked = typeof pr.daysWorked === "number" ? pr.daysWorked : line.daysWorked;
        const split = typeof pr.splitFactor === "number" && pr.splitFactor > 1 ? pr.splitFactor : null;
        prorate = { rawTotal: pr.rawTotal, splitFactor: split ?? undefined, divisorDays: pr.divisorDays, divisorSource, daysWorked, final: amount };
        const calcStr = split
          ? `($${fmtPesos(pr.rawTotal)} ÷ ${split}) ÷ ${pr.divisorDays} × ${daysWorked} días`
          : `$${fmtPesos(pr.rawTotal)} (total tramos) ÷ ${pr.divisorDays} × ${daysWorked} días`;
        const detailStr = split
          ? `Prorrateo (mejor máquina: ${rig}, ${fmtMeters(bestRigMeters)} m, dividida en ${split}): ($${fmtPesos(pr.rawTotal)} ÷ ${split}) ÷ ${pr.divisorDays} (${divisorSource}) × ${daysWorked} días en faena`
          : `Prorrateo (mejor máquina: ${rig}, ${fmtMeters(bestRigMeters)} m): $${fmtPesos(pr.rawTotal)} ÷ ${pr.divisorDays} (${divisorSource}) × ${daysWorked} días en faena`;
        const explStr = split
          ? `MEJOR MÁQUINA: la mejor máquina del mes fue ${rig} con ${fmtMeters(bestRigMeters)} m perforados (la de mayor producción). Su bono se calcula por tramo, se divide en ${split} (producción turno día y noche dividida en dos según memo), y luego se prorratea: (($${fmtPesos(pr.rawTotal)} ÷ ${split}) ÷ ${pr.divisorDays}) × ${daysWorked} días efectivos en faena.`
          : `MEJOR MÁQUINA: la mejor máquina del mes fue ${rig} con ${fmtMeters(bestRigMeters)} m perforados (la de mayor producción). Su bono se calcula por tramo y luego se prorratea: ($${fmtPesos(pr.rawTotal)} ÷ ${pr.divisorDays}) × ${daysWorked} días efectivos en faena.`;
        rows.push({
          date: "", shift: "", turn: null, rig, type: "MEJOR MÁQUINA", scale: "",
          meters: null, hours: null, rate: null, threshold: null, metersAbove: null, multiplier: null,
          base: pr.rawTotal, bonus: amount,
          concept: "Mejor Máquina",
          calculatedAs: calcStr,
          detail: detailStr,
        });
        explanations.push(explStr);
      } else if (!byType) {
        // No per-range totals in the snapshot — keep the engine's aggregate row.
        rows.push({
          date: "", shift: "", turn: null, rig, type: "BEST_RIG", scale: "",
          meters: row.meters ?? null, hours: null, rate: row.rate ?? null,
          threshold: null, metersAbove: null, multiplier: null,
          base: row.bonus ?? 0, bonus: row.bonus ?? 0,
          concept: "Mejor Máquina",
          detail: `Mejor máquina del mes (${rig}${bestRigMeters ? `, ${fmtMeters(bestRigMeters)} m` : ""})`,
        });
      }
      continue;
    }

    for (const comp of comps) {
      const d = (comp.details ?? {}) as CompDetails;
      const bonus = typeof comp.amount === "number" ? comp.amount : 0;

      switch (comp.bonusTypeCode) {
        case "production_meter": {
          const meters = typeof d.meters === "number" ? d.meters : (row.meters ?? 0);
          const rate = typeof d.rate === "number" ? d.rate : null;
          const base = rate !== null ? round2(meters * rate) : null;
          rows.push({
            date: row.date ?? "", shift: row.shift ?? "", turn: row.turn ?? null, rig: row.rigName ?? "",
            type: row.drillingType ?? "", scale,
            meters, hours, rate, threshold: null, metersAbove: null, multiplier: null,
            base, bonus,
            concept: conceptFor(comp.bonusTypeCode),
            detail:
              row.shift === "day+night"
                ? `Producción de la máquina 24 h (día+noche): ${fmtMeters(meters)} m × $${rate !== null ? fmtPesos(rate) : "?"}/m`
                : `Producción del turno: ${fmtMeters(meters)} m × $${rate !== null ? fmtPesos(rate) : "?"}/m`,
          });
          break;
        }
        case "above_threshold": {
          const metersAbove = typeof d.metersAbove === "number" ? d.metersAbove : null;
          const threshold = typeof d.threshold === "number" ? d.threshold : null;
          // d.multiplier is the EFFECTIVE increment (0.5) when the rule is
          // incrementOnly — recover the CONFIGURED multiplier (1.5) from the
          // snapshot so the export shows the rule's actual value.
          const effectiveMult = typeof d.multiplier === "number" ? d.multiplier : null;
          const multiplier = configuredAboveMultiplierFor(engineInput, line, effectiveMult);
          let rate = typeof d.rate === "number" ? d.rate : null;
          if (rate === null && metersAbove && effectiveMult) {
            // derive from bonus = metersAbove × rate × effectiveMult
            rate = round2(bonus / (metersAbove * effectiveMult));
          }
          const aboveRule = engineInput?.rules?.find(
            (r) => r.bonusTypeCode === "above_threshold" && (r.positionFilter ?? []).includes(line.roleUsed),
          );
          const incrementOnly = Boolean(
            (aboveRule?.parameters as { incrementOnly?: boolean } | undefined)?.incrementOnly ?? true,
          );
          rows.push({
            date: row.date ?? "", shift: row.shift ?? "", turn: row.turn ?? null, rig: row.rigName ?? "",
            type: row.drillingType ?? "", scale,
            meters: row.meters ?? null, hours, rate,
            threshold, metersAbove, multiplier,
            base: rate !== null && metersAbove !== null ? round2(metersAbove * rate) : null,
            bonus,
            concept: conceptFor(comp.bonusTypeCode),
            detail:
              metersAbove !== null && threshold !== null
                ? `${fmtMeters(metersAbove)} m sobre el tramo mínimo (${threshold} m/turno) × $${rate !== null ? fmtPesos(rate) : "?"}/m × ${multiplier}${incrementOnly ? " (solo incremento +" + Math.round((multiplier - 1) * 100) + "%, la base se paga en Bono Metro)" : ""}`
                : "Sobre tramo mínimo por turno",
          });
          break;
        }
        case "monthly_goal": {
          for (const g of goalRowsFrom(d)) goals.push(g);
          break;
        }
        case "directional": {
          rows.push({
            date: row.date ?? "", shift: row.shift ?? "", turn: row.turn ?? null, rig: row.rigName ?? "",
            type: row.drillingType ?? "", scale,
            meters: 0, hours: typeof d.hours === "number" ? d.hours : null,
            rate: typeof d.rate === "number" ? d.rate : null,
            threshold: null, metersAbove: null,
            multiplier: typeof d.hoursFactor === "number" ? d.hoursFactor : null,
            base: bonus, bonus,
            concept: conceptFor(comp.bonusTypeCode),
            detail: `${fmtMeters(d.hours ?? 0)} h × factor ${d.hoursFactor ?? "?"} × $${d.rate !== undefined ? fmtPesos(d.rate) : "?"}/m`,
          });
          break;
        }
        case "termination_adjustment": {
          if (d.explanation) notes.push(`Ajuste por término: ${String(d.explanation)}`);
          break;
        }
        default: {
          if (bonus !== 0) {
            rows.push({
              date: row.date ?? "", shift: row.shift ?? "", turn: row.turn ?? null, rig: row.rigName ?? "",
              type: row.drillingType ?? "", scale, meters: row.meters ?? null, hours,
              rate: null, threshold: null, metersAbove: null, multiplier: null,
              base: null, bonus, concept: conceptFor(comp.bonusTypeCode), detail: "",
            });
          }
        }
      }
    }
  }

  // Components with no shift rows (goal-only employees, high altitude, etc.)
  for (const comp of components) {
    const d = (comp.details ?? {}) as CompDetails;
    if (comp.bonusTypeCode === "monthly_goal" && goals.length === 0) {
      for (const g of goalRowsFrom(d)) goals.push(g);
    }
    if (comp.bonusTypeCode === "high_altitude" && comp.amount) {
      const full = (d as { payMode?: string }).payMode === "full";
      rows.push({
        date: "", shift: "", turn: null, rig: "", type: "", scale: "", meters: null, hours: null,
        rate: null, threshold: null, metersAbove: null, multiplier: null,
        base: null, bonus: comp.amount, concept: conceptFor("high_altitude"),
        detail: full
          ? `Monto completo: $${fmtPesos(d.monthlyAmount ?? comp.amount)} (días trabajados ≥ 1)`
          : `Monto mensual fijo: $${fmtPesos(d.monthlyAmount ?? comp.amount)}`,
      });
    }
    if (comp.bonusTypeCode === "end_of_season" && comp.amount) {
      rows.push({
        date: "", shift: "", turn: null, rig: "", type: "", scale: "", meters: null, hours: null,
        rate: null, threshold: null, metersAbove: null, multiplier: null,
        base: null, bonus: comp.amount, concept: conceptFor("end_of_season"),
        detail: "Fin de temporada",
      });
    }
    if (comp.bonusTypeCode === "termination_adjustment" && d.explanation) {
      notes.push(`Ajuste por término: ${String(d.explanation)}`);
    }
  }

  // Plain-language explanations of the concepts present (employee-facing)
  const presentCodes = new Set<string>();
  for (const c of components) if (c.bonusTypeCode) presentCodes.add(c.bonusTypeCode);
  for (const s of shifts) {
    for (const c of ((Array.isArray(s.componentBreakdown) ? s.componentBreakdown : []) as SuperDetailComponent[])) {
      if (c.bonusTypeCode) presentCodes.add(c.bonusTypeCode);
    }
  }
  if (prorate) {
    const bestRigName =
      (components
        .flatMap((c) => ((c.details as { shiftBreakdown?: unknown[] } | undefined)?.shiftBreakdown ?? []) as Record<string, unknown>[])
        .find((s) => s?.rigName)?.rigName as string | undefined) ?? null;
    const bestRigType =
      (components
        .flatMap((c) => ((c.details as { shiftBreakdown?: unknown[] } | undefined)?.shiftBreakdown ?? []) as Record<string, unknown>[])
        .find((s) => s?.bestRigType)?.bestRigType as string | undefined) ?? null;
    const threshold =
      (engineInput?.rules
        ?.map((r) => (r.parameters as { bestRigRule?: { arThresholdMeters?: number } } | undefined)?.bestRigRule?.arThresholdMeters)
        .find((t) => typeof t === "number") as number | undefined) ?? null;
    // A specific MEJOR MÁQUINA explanation (rig name, threshold) is already
    // pushed by the BEST_RIG expansion; only add the generic one when the rig is
    // unknown or nothing was said yet.
    const alreadyExplained = explanations.some((e) => e.startsWith("MEJOR MÁQUINA:"));
    if (!alreadyExplained || !bestRigName) {
      explanations.push(
        bestRigName
          ? `MEJOR MÁQUINA: ${bestRigName}${bestRigType ? ` (${bestRigType === "AIRE_REVERSO" ? "Aire Reverso" : "Diamantina"})` : ""}${
              threshold !== null
                ? bestRigType === "AIRE_REVERSO"
                  ? ` superó ${threshold.toLocaleString("es-CL")} m en el mes`
                  : `; ninguna máquina de Aire Reverso superó ${threshold.toLocaleString("es-CL")} m`
                : ""
            }. Su bono se calcula por tramo y se prorratea por los días efectivos en faena.`
          : "MEJOR MÁQUINA: se toma la máquina con mayor producción del mes; su bono se calcula por tramo y se prorratea por los días efectivos en faena.",
      );
    }
  } else if (presentCodes.has("production_meter")) {
    explanations.push(
      "BONO METRO: tarifa $/m según el tipo y tramo de perforación, aplicada a la producción de la máquina (turno día + noche) por cada día efectivo en faena.",
    );
  }
  if (presentCodes.has("above_threshold")) {
    explanations.push(
      "BONO EXTRA: los metros que superan el tramo mínimo por turno (22 m Diamantina / 50 m Aire Reverso) se pagan solo con el incremento del 50% sobre la tarifa vigente.",
    );
  }
  if (goals.length > 0) {
    explanations.push(
      "BONO META: si la máquina supera 1.000 m Diamantina / 2.500 m Aire Reverso en el mes (ambos turnos), el equipo de esa máquina recibe $250.000 (Perforista) / $125.000 (Ayudante).",
    );
  }

  const computedTotal = round2(
    rows.reduce((acc, r) => acc + (r.informational ? 0 : r.bonus), 0) +
      goals.reduce((acc, g) => acc + g.amount, 0),
  );

  return { rows, goals, prorate, notes, explanations, computedTotal };
}

// ---------- workbook rendering ----------

const HEADER_FILL = "1F2937"; // slate-800
const SECTION_FILL = "E5E7EB"; // gray-200
const PESOS_FMT = '"$"#,##0';
const METERS_FMT = "#,##0.0#";

function styleHeaderRow(row: ExcelJS.Row): void {
  row.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  row.alignment = { vertical: "middle", wrapText: true };
}

function styleSectionTitle(row: ExcelJS.Row): void {
  row.font = { bold: true, size: 11 };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SECTION_FILL } };
}

function renderEmployeeSheet(
  ws: ExcelJS.Worksheet,
  calc: SuperDetailCalc,
  line: SuperDetailLine,
  section: EmployeeSection,
  resumenRowCell: string,
): void {
  let r = 1;
  const backCell = ws.getCell(r, 1);
  backCell.value = {
    text: "← Volver a Resumen",
    hyperlink: sheetRef("Resumen", resumenRowCell),
    tooltip: "Volver a la fila de este trabajador en Resumen",
  };
  backCell.font = { ...LINK_FONT };
  r += 1;
  // Header info
  ws.getCell(r, 1).value = line.employeeName;
  ws.getCell(r, 1).font = { bold: true, size: 14 };
  r += 1;
  const meta = [
    `RUT: ${line.employeeRut ?? "—"}`,
    `Cargo: ${line.roleUsed || "—"}`,
    `${calc.siteName} · ${calc.ruleSetName} (v${calc.ruleSetVersion})`,
    `Período: ${formatDateUtc(calc.periodStart)} → ${formatDateUtc(calc.periodEnd)}`,
  ];
  ws.getCell(r, 1).value = meta.join("   ·   ");
  ws.getCell(r, 1).font = { size: 10, color: { argb: "FF6B7280" } };
  r += 1;
  const totals = [
    `Días en faena: ${line.daysWorked}`,
    `Metros (turnos): ${fmtMeters(line.totalMeters)}`,
    `Horas: ${line.totalHours !== null ? fmtMeters(line.totalHours) : "—"}`,
    `BONO TOTAL: $${fmtPesos(line.calculatedBonus)}`,
  ];
  ws.getCell(r, 1).value = totals.join("   ·   ");
  ws.getCell(r, 1).font = { bold: true, size: 11 };
  r += 2;

  // Day-by-day detail table
  ws.getCell(r, 1).value = "Detalle por día, tipo y tramo de perforación";
  styleSectionTitle(ws.getRow(r));
  r += 1;
  const headers = [
    "Fecha", "Turno", "Turno A/B", "Máquina", "Tipo", "Tramo (m)", "Metros", "Horas",
    "Tarifa $/m", "Cálculo", "Umbral m/turno", "M sobre umbral", "Factor",
    "Bono $", "Concepto", "Cómo se calculó",
  ];
  const headerRow = ws.getRow(r);
  headers.forEach((h, i) => {
    headerRow.getCell(i + 1).value = h;
  });
  styleHeaderRow(headerRow);
  headerRow.height = 24;
  r += 1;

  const firstDetail = r;
  for (const row of section.rows) {
    const cell = (col: number, value: string | number | null) => {
      ws.getRow(r).getCell(col).value = value;
    };
    cell(1, row.date || "—");
    cell(2, row.shift ? fmtTurn(row.shift, null) : "—");
    cell(3, row.turn ?? "");
    cell(4, row.rig || "—");
    cell(5, row.type || "—");
    cell(6, row.scale || "—");
    cell(7, row.meters);
    cell(8, row.hours);
    cell(9, row.rate);
    cell(
      10,
      row.calculatedAs ??
        (row.base !== null
          ? `${fmtMeters(row.meters ?? 0)} m × $${row.rate !== null ? fmtPesos(row.rate) : "?"}`
          : "—"),
    );
    cell(11, row.threshold);
    cell(12, row.metersAbove);
    cell(13, row.multiplier);
    cell(14, row.bonus);
    cell(15, row.concept);
    cell(16, row.detail);
    if (row.informational) {
      ws.getRow(r).font = { italic: true, color: { argb: "FF6B7280" } };
    }
    // number formats
    ws.getRow(r).getCell(7).numFmt = METERS_FMT;
    ws.getRow(r).getCell(9).numFmt = PESOS_FMT;
    ws.getRow(r).getCell(14).numFmt = PESOS_FMT;
    r += 1;
  }
  if (section.rows.length === 0) {
    ws.getCell(r, 1).value = "Sin días con producción registrada en el período";
    ws.getCell(r, 1).font = { italic: true, color: { argb: "FF6B7280" } };
    r += 1;
  }

  // Totals row (paid amounts only — informational rows excluded)
  const totalRow = ws.getRow(r);
  totalRow.getCell(1).value = "TOTAL A PAGO";
  totalRow.getCell(14).value = section.computedTotal;
  totalRow.getCell(14).numFmt = PESOS_FMT;
  totalRow.font = { bold: true };
  totalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SECTION_FILL } };
  r += 1;
  if (Math.abs(section.computedTotal - line.calculatedBonus) > 0.05) {
    ws.getCell(r, 1).value = `Nota: el bono total a pago del período es $${fmtPesos(line.calculatedBonus)} (incluye conceptos listados abajo).`;
    ws.getCell(r, 1).font = { italic: true, color: { argb: "FF92400E" } };
    r += 1;
  }
  r += 1;

  // Monthly goal section
  if (section.goals.length > 0) {
    ws.getCell(r, 1).value = "Bono Meta mensual (máquina)";
    styleSectionTitle(ws.getRow(r));
    r += 1;
    const goalHeader = ws.getRow(r);
    ["Tipo", "Meta (m)", "Producción máquina (m)", "¿Superada?", "Monto $", "Máquina(s)"].forEach((h, i) => {
      goalHeader.getCell(i + 1).value = h;
    });
    styleHeaderRow(goalHeader);
    r += 1;
    for (const g of section.goals) {
      ws.getRow(r).getCell(1).value = g.type;
      ws.getRow(r).getCell(2).value = g.goal;
      ws.getRow(r).getCell(3).value = g.actual;
      ws.getRow(r).getCell(4).value = g.achieved ? "SÍ" : "NO";
      ws.getRow(r).getCell(5).value = g.amount;
      ws.getRow(r).getCell(6).value = g.rigs;
      ws.getRow(r).getCell(2).numFmt = METERS_FMT;
      ws.getRow(r).getCell(3).numFmt = METERS_FMT;
      ws.getRow(r).getCell(5).numFmt = PESOS_FMT;
      r += 1;
    }
    r += 1;
  }

  // Explanations + notes
  if (section.explanations.length > 0 || section.notes.length > 0) {
    ws.getCell(r, 1).value = "Cómo se calculó tu bono";
    styleSectionTitle(ws.getRow(r));
    r += 1;
    for (const line2 of [...section.explanations, ...section.notes]) {
      ws.getCell(r, 1).value = line2;
      ws.getCell(r, 1).alignment = { wrapText: true };
      r += 1;
    }
  }

  // Column widths + freeze the detail table
  const widths = [12, 11, 9, 12, 9, 10, 10, 8, 11, 30, 13, 13, 8, 13, 24, 52];
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
  ws.views = [{ state: "frozen", ySplit: firstDetail - 1 }];
}

function renderSummarySheet(
  ws: ExcelJS.Worksheet,
  calc: SuperDetailCalc,
  lines: SuperDetailLine[],
  sections: Map<string, EmployeeSection>,
  sheetNames: Map<string, string>,
): void {
  let r = 1;
  ws.getCell(r, 1).value = "Resumen de Bonos — Cálculo Detallado";
  ws.getCell(r, 1).font = { bold: true, size: 14 };
  r += 1;
  ws.getCell(r, 1).value = `${calc.siteName} · ${calc.ruleSetName} (v${calc.ruleSetVersion}) · Período: ${formatDateUtc(calc.periodStart)} → ${formatDateUtc(calc.periodEnd)} · Total: $${fmtPesos(calc.totalBonus)}`;
  ws.getCell(r, 1).font = { size: 10, color: { argb: "FF6B7280" } };
  r += 2;

  const headers = [
    "Empleado", "RUT", "Cargo", "Días en faena", "Metros (turnos)", "Horas",
    "Bono Metro", "Mejor Máquina", "Bono Extra", "Bono Meta", "Otros", "TOTAL $",
  ];
  const headerRow = ws.getRow(r);
  headers.forEach((h, i) => {
    headerRow.getCell(i + 1).value = h;
  });
  styleHeaderRow(headerRow);
  r += 1;

  for (const line of lines) {
    const section = sections.get(line.employeeId);
    // Per-concept totals from paid detail rows
    const byConcept: Record<string, number> = {};
    if (section) {
      for (const row of section.rows) {
        if (row.informational) continue;
        byConcept[row.concept] = round2((byConcept[row.concept] ?? 0) + row.bonus);
      }
      if (section.goals.length > 0) {
        byConcept["Bono Meta mensual"] = round2(
          (byConcept["Bono Meta mensual"] ?? 0) + section.goals.reduce((acc, g) => acc + g.amount, 0),
        );
      }
    } else {
      for (const c of ((Array.isArray(line.breakdown?.components) ? line.breakdown?.components : []) as SuperDetailComponent[])) {
        if (typeof c.amount === "number" && c.amount !== 0) {
          byConcept[conceptFor(c.bonusTypeCode)] = round2((byConcept[conceptFor(c.bonusTypeCode)] ?? 0) + c.amount);
        }
      }
    }
    const other = round2(
      Object.entries(byConcept)
        .filter(([k]) => !["Bono Metro", "Mejor Máquina", "Bono Extra (sobre 22/50 m)", "Bono Meta mensual"].includes(k))
        .reduce((acc, [, v]) => acc + v, 0),
    );
    const cells = [
      line.employeeName,
      line.employeeRut ?? "",
      line.roleUsed,
      line.daysWorked,
      line.totalMeters,
      line.totalHours,
      byConcept["Bono Metro"] ?? 0,
      byConcept["Mejor Máquina"] ?? 0,
      byConcept["Bono Extra (sobre 22/50 m)"] ?? 0,
      byConcept["Bono Meta mensual"] ?? 0,
      other,
      line.calculatedBonus,
    ];
    const row = ws.getRow(r);
    cells.forEach((v, i) => {
      row.getCell(i + 1).value = v;
    });
    const target = sheetNames.get(line.employeeId);
    if (target) {
      const nameCell = row.getCell(1);
      nameCell.value = {
        text: line.employeeName,
        hyperlink: sheetRef(target),
        tooltip: `Ir al detalle de ${line.employeeName}`,
      };
      nameCell.font = { ...LINK_FONT };
    }
    [7, 8, 9, 10, 11, 12].forEach((col) => {
      row.getCell(col).numFmt = PESOS_FMT;
    });
    row.getCell(5).numFmt = METERS_FMT;
    row.getCell(12).font = { bold: true };
    r += 1;
  }

  const totalRow = ws.getRow(r);
  totalRow.getCell(1).value = "TOTAL";
  totalRow.getCell(12).value = round2(lines.reduce((acc, l) => acc + l.calculatedBonus, 0));
  totalRow.getCell(12).numFmt = PESOS_FMT;
  totalRow.font = { bold: true };
  totalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SECTION_FILL } };

  const widths = [32, 14, 22, 12, 14, 9, 13, 14, 13, 13, 11, 14];
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
  ws.views = [{ state: "frozen", ySplit: 4 }];
}

function renderTarifasSheet(ws: ExcelJS.Worksheet, engineInput: EngineInputSnapshot): void {
  let r = 1;
  ws.getCell(r, 1).value = "Tarifas y reglas aplicadas (del conjunto de reglas usado en el cálculo)";
  ws.getCell(r, 1).font = { bold: true, size: 12 };
  r += 2;

  for (const rule of engineInput.rules ?? []) {
    const params = (rule.parameters ?? {}) as {
      rateTable?: Record<string, Record<string, Record<string, number>>>;
      depthScaleAliases?: Record<string, string>;
      bestRigSelection?: string;
      thresholds?: Record<string, number>;
      multiplier?: number;
      incrementOnly?: boolean;
      goals?: Record<string, number>;
      amounts?: Record<string, number>;
      monthlyAmount?: number;
    };
    const title =
      `Regla: ${conceptFor(rule.bonusTypeCode)}` +
      (rule.positionFilter && rule.positionFilter.length > 0 ? ` — ${rule.positionFilter.join(", ")}` : "") +
      (params.bestRigSelection === "best_rig_month" ? " (Mejor Máquina)" : "");
    ws.getCell(r, 1).value = title;
    styleSectionTitle(ws.getRow(r));
    r += 1;

    if (params.rateTable) {
      // Pivot: Tipo | Tramo | <roles...>
      const roles = new Set<string>();
      for (const scales of Object.values(params.rateTable)) {
        for (const pos of Object.values(scales)) {
          for (const role of Object.keys(pos)) {
            roles.add(role);
          }
        }
      }
      const roleList = [...roles].sort();
      const head = ["Tipo", "Tramo (m)", ...roleList];
      head.forEach((h, i) => {
        ws.getRow(r).getCell(i + 1).value = h;
      });
      styleHeaderRow(ws.getRow(r));
      r += 1;
      for (const [type, scales] of Object.entries(params.rateTable)) {
        for (const [scale, pos] of Object.entries(scales)) {
          ws.getRow(r).getCell(1).value = type;
          ws.getRow(r).getCell(2).value = scale;
          roleList.forEach((role, i) => {
            const v = pos[role];
            ws.getRow(r).getCell(3 + i).value = v;
            if (typeof v === "number") ws.getRow(r).getCell(3 + i).numFmt = PESOS_FMT;
          });
          r += 1;
        }
      }
      r += 1;
    }

    if (params.depthScaleAliases && Object.keys(params.depthScaleAliases).length > 0) {
      // The source report's bands do not always match the memo's tramos — show
      // the mapping the calculation used so any rate can be verified.
      ws.getRow(r).getCell(1).value = "Tramos del informe → tramo pagado por el memo";
      styleHeaderRow(ws.getRow(r));
      r += 1;
      ws.getRow(r).getCell(1).value = "Tramo del informe";
      ws.getRow(r).getCell(2).value = "Tramo del memo (tabla de tarifas)";
      styleHeaderRow(ws.getRow(r));
      r += 1;
      for (const [band, tramo] of Object.entries(params.depthScaleAliases)) {
        ws.getRow(r).getCell(1).value = band;
        ws.getRow(r).getCell(2).value = tramo;
        r += 1;
      }
      r += 1;
    }

    if (params.thresholds) {
      const configuredMult = typeof params.multiplier === "number" ? params.multiplier : 1.5;
      for (const [type, threshold] of Object.entries(params.thresholds)) {
        ws.getRow(r).getCell(1).value = `Umbral por turno — ${type}`;
        ws.getRow(r).getCell(2).value = `${threshold} m`;
        r += 1;
      }
      ws.getRow(r).getCell(1).value = "Multiplicador Bono Extra";
      ws.getRow(r).getCell(2).value = params.incrementOnly
        ? `${configuredMult}× configurado — pago del incremento: +${Math.round((configuredMult - 1) * 100)}% (la base se paga en Bono Metro)`
        : `${configuredMult}×`;
      r += 2;
    }

    if (params.goals) {
      ws.getRow(r).getCell(1).value = "Metas mensuales (por máquina)";
      ws.getRow(r).getCell(2).value = "Monto por rol";
      styleHeaderRow(ws.getRow(r));
      r += 1;
      for (const [type, goal] of Object.entries(params.goals)) {
        ws.getRow(r).getCell(1).value = `${type}: ${fmtMeters(goal)} m`;
        ws.getRow(r).getCell(2).value = Object.entries(params.amounts ?? {})
          .map(([role, amount]) => `${role}: $${fmtPesos(amount)}`)
          .join(" · ");
        r += 1;
      }
      r += 1;
    }

    if (typeof params.monthlyAmount === "number") {
      ws.getRow(r).getCell(1).value = "Monto mensual fijo";
      ws.getRow(r).getCell(2).value = fmtPesos(params.monthlyAmount);
      r += 2;
    }
  }

  ws.getColumn(1).width = 44;
  ws.getColumn(2).width = 60;
  for (let c = 3; c <= 10; c++) ws.getColumn(c).width = 14;
}

/**
 * Build the super detailed workbook for a calculation.
 * Returns the xlsx buffer ready to be sent as a download.
 */
export async function buildCalculationSuperDetailWorkbook(
  calc: SuperDetailCalc,
  lines: SuperDetailLine[],
  engineInput: EngineInputSnapshot | null,
): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "DrillingBonus";
  workbook.created = new Date();

  const sections = new Map<string, EmployeeSection>();
  for (const line of lines) {
    sections.set(line.employeeId, buildEmployeeSection(line, engineInput));
  }

  const used = new Map<string, number>();
  const sheetNames = new Map<string, string>();
  for (const line of lines) {
    sheetNames.set(line.employeeId, sheetName(line.employeeName, used));
  }

  // Resumen data rows start at row 5 (title + meta + blank + header).
  const resumenRowCell = (index: number): string => `A${5 + index}`;
  renderSummarySheet(workbook.addWorksheet("Resumen"), calc, lines, sections, sheetNames);

  lines.forEach((line, index) => {
    const ws = workbook.addWorksheet(sheetNames.get(line.employeeId) as string);
    renderEmployeeSheet(ws, calc, line, sections.get(line.employeeId) as EmployeeSection, resumenRowCell(index));
  });

  if (engineInput?.rules) {
    renderTarifasSheet(workbook.addWorksheet("Tarifas y Reglas"), engineInput);
  }

  return workbook.xlsx.writeBuffer();
}