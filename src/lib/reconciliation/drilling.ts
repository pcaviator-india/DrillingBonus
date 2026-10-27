import { rigKeyOf } from "@/lib/excel/normalize";
import type {
  DrillingBuildInput,
  DrillingMatchFlag,
  DrillingMatchRow,
  DrillingMatchSummary,
  DrillingMatchVerdict,
  PlanillaRigRow,
  RigPerformanceRow,
  RigRef,
  RigRollup,
  UnmappedMachine,
} from "./types";

export type DrillingReconciliationResult = {
  rows: DrillingMatchRow[];
  summary: DrillingMatchSummary;
};

/** Human label for whatever provider produced a daily drilling row. */
export function drillingSourceLabel(source: string | null): string {
  if (source === "coreplan") return "CorePlan";
  if (source === "excel") return "Intervals file";
  return source ?? "—";
}

/** Key used for planilla machines that have no rig mapping yet. */
export function unmappedMachineKey(machine: string | null): string {
  return `machine:${rigKeyOf(machine)}`;
}

function numbers(values: (number | null)[]): number[] {
  return values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
}

function uniqueSorted(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v && v.trim())))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function emptySummary(): DrillingMatchSummary {
  return {
    keys: 0,
    matched: 0,
    valueDiff: 0,
    valuesDisagree: 0,
    noPlanillaMeters: 0,
    planillaOnly: 0,
    sourceOnly: 0,
    planillaMeters: 0,
    sourceMeters: 0,
    deltaMeters: 0,
    unmappedMachines: [],
    noMachine: { keys: 0, planillaRows: 0, meters: 0, samples: [] },
    bySource: {},
    byRig: [],
  };
}

type PlanillaGroup = {
  key: string;
  date: string;
  shift: string;
  rigId: string | null;
  rows: PlanillaRigRow[];
};

/**
 * PURE. Reconciles the Planilla Diaria METROS against the daily drilling rows
 * (intervals report today, CorePlan API later) for the same rig + date + shift.
 *
 * Rules carried over from the CLI cross-check (scripts/verify-planilla-sources.ts):
 *  - the same METROS is repeated on every crew row of one rig/day/shift, so the
 *    planilla value is the MAX of those rows and disagreement between them is
 *    flagged;
 *  - a planilla machine with no rig alias cannot be compared, so it is reported
 *    as an unmapped machine instead of being silently dropped.
 */
export function buildDrillingReconciliation(
  input: DrillingBuildInput,
): DrillingReconciliationResult {
  const { planilla, performance, rigs, siteNames, tolerance } = input;

  // 1) Group the planilla rows by rig + day + shift (or machine when unmapped).
  // Rows with a blank MAQUINA cannot resolve to any rig, so they group per
  // date+shift under a dedicated "no-machine" bucket instead of polluting the
  // unmapped-machine list.
  const groups = new Map<string, PlanillaGroup>();
  for (const row of planilla) {
    const machineText = row.machine?.trim() ?? "";
    const key = row.rigId
      ? `${row.rigId}|${row.date}|${row.shiftDayNight}`
      : machineText
        ? `${unmappedMachineKey(row.machine)}|${row.date}|${row.shiftDayNight}`
        : `no-machine|${row.date}|${row.shiftDayNight}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, date: row.date, shift: row.shiftDayNight, rigId: row.rigId, rows: [] };
      groups.set(key, group);
    }
    group.rows.push(row);
  }

  // 2) Index the daily drilling rows by rig + day + shift.
  const perfByKey = new Map<string, RigPerformanceRow>();
  const bySource: Record<string, number> = {};
  for (const perf of performance) {
    const key = `${perf.rigId}|${perf.date}|${perf.shift}`;
    bySource[perf.source] = (bySource[perf.source] ?? 0) + 1;
    const current = perfByKey.get(key);
    if (!current) {
      perfByKey.set(key, { ...perf });
      continue;
    }
    // Defensive: the model is unique on (rig, date, shift), but if a provider
    // ever produces two rows for one key we sum the meters instead of hiding one.
    perfByKey.set(key, {
      ...current,
      metersDrilled: current.metersDrilled + perf.metersDrilled,
      hoursSpent: current.hoursSpent ?? perf.hoursSpent,
      hole: current.hole ?? perf.hole,
      drillingLevel: current.drillingLevel ?? perf.drillingLevel,
      intervals: [...(current.intervals ?? []), ...(perf.intervals ?? [])],
    });
  }

  const rows: DrillingMatchRow[] = [];
  for (const group of groups.values()) {
    const perfKey = group.rigId ? `${group.rigId}|${group.date}|${group.shift}` : null;
    const perf = perfKey ? perfByKey.get(perfKey) ?? null : null;
    if (perfKey && perf) perfByKey.delete(perfKey);
    rows.push(buildRow(group, perf, rigs, siteNames, tolerance));
  }
  // 3) Daily drilling rows with no planilla row for that rig/day/shift.
  for (const leftover of perfByKey.values()) {
    rows.push(buildRow(null, leftover, rigs, siteNames, tolerance));
  }

  // 4) Summaries (KPIs, per-rig roll-up, unmapped machines).
  const summary = emptySummary();
  summary.keys = rows.length;
  summary.bySource = bySource;

  const unmapped = new Map<string, UnmappedMachine>();
  const rollups = new Map<string, RigRollup>();

  for (const row of rows) {
    if (row.verdict === "matched") summary.matched += 1;
    if (row.verdict === "value-diff") summary.valueDiff += 1;
    if (row.verdict === "values-disagree") summary.valuesDisagree += 1;
    if (row.verdict === "no-planilla-meters") summary.noPlanillaMeters += 1;
    if (row.verdict === "planilla-only") summary.planillaOnly += 1;
    if (row.verdict === "source-only") summary.sourceOnly += 1;
    summary.planillaMeters += row.planillaMeters ?? 0;
    summary.sourceMeters += row.sourceMeters ?? 0;

    if (row.flags.includes("unmapped-machine")) {
      for (const machine of row.planillaMachines) {
        const item = unmapped.get(machine) ?? { machine, keys: 0, planillaRows: 0, meters: 0 };
        item.keys += 1;
        item.planillaRows += row.planillaRows;
        item.meters += row.planillaMeters ?? 0;
        unmapped.set(machine, item);
      }
    }

    if (row.flags.includes("no-machine")) {
      summary.noMachine.keys += 1;
      summary.noMachine.planillaRows += row.planillaRows;
      summary.noMachine.meters += row.planillaMeters ?? 0;
      if (summary.noMachine.samples.length < 8) {
        summary.noMachine.samples.push(`${row.date} ${row.shift}`);
      }
    }

    if (row.rigId) {
      const roll: RigRollup = rollups.get(row.rigId) ?? {
        rigId: row.rigId,
        rigName: row.rigName ?? row.rigId,
        siteName: row.siteName,
        keys: 0,
        matched: 0,
        valueDiff: 0,
        planillaOnly: 0,
        sourceOnly: 0,
        planillaMeters: 0,
        sourceMeters: 0,
        delta: 0,
      };
      roll.keys += 1;
      if (row.verdict === "matched") roll.matched += 1;
      if (row.verdict === "value-diff" || row.verdict === "values-disagree") roll.valueDiff += 1;
      if (row.verdict === "planilla-only") roll.planillaOnly += 1;
      if (row.verdict === "source-only") roll.sourceOnly += 1;
      roll.planillaMeters += row.planillaMeters ?? 0;
      roll.sourceMeters += row.sourceMeters ?? 0;
      roll.delta = roll.planillaMeters - roll.sourceMeters;
      rollups.set(row.rigId, roll);
    }
  }

  summary.deltaMeters = summary.planillaMeters - summary.sourceMeters;
  summary.unmappedMachines = [...unmapped.values()].sort((a, b) => b.meters - a.meters);
  summary.byRig = [...rollups.values()].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  rows.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    const aName = a.rigName ?? a.planillaMachines[0] ?? "";
    const bName = b.rigName ?? b.planillaMachines[0] ?? "";
    return aName.localeCompare(bName);
  });

  return { rows, summary };
}

/**
 * Builds one reconciliation row from an optional planilla group and an optional
 * daily drilling row. Both sides are null-safe: exactly one may be missing.
 */
function buildRow(
  group: PlanillaGroup | null,
  perf: RigPerformanceRow | null,
  rigs: Map<string, RigRef>,
  siteNames: Map<string, string>,
  tolerance: number,
): DrillingMatchRow {
  const rigId = group?.rigId ?? perf?.rigId ?? null;
  const rig = rigId ? rigs.get(rigId) ?? null : null;
  const planillaValues = numbers(group?.rows.map((r) => r.metros) ?? []);
  const distinctValues = new Set(planillaValues).size;
  const planillaMeters = planillaValues.length ? Math.max(...planillaValues) : null;
  const sourceMeters = perf ? perf.metersDrilled : null;
  const delta =
    planillaMeters !== null && sourceMeters !== null ? planillaMeters - sourceMeters : null;
  const deltaPct =
    delta !== null && sourceMeters ? Math.round((delta / sourceMeters) * 1000) / 10 : null;
  const intervals = perf?.intervals ?? null;

  const flags: DrillingMatchFlag[] = [];
  if (group && !group.rigId) {
    const hasMachineText = group.rows.some((r) => r.machine?.trim());
    flags.push(hasMachineText ? "unmapped-machine" : "no-machine");
  }
  if (rigId && rig && !rig.siteId) flags.push("rig-no-site");
  if (distinctValues > 1) flags.push("planilla-values-disagree");

  let verdict: DrillingMatchVerdict;
  if (group && !perf) verdict = "planilla-only";
  else if (!group && perf) verdict = "source-only";
  else if (planillaMeters === null) verdict = "no-planilla-meters";
  else if (distinctValues > 1) verdict = "values-disagree";
  else if (Math.abs(planillaMeters - (sourceMeters ?? 0)) <= tolerance) verdict = "matched";
  else verdict = "value-diff";

  if (verdict === "matched" && perf && perf.source !== "coreplan") {
    flags.push("matched-from-excel");
  }

  return {
    key: group?.key ?? `${perf?.rigId}|${perf?.date}|${perf?.shift}`,
    date: group?.date ?? perf?.date ?? "",
    shift: group?.shift ?? perf?.shift ?? "",
    rigId,
    rigName: rig?.name ?? null,
    siteId: rig?.siteId ?? null,
    siteName: rig?.siteId ? siteNames.get(rig.siteId) ?? null : null,
    planillaRows: group?.rows.length ?? 0,
    planillaMeters,
    planillaMinMeters: planillaValues.length ? Math.min(...planillaValues) : null,
    planillaDistinctValues: distinctValues,
    planillaMachines: uniqueSorted(group?.rows.map((r) => r.machine) ?? []),
    planillaDiameters: uniqueSorted(group?.rows.map((r) => r.diameter) ?? []),
    planillaEscalas: uniqueSorted(group?.rows.map((r) => r.escala) ?? []),
    sourceMeters,
    sourceHours: perf?.hoursSpent ?? null,
    sourceHole: perf?.hole ?? null,
    sourceDrillingLevel: perf?.drillingLevel ?? null,
    sourceLabel: perf ? drillingSourceLabel(perf.source) : null,
    sourceIntervals: intervals?.length ?? 0,
    sourceDiameters: uniqueSorted((intervals ?? []).map((i) => i.diameter)),
    sourceEscalas: uniqueSorted((intervals ?? []).map((i) => i.escala)),
    delta,
    deltaPct,
    verdict,
    flags,
  };
}