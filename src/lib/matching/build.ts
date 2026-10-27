import { db } from "@/lib/db";
import { normalizeText, normalizeRut, rigKeyOf } from "@/lib/excel/normalize";
import { formatDateUtc } from "@/lib/datetime";
import { ensureRigAliasesSeeded } from "./rig-aliases";
import { isNonProductiveInterval } from "@/lib/bonus-engine/rate-config";

export type WorkDayFlag =
  | "no-employee" | "no-site-alias" | "no-rig-alias" | "rig-no-performance"
  | "workera-not-marked" | "not-in-planilla" | "multiple-shifts";

export type BuildResult = {
  from: string; to: string; workDays: number;
  flagged: Partial<Record<WorkDayFlag, number>>;
};

type WorkDay = {
  employeeId: string; date: string; shiftDayNight: string;
  turnoAB: string | null; cargoNormalized: string | null;
  positionGroupId: string | null; siteId: string | null;
  workeraStatus: string | null; workeraHours: number | null; rigId: string | null;
  machineRaw: string | null; escala: string | null; diameter: string | null;
  hole: string | null; rigMeters: number | null; rigHours: number | null;
  rigDrillingHours: number | null; rigIntervals: unknown;
  metersAttributed: number | null; flags: string[]; sources: string[];
};

export async function rebuildWorkDays(from: string, to: string): Promise<BuildResult> {
  await ensureRigAliasesSeeded();
  return buildInRange(new Date(`${from}T00:00:00Z`), new Date(`${to}T00:00:00Z`));
}

async function buildInRange(fromDate: Date, toDate: Date): Promise<BuildResult> {
  const from = formatDateUtc(fromDate);
  const to = formatDateUtc(toDate);
    const [planillaEntries, attendances, performances, employees, cargoAliases, mainPositions, rigAliases, rigs, siteAliases] =
    await Promise.all([
      db.dailyCrewEntry.findMany({
        where: { date: { gte: fromDate, lte: toDate } },
        orderBy: [{ date: "asc" }, { orderNumber: "asc" }],
        select: {
          id: true, date: true, projectName: true, orderNumber: true, rut: true,
          rutNormalized: true, fullName: true, cargoNormalized: true,
          machine: true, escala: true, diameter: true, turnoAB: true, shiftDayNight: true,
          metros: true, uploadId: true,
        },
      }),
      db.attendanceRecord.findMany({
        where: { date: { gte: fromDate, lte: toDate } },
        select: { employeeId: true, date: true, hoursWorked: true, status: true },
      }),
      db.rigShiftPerformance.findMany({
        where: { date: { gte: fromDate, lte: toDate } },
        include: { rig: true },
      }),
      db.employee.findMany({ select: { id: true, rut: true } }),
      db.positionAlias.findMany({ select: { normalized: true, groupId: true, mainPositionId: true } }),
      db.mainPosition.findMany({ select: { id: true, groupKey: true } }),
      db.rigAlias.findMany({ select: { normalized: true, rigId: true } }),
      db.rig.findMany({ select: { id: true, name: true } }),
      db.siteAlias.findMany({ select: { normalized: true, siteId: true } }),
    ]);
  const employeeByRut = new Map(
    employees.filter((e) => e.rut).map((e) => [normalizeRut(e.rut as string), e.id]),
  );
    // Group resolution: alias.groupId first; fall back to its Main Position's
    // default group so classification on the Positions page is respected.
    const mainGroupById = new Map(mainPositions.map((m) => [m.id, m.groupKey]));
    const groupByKey = new Map(
      (await db.positionGroup.findMany({ select: { id: true, key: true } })).map((g) => [g.key, g.id]),
    );
    const cargoGroup = new Map(
      cargoAliases.map((a) => [
        a.normalized,
        a.groupId ??
          (a.mainPositionId ? mainGroupById.get(a.mainPositionId) ?? null : null) === null
            ? null
            : groupByKey.get(mainGroupById.get(a.mainPositionId!) ?? "") ?? null,
      ]),
    );
  const rigByAlias = new Map(rigAliases.map((a) => [rigKeyOf(a.normalized), a.rigId]));
  const rigByName = new Map(rigs.map((r) => [rigKeyOf(r.name), r.id]));
  const siteByProyecto = new Map(siteAliases.map((a) => [a.normalized, a.siteId]));
  // Fallback: when a planilla sheet carries no mappable "PROYECTO" text (e.g. it only
  // prints a title), use the site the admin assigned to the uploaded file on /uploads.
  const uploadsWithSite = await db.excelUpload.findMany({
    where: { siteId: { not: null } },
    select: { id: true, siteId: true },
  });
  const siteByUpload = new Map(uploadsWithSite.map((u) => [u.id, u.siteId as string]));
  const perfByRigDateShift = new Map(
    performances.map((p) => [`${p.rigId}|${formatDateUtc(p.date)}|${p.shift}`, p]),
  );
  const attendanceByEmpDate = new Map(
    attendances.map((a) => [`${a.employeeId}|${formatDateUtc(a.date)}`, a]),
  );
  const flagged: Partial<Record<WorkDayFlag, number>> = {};
  const bump = (f: WorkDayFlag) => { flagged[f] = (flagged[f] ?? 0) + 1; };
  const addMeters = (a: number | null, b: number | null): number | null =>
    a === null && b === null ? null : (a ?? 0) + (b ?? 0);
  const byKey = new Map<string, WorkDay>();
  const put = (wd: WorkDay) => {
    const key = `${wd.employeeId}|${wd.date}`;
    const existing = byKey.get(key);
    if (existing) {
      // Same employee + day, SAME shift but a different ESCALA row: the planilla
      // splits one shift's drilling across depth bands, so keep the primary
      // row's attributes and SUM the planilla meters across bands. Only a
      // genuinely different shift (day vs night) is a real "multiple-shifts".
      if (existing.shiftDayNight === wd.shiftDayNight) {
        existing.metersAttributed = addMeters(existing.metersAttributed, wd.metersAttributed);
        existing.flags = [...new Set([...existing.flags, ...wd.flags])];
        existing.sources = [...new Set([...existing.sources, ...wd.sources])];
        return;
      }
      existing.flags = [...new Set([...existing.flags, "multiple-shifts"])];
      bump("multiple-shifts");
      return;
    }
    byKey.set(key, wd);
  };
  for (const entry of planillaEntries) {
    const rutNorm = entry.rutNormalized ?? normalizeRut(entry.rut ?? "");
    let employeeId = rutNorm ? employeeByRut.get(rutNorm) : undefined;
    let isPlaceholder = false;
    if (!employeeId && rutNorm) {
      // Unmatched in Workera: ensure a placeholder Employee exists so we still
      // get a reviewable fact row (and satisfy the Employee FK).
      const emp = await db.employee.upsert({
        where: { rut: rutNorm },
        create: { rut: rutNorm, fullName: entry.fullName || `Sin nombre (${rutNorm})` },
        update: {},
        select: { id: true },
      });
      employeeId = emp.id;
      employeeByRut.set(rutNorm, emp.id);
      isPlaceholder = true;
    }
    const dateStr = formatDateUtc(entry.date);
    const machineNorm = entry.machine ? normalizeText(entry.machine) : null;
    const machineKey = entry.machine ? rigKeyOf(entry.machine) : "";
    const rigId = machineKey ? (rigByAlias.get(machineKey) ?? rigByName.get(machineKey) ?? null) : null;
    const perf = rigId ? perfByRigDateShift.get(`${rigId}|${dateStr}|${entry.shiftDayNight}`) : null;
    // Grouting passes re-clear an already-drilled hole: exclude them from the
    // productive rig metres shown/attributed here (same rule as the bonus run).
    const perfIntervals = Array.isArray(perf?.intervals) ? (perf.intervals as { band?: string; diameter?: string; meters?: number }[]) : null;
    const productiveMeters = perf
      ? perfIntervals
        ? perfIntervals
            .filter((i) => !isNonProductiveInterval(i.band, i.diameter))
            .reduce((n, i) => n + (i.meters ?? 0), 0)
        : (perf.metersDrilled ?? null)
      : null;
    const att = employeeId ? attendanceByEmpDate.get(`${employeeId}|${dateStr}`) : undefined;
    const siteId = entry.projectName ? siteByProyecto.get(normalizeText(entry.projectName)) ?? null : null;
    const resolvedSiteId = siteId ?? siteByUpload.get(entry.uploadId) ?? null;
    const flags: string[] = [];
    const sources: string[] = ["planilla"];
    if (isPlaceholder) { flags.push("no-employee"); bump("no-employee"); }
    if (!resolvedSiteId) { flags.push("no-site-alias"); bump("no-site-alias"); }
    if (machineNorm && !rigId) { flags.push("no-rig-alias"); bump("no-rig-alias"); }
    if (rigId && !perf) { flags.push("rig-no-performance"); bump("rig-no-performance"); }
    if (!att || att.status === "absent") { flags.push("workera-not-marked"); bump("workera-not-marked"); }
    if (att) sources.push("workera");
    if (perf) sources.push("rig-intervals");
    put({
      employeeId: employeeId ?? (rutNorm ? `unmatched:${rutNorm}` : `unmatched:${entry.rut}`),
      date: dateStr, shiftDayNight: entry.shiftDayNight, turnoAB: entry.turnoAB,
      cargoNormalized: entry.cargoNormalized,
      positionGroupId: entry.cargoNormalized ? cargoGroup.get(entry.cargoNormalized) ?? null : null,
      siteId: resolvedSiteId,
      workeraStatus: att?.status ?? null, workeraHours: att?.hoursWorked ?? null,
      rigId, machineRaw: entry.machine, escala: entry.escala, diameter: entry.diameter,
      hole: perf?.hole ?? null, rigMeters: productiveMeters ?? null,
      rigHours: perf?.hoursSpent ?? null,
      rigDrillingHours: (perf?.rawData as { drillingHours?: number })?.drillingHours ?? null,
      rigIntervals: perf?.intervals ?? null, metersAttributed: entry.metros ?? productiveMeters ?? null,
      flags, sources,
    });
  }
  for (const att of attendances) {
    if (att.status === "absent") continue;
    const dateStr = formatDateUtc(att.date);
    if (byKey.has(`${att.employeeId}|${dateStr}`)) continue;
    bump("not-in-planilla");
    put({
      employeeId: att.employeeId, date: dateStr, shiftDayNight: "unknown",
      turnoAB: null, cargoNormalized: null, positionGroupId: null, siteId: null,
      workeraStatus: att.status, workeraHours: att.hoursWorked,
      rigId: null, machineRaw: null, escala: null, diameter: null, hole: null,
      rigMeters: null, rigHours: null, rigDrillingHours: null, rigIntervals: null,
      metersAttributed: null, flags: ["not-in-planilla"], sources: ["workera"],
    });
  }
  await db.employeeWorkDay.deleteMany({ where: { date: { gte: fromDate, lte: toDate } } });
  if (byKey.size > 0) {
    await db.employeeWorkDay.createMany({
      data: Array.from(byKey.values()).map((wd) => ({
        employeeId: wd.employeeId, date: new Date(`${wd.date}T00:00:00Z`),
        shiftDayNight: wd.shiftDayNight, turnoAB: wd.turnoAB,
        cargoNormalized: wd.cargoNormalized, positionGroupId: wd.positionGroupId, siteId: wd.siteId,
        workeraStatus: wd.workeraStatus, workeraHours: wd.workeraHours,
        rigId: wd.rigId, machineRaw: wd.machineRaw, escala: wd.escala,
        diameter: wd.diameter, hole: wd.hole, rigMeters: wd.rigMeters,
        rigHours: wd.rigHours, rigDrillingHours: wd.rigDrillingHours,
        rigIntervals: wd.rigIntervals ?? undefined, metersAttributed: wd.metersAttributed,
        flags: wd.flags, sources: wd.sources,
      })),
    });
  }
  return { from, to, workDays: byKey.size, flagged };
}

export type WorkDayRow = {
  id: string; employeeId: string; employeeName: string; employeeRut: string | null;
  siteName: string | null;
  date: string; shiftDayNight: string; turnoAB: string | null;
  positionGroup: string | null; workeraStatus: string | null;
  workeraHours: number | null; rigName: string | null; machineRaw: string | null;
  escala: string | null; hole: string | null; rigMeters: number | null;
  rigHours: number | null; metersAttributed: number | null;
  flags: string[]; sources: string[];
};

export async function queryWorkDays(opts: {
  from: string; to: string; employeeId?: string;
  rigId?: string; hasFlags?: boolean;
}): Promise<WorkDayRow[]> {
  const where: Record<string, unknown> = {
    date: { gte: new Date(`${opts.from}T00:00:00Z`), lte: new Date(`${opts.to}T00:00:00Z`) },
  };
  if (opts.employeeId) where.employeeId = opts.employeeId;
  if (opts.rigId) where.rigId = opts.rigId;
  if (opts.hasFlags) where.flags = { isEmpty: false };
  const rows = await db.employeeWorkDay.findMany({
    where,
    include: { employee: true, rig: true, positionGroup: true, site: true },
    orderBy: [{ date: "asc" }, { employee: { fullName: "asc" } }],
  });
  return rows.map((r) => ({
    id: r.id, employeeId: r.employeeId,
    employeeName: r.employee?.fullName ?? r.employeeId,
    employeeRut: r.employee?.rut ?? null,
    siteName: r.site?.name ?? null,
    date: formatDateUtc(r.date), shiftDayNight: r.shiftDayNight,
    turnoAB: r.turnoAB, positionGroup: r.positionGroup?.name ?? null,
    workeraStatus: r.workeraStatus, workeraHours: r.workeraHours,
    rigName: r.rig?.name ?? null, machineRaw: r.machineRaw,
    escala: r.escala, hole: r.hole, rigMeters: r.rigMeters,
    rigHours: r.rigHours, metersAttributed: r.metersAttributed,
    flags: Array.isArray(r.flags) ? (r.flags as string[]) : [],
    sources: Array.isArray(r.sources) ? (r.sources as string[]) : [],
  }));
}

export type EmployeeSummary = {
  employeeId: string; employeeName: string; employeeRut: string | null;
  siteName: string | null;
  positionGroup: string | null; daysWorked: number; daysPresent: number;
  totalMeters: number; totalHours: number; rigs: string[]; flags: number;
  shiftDayCount: number; shiftNightCount: number;
  turnoA: number; turnoB: number;
};

export async function queryEmployeeSummary(opts: {
  from: string; to: string;
}): Promise<EmployeeSummary[]> {
  const rows = await db.employeeWorkDay.findMany({
    where: {
      date: { gte: new Date(`${opts.from}T00:00:00Z`), lte: new Date(`${opts.to}T00:00:00Z`) },
      employeeId: { not: { startsWith: "unmatched:" } },
    },
    include: { employee: true, rig: true, positionGroup: true, site: true },
    orderBy: { employee: { fullName: "asc" } },
  });
  const byEmp = new Map<string, EmployeeSummary>();
  for (const r of rows) {
    let s = byEmp.get(r.employeeId);
    if (!s) {
            s = {
        employeeId: r.employeeId,
        employeeName: r.employee?.fullName ?? r.employeeId,
        employeeRut: r.employee?.rut ?? null,
        siteName: r.site?.name ?? null,
        positionGroup: r.positionGroup?.name ?? null,
        daysWorked: 0, daysPresent: 0, totalMeters: 0,
        totalHours: 0, rigs: [], flags: 0,
        shiftDayCount: 0, shiftNightCount: 0, turnoA: 0, turnoB: 0,
      };
      byEmp.set(r.employeeId, s);
    }
    s.daysWorked++;
    if (r.workeraStatus && r.workeraStatus !== "absent") s.daysPresent++;
    s.totalMeters += r.metersAttributed ?? 0;
    s.totalHours += r.workeraHours ?? 0;
    if (r.shiftDayNight === "day") s.shiftDayCount++;
    else if (r.shiftDayNight === "night") s.shiftNightCount++;
    if (r.turnoAB === "A") s.turnoA++;
    else if (r.turnoAB === "B") s.turnoB++;
    if (r.rig?.name && !s.rigs.includes(r.rig.name)) s.rigs.push(r.rig.name);
    if (Array.isArray(r.flags) && r.flags.length > 0) s.flags++;
  }
  return Array.from(byEmp.values());
}
