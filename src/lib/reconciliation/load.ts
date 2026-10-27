import { db } from "@/lib/db";
import { formatDateUtc, formatTimeChile } from "@/lib/datetime";
import { normalizeRut, normalizeText, rigKeyOf } from "@/lib/excel/normalize";
import { isNonProductiveInterval } from "@/lib/bonus-engine/rate-config";
import { buildAttendanceReconciliation } from "./attendance";
import { buildDrillingReconciliation } from "./drilling";
import { RECONCILIATION_CONFIG } from "./config";
import type {
  AttendanceInputRow,
  AttendanceMatchRow,
  AttendanceMatchSummary,
  DrillingInterval,
  DrillingMatchRow,
  DrillingMatchSummary,
  PlanillaAttendanceRow,
  PlanillaRigRow,
  RigPerformanceRow,
  RigRef,
} from "./types";

export type AttendanceReconciliationView = {
  from: string;
  to: string;
  siteId: string | null;
  /** true when the period hit RECONCILIATION_CONFIG.maxRows. */
  truncated: boolean;
  rows: AttendanceMatchRow[];
  summary: AttendanceMatchSummary;
};

export type DrillingReconciliationView = {
  from: string;
  to: string;
  siteId: string | null;
  tolerance: number;
  truncated: boolean;
  rows: DrillingMatchRow[];
  summary: DrillingMatchSummary;
  /** Rig options for the "map machine to rig" control. */
  rigOptions: { id: string; name: string; siteName: string | null }[];
};

/**
 * Loads the normalized data for the Workera ↔ Planilla Diaria comparison and
 * hands it to the pure builder. Only fetching + identifier resolution happens
 * here (employee by RUT, site by SiteAlias/proyecto, upload site as fallback) —
 * exactly the same resolution the matching module uses.
 */
export async function loadAttendanceReconciliation(opts: {
  from: string;
  to: string;
  siteId?: string | null;
}): Promise<AttendanceReconciliationView> {
  const fromDate = new Date(`${opts.from}T00:00:00Z`);
  const toDate = new Date(`${opts.to}T00:00:00Z`);
  const siteId = opts.siteId ?? null;

  const [entries, attendanceRecords, employees, siteAliases, sites] = await Promise.all([
    db.dailyCrewEntry.findMany({
      where: { date: { gte: fromDate, lte: toDate } },
      select: {
        id: true,
        date: true,
        rut: true,
        rutNormalized: true,
        fullName: true,
        projectName: true,
        shiftDayNight: true,
        turnoAB: true,
        machine: true,
        metros: true,
        horasExtras: true,
        workeraMarkedIn: true,
        workeraMarkedOut: true,
        upload: { select: { siteId: true } },
      },
      orderBy: [{ date: "asc" }, { orderNumber: "asc" }],
      take: RECONCILIATION_CONFIG.maxRows,
    }),
    db.attendanceRecord.findMany({
      where: { date: { gte: fromDate, lte: toDate } },
      select: {
        employeeId: true,
        date: true,
        status: true,
        shift: true,
        hoursWorked: true,
        timeIn: true,
        timeOut: true,
        corrected: true,
      },
      take: RECONCILIATION_CONFIG.maxRows,
    }),
    db.employee.findMany({
      select: { id: true, fullName: true, rut: true, siteId: true, departmentName: true },
    }),
    db.siteAlias.findMany({ select: { normalized: true, siteId: true } }),
    db.site.findMany({ select: { id: true, name: true } }),
  ]);

  const siteByProyecto = new Map(siteAliases.map((a) => [a.normalized, a.siteId]));
  const siteNames = new Map(sites.map((s) => [s.id, s.name]));
  const empByRut = new Map(
    employees.filter((e) => e.rut).map((e) => [normalizeRut(e.rut as string), e.id]),
  );
  const employeeRefs = new Map(
    employees.map((e) => [
      e.id,
      {
        id: e.id,
        fullName: e.fullName,
        rut: e.rut,
        siteId: e.siteId,
        departmentName: e.departmentName,
      },
    ]),
  );

  const planillaAll: PlanillaAttendanceRow[] = entries.map((e) => {
    const rutNormalized = e.rutNormalized || normalizeRut(e.rut);
    const proyectoSite = e.projectName
      ? siteByProyecto.get(normalizeText(e.projectName)) ?? null
      : null;
    return {
      id: e.id,
      date: formatDateUtc(e.date),
      rut: e.rut,
      rutNormalized,
      fullName: e.fullName,
      projectName: e.projectName,
      shiftDayNight: e.shiftDayNight === "night" ? "night" : "day",
      turnoAB: e.turnoAB === "A" || e.turnoAB === "B" ? e.turnoAB : null,
      machine: e.machine,
      metros: e.metros,
      horasExtras: e.horasExtras,
      workeraMarkedIn: e.workeraMarkedIn,
      workeraMarkedOut: e.workeraMarkedOut,
      employeeId: empByRut.get(rutNormalized) ?? null,
      siteId: proyectoSite ?? e.upload?.siteId ?? null,
    };
  });

  const planilla = siteId ? planillaAll.filter((r) => r.siteId === siteId) : planillaAll;

  // Attendance scope: every employee in the (filtered) planilla, plus — when a
  // site is selected — the employees assigned to that site, so their
  // "Workera only" days still surface.
  const scope = new Set<string>();
  for (const row of planilla) if (row.employeeId) scope.add(row.employeeId);
  if (siteId) for (const e of employees) if (e.siteId === siteId) scope.add(e.id);

  const attendance: AttendanceInputRow[] = attendanceRecords
    .filter((a) => (siteId ? scope.has(a.employeeId) : true))
    .map((a) => ({
      employeeId: a.employeeId,
      date: formatDateUtc(a.date),
      status: a.status,
      shift: a.shift,
      hoursWorked: a.hoursWorked,
      timeIn: a.timeIn ? formatTimeChile(a.timeIn) : null,
      timeOut: a.timeOut ? formatTimeChile(a.timeOut) : null,
      corrected: a.corrected,
    }));

  const result = buildAttendanceReconciliation({
    planilla,
    attendance,
    employees: employeeRefs,
    siteNames,
  });

  return {
    from: opts.from,
    to: opts.to,
    siteId,
    truncated: entries.length >= RECONCILIATION_CONFIG.maxRows,
    rows: result.rows,
    summary: result.summary,
  };
}

/**
 * Loads the normalized data for the daily-drilling ↔ Planilla Diaria
 * comparison.
 *
 * Provider-agnostic on purpose: it reads whatever is in RigShiftPerformance —
 * today the Excel intervals report (a CorePlan export), later the CorePlan API —
 * and only exposes the row's `source` so the page can label it. Swapping the
 * source later therefore requires no change here or in the page.
 */
export async function loadDrillingReconciliation(opts: {
  from: string;
  to: string;
  siteId?: string | null;
  tolerance?: number;
}): Promise<DrillingReconciliationView> {
  const fromDate = new Date(`${opts.from}T00:00:00Z`);
  const toDate = new Date(`${opts.to}T00:00:00Z`);
  const siteId = opts.siteId ?? null;
  const tolerance = Math.max(0, opts.tolerance ?? RECONCILIATION_CONFIG.metersTolerance);

  const [entries, performances, rigRows, rigAliases, sites] = await Promise.all([
    db.dailyCrewEntry.findMany({
      where: { date: { gte: fromDate, lte: toDate } },
      select: {
        date: true,
        shiftDayNight: true,
        machine: true,
        metros: true,
        diameter: true,
        escala: true,
      },
      orderBy: [{ date: "asc" }],
      take: RECONCILIATION_CONFIG.maxRows,
    }),
    db.rigShiftPerformance.findMany({
      where: { date: { gte: fromDate, lte: toDate } },
      select: {
        rigId: true,
        date: true,
        shift: true,
        metersDrilled: true,
        hoursSpent: true,
        hole: true,
        drillingLevel: true,
        intervals: true,
        source: true,
      },
      take: RECONCILIATION_CONFIG.maxRows,
    }),
    db.rig.findMany({ select: { id: true, name: true, code: true, siteId: true } }),
    db.rigAlias.findMany({ select: { normalized: true, rigId: true } }),
    db.site.findMany({ select: { id: true, name: true } }),
  ]);

  const rigs = new Map<string, RigRef>(
    rigRows.map((r) => [r.id, { id: r.id, name: r.name, code: r.code, siteId: r.siteId }]),
  );
  const siteNames = new Map(sites.map((s) => [s.id, s.name]));

  // Same resolution as lib/matching/build.ts: planilla MAQUINA text -> rig.
  const rigByMachineKey = new Map<string, string>();
  for (const alias of rigAliases) rigByMachineKey.set(rigKeyOf(alias.normalized), alias.rigId);
  for (const rig of rigRows) rigByMachineKey.set(rigKeyOf(rig.name), rig.id);

  let planilla: PlanillaRigRow[] = entries.map((e) => {
    const machineKey = e.machine ? rigKeyOf(e.machine) : "";
    return {
      date: formatDateUtc(e.date),
      shiftDayNight: e.shiftDayNight === "night" ? "night" : "day",
      machine: e.machine,
      rigId: machineKey ? rigByMachineKey.get(machineKey) ?? null : null,
      metros: e.metros,
      diameter: e.diameter,
      escala: e.escala,
    };
  });

  let performance: RigPerformanceRow[] = performances.map((p) => {
    const intervals = parseIntervals(p.intervals);
    // Same exclusion as the bonus run: grouting passes re-clear an
    // already-drilled hole and never count as drilled production.
    const productive = (intervals ?? []).filter(
      (i) => !isNonProductiveInterval(i.band, i.diameter),
    );
    const productiveMeters = productive.reduce((n, i) => n + (i.meters ?? 0), 0);
    return {
      rigId: p.rigId,
      date: formatDateUtc(p.date),
      shift: p.shift,
      metersDrilled: intervals ? productiveMeters : p.metersDrilled,
      hoursSpent: p.hoursSpent,
      hole: p.hole,
      drillingLevel: p.drillingLevel,
      intervals: productive.length ? productive : intervals,
      source: p.source,
    };
  });

  if (siteId) {
    const isSite = (rigId: string | null) => Boolean(rigId && rigs.get(rigId)?.siteId === siteId);
    planilla = planilla.filter((r) => isSite(r.rigId));
    performance = performance.filter((p) => isSite(p.rigId));
  }

  const result = buildDrillingReconciliation({
    planilla,
    performance,
    rigs,
    siteNames,
    tolerance,
  });

  const rigOptions = [...rigs.values()]
    .map((r) => ({
      id: r.id,
      name: r.name,
      siteName: r.siteId ? siteNames.get(r.siteId) ?? null : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    from: opts.from,
    to: opts.to,
    siteId,
    tolerance,
    truncated: entries.length >= RECONCILIATION_CONFIG.maxRows,
    rows: result.rows,
    summary: result.summary,
    rigOptions,
  };
}

/** Defensive read of the RigShiftPerformance.intervals JSON snapshot. */
function parseIntervals(value: unknown): DrillingInterval[] | null {
  if (!Array.isArray(value)) return null;
  const out: DrillingInterval[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const meters =
      typeof raw.meters === "number" ? raw.meters : Number.parseFloat(String(raw.meters ?? ""));
    out.push({
      band: typeof raw.band === "string" ? raw.band : "",
      escala: typeof raw.escala === "string" ? raw.escala : null,
      diameter: typeof raw.diameter === "string" ? raw.diameter : null,
      meters: Number.isFinite(meters) ? meters : 0,
    });
  }
  return out.length ? out : null;
}
