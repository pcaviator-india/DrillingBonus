/**
 * Cross-check of the normalized data against the source files, for ALL sites.
 *
 *   1) Attendance      : Workera attendance  vs  Planilla Diaria attendance
 *                        (RUT+date match, plus the planilla's own "workera entrada/salida" mark)
 *   2) Drilling meters : interval report (CorePlan export) per rig/day/shift
 *                        vs  the Planilla Diaria METROS for that rig/day/shift
 *   3) Turn A/B        : turn read from the planilla (TURNO A/B sections)
 *                        vs  the manual turn schedule the engine uses
 *
 * Usage: npx tsx scripts/verify-planilla-sources.ts [from] [to] [--detail]
 */
import "dotenv/config";
import { db } from "../src/lib/db";
import { normalizeRut, normalizeText, rigKeyOf } from "../src/lib/excel/normalize";

const args = process.argv.slice(2).filter((a) => a !== "--detail");
const DETAIL = process.argv.includes("--detail");
const FROM = args[0] ?? "2026-08-01";
const TO = args[1] ?? "2026-08-31";

const fmt = (d: Date) => d.toISOString().slice(0, 10);
const num = (n: number | null | undefined) => (n === null || n === undefined ? "-" : n.toFixed(2));

type SiteBucket = {
  siteId: string;
  siteName: string;
  planillaRows: number;
  planillaPairs: Set<string>;
  workeraPairs: Set<string>;
  markedIn: number;
  markedOut: number;
  notMarked: number;
  noWorkeraRecord: number;
  saysMarkedButNoRecord: number;
  saysNotMarkedButPresent: number;
  planillaMeters: Map<string, { meters: number; rows: number; values: Set<number> }>;
  perfMeters: Map<string, number>;
  turnPlanilla: Map<string, number>;
  turnManual: Map<string, number>;
  employeeCount: number;
  employeesWithAttendance: Set<string>;
  assignments: number;
  assignmentsWithPerf: number;
  expectedAssignKeys: Set<string>;
  actualAssignKeys: Set<string>;
  rowsWithoutEmployee: number;
  rowsWithoutRig: number;
};

const buckets = new Map<string, SiteBucket>();

function bucketOf(siteId: string | null, siteName: string): SiteBucket {
  const key = siteId ?? `unassigned:${siteName}`;
  let b = buckets.get(key);
  if (!b) {
    b = {
      siteId: siteId ?? "(no site)",
      siteName,
      planillaRows: 0,
      planillaPairs: new Set(),
      workeraPairs: new Set(),
      markedIn: 0,
      markedOut: 0,
      notMarked: 0,
      noWorkeraRecord: 0,
      saysMarkedButNoRecord: 0,
      saysNotMarkedButPresent: 0,
      planillaMeters: new Map(),
      perfMeters: new Map(),
      turnPlanilla: new Map(),
      turnManual: new Map(),
      employeeCount: 0,
      employeesWithAttendance: new Set(),
      assignments: 0,
      assignmentsWithPerf: 0,
      expectedAssignKeys: new Set(),
      actualAssignKeys: new Set(),
      rowsWithoutEmployee: 0,
      rowsWithoutRig: 0,
    };
    buckets.set(key, b);
  }
  return b;
}

type Rig = { id: string; name: string; siteId: string | null };
type Emp = { id: string; fullName: string; siteId: string | null };

type Ctx = {
  rigById: Map<string, Rig>;
  rigByMachineKey: Map<string, string>;
  empById: Map<string, Emp>;
  empByRut: Map<string, Emp>;
};

type PlanillaRow = {
  date: Date; projectName: string | null; rut: string; rutNormalized: string;
  machine: string | null; metros: number | null; turnoAB: string | null;
  shiftDayNight: string; workeraMarkedIn: boolean | null; uploadId: string;
};

function loadPlanilla(
  entries: PlanillaRow[],
  siteByProyecto: Map<string, string>,
  siteByUpload: Map<string, string>,
  ctx: Ctx,
  present: Set<string>,
) {
  for (const e of entries) {
    const proyectoSite = e.projectName ? siteByProyecto.get(normalizeText(e.projectName)) ?? null : null;
    // Same fallback as matching/build.ts: the site the admin assigned to the
    // uploaded file on /uploads wins when the proyecto text has no alias.
    const siteId = proyectoSite ?? siteByUpload.get(e.uploadId) ?? null;
    const b = bucketOf(siteId, e.projectName ?? "(null proyecto)");
    b.planillaRows++;
    const emp = ctx.empByRut.get(e.rutNormalized || normalizeRut(e.rut));
    const pairKey = emp ? `${emp.id}|${fmt(e.date)}` : null;
    const inWorkera = pairKey ? present.has(pairKey) : false;
    if (pairKey) {
      b.planillaPairs.add(pairKey);
      if (!inWorkera) b.noWorkeraRecord++;
    }
    if (e.workeraMarkedIn === true) {
      b.markedIn++;
      if (!inWorkera) b.saysMarkedButNoRecord++;
    } else if (e.workeraMarkedIn === false) {
      b.notMarked++;
      if (inWorkera) b.saysNotMarkedButPresent++;
    }
    const turnKey = String(e.turnoAB ?? "(none)");
    b.turnPlanilla.set(turnKey, (b.turnPlanilla.get(turnKey) ?? 0) + 1);

    // METROS repeats for every crew row of the same rig+day+shift: keep the max.
    const machineKey = e.machine ? rigKeyOf(e.machine) : "";
    const rigId = machineKey ? ctx.rigByMachineKey.get(machineKey) ?? null : null;
    if (!emp) b.rowsWithoutEmployee++;
    if (!rigId) b.rowsWithoutRig++;
    if (emp && rigId) {
      b.expectedAssignKeys.add(`${emp.id}|${rigId}|${fmt(e.date)}|${e.shiftDayNight}`);
    }
    if (rigId && e.metros !== null) {
      const k = `${rigId}|${fmt(e.date)}|${e.shiftDayNight}`;
      const cur = b.planillaMeters.get(k);
      if (!cur) b.planillaMeters.set(k, { meters: e.metros, rows: 1, values: new Set([e.metros]) });
      else {
        cur.rows++;
        cur.values.add(e.metros);
        cur.meters = Math.max(cur.meters, e.metros);
      }
    }
  }
}

function loadPerformance(
  performances: Array<{ rigId: string; date: Date; shift: string; metersDrilled: number }>,
  ctx: Ctx,
) {
  for (const p of performances) {
    const rig = ctx.rigById.get(p.rigId);
    const b = bucketOf(rig?.siteId ?? null, rig?.siteId ? "" : `(rig ${rig?.name ?? p.rigId} without site)`);
    const k = `${p.rigId}|${fmt(p.date)}|${p.shift}`;
    b.perfMeters.set(k, (b.perfMeters.get(k) ?? 0) + (p.metersDrilled ?? 0));
  }
}

function rigNameOf(key: string, ctx: Ctx): string {
  const id = key.split("|")[0];
  return ctx.rigById.get(id)?.name ?? id;
}

function reportBucket(b: SiteBucket, ctx: Ctx) {
  const both = [...b.planillaPairs].filter((k) => b.workeraPairs.has(k)).length;
  const planillaOnly = b.planillaPairs.size - both;
  const workeraOnly = [...b.workeraPairs].filter((k) => !b.planillaPairs.has(k)).length;

  console.log(`\n================ SITE: ${b.siteName || b.siteId}`);
  console.log(`  planilla rows=${b.planillaRows}  distinct(employee,day)=${b.planillaPairs.size}`);
  console.log(`  [1] ATTENDANCE  matched=${both}  planilla-only(no Workera mark)=${planillaOnly}  workera-only(not in planilla)=${workeraOnly}`);
  console.log(`      planilla "workera entrada": Si=${b.markedIn} No=${b.notMarked}`);
  console.log(`      conflicts: planilla says Si but NO Workera record=${b.saysMarkedButNoRecord} | planilla says No but Workera HAS record=${b.saysNotMarkedButPresent}`);
  console.log(`      site employees=${b.employeeCount}  with >=1 Workera mark in range=${b.employeesWithAttendance.size}`);
  console.log(`  [3] TURN from planilla: ${[...b.turnPlanilla.entries()].sort().map(([k, v]) => `${k}=${v}`).join("  ") || "-"}`);
  console.log(`      TURN manual schedule : ${[...b.turnManual.entries()].sort().map(([k, v]) => `${k}=${v}`).join("  ") || "(none)"}`);

  const keys = new Set([...b.planillaMeters.keys(), ...b.perfMeters.keys()]);
  let plTotal = 0, perfTotal = 0, matchedKeys = 0, plOnly = 0, perfOnly = 0, diffs = 0, dupValues = 0;
  const detail: string[] = [];
  for (const k of keys) {
    const [date, shift] = [k.split("|")[1], k.split("|")[2]];
    const pl = b.planillaMeters.get(k);
    const perf = b.perfMeters.get(k);
    plTotal += pl?.meters ?? 0;
    perfTotal += perf ?? 0;
    if (pl && pl.values.size > 1) dupValues++;
    if (pl && perf !== undefined) {
      matchedKeys++;
      if (Math.abs(pl.meters - perf) > 0.011) {
        diffs++;
        detail.push(`      D ${date} ${shift} ${rigNameOf(k, ctx)}: planilla=${num(pl.meters)} intervals=${num(perf)} (${pl.rows} crew rows)`);
      }
    } else if (pl) {
      plOnly++;
      detail.push(`      + ${date} ${shift} ${rigNameOf(k, ctx)}: planilla=${num(pl.meters)} but NO interval row`);
    } else {
      perfOnly++;
      detail.push(`      - ${date} ${shift} ${rigNameOf(k, ctx)}: intervals=${num(perf ?? 0)} but NO planilla row`);
    }
  }
  console.log(`  [2] DRILLING (rig+day+shift keys=${keys.size})`);
  console.log(`      planilla SUM=${num(plTotal)} m   intervals SUM=${num(perfTotal)} m   both=${matchedKeys} planilla-only=${plOnly} intervals-only=${perfOnly} value-diff=${diffs}`);
  if (dupValues > 0) console.log(`      note: ${dupValues} key(s) where crew rows disagreed on METROS (max used)`);
  console.log(`  [E] ENGINE INPUT (what runCalculation consumes): crewAssignments=${b.assignments} with rig performance=${b.assignmentsWithPerf} without=${b.assignments - b.assignmentsWithPerf}`);
  console.log(`      expected from planilla=${b.expectedAssignKeys.size} (rows without employee=${b.rowsWithoutEmployee}, without rig=${b.rowsWithoutRig})`);

  // A planilla day is "invisible to runCalculation" when its employee is not one of
  // this site's employees (placeholder row without a site, or a worker assigned to
  // another site): the engine only loads employees WHERE siteId = <calculated site>.
  const missing = [...b.expectedAssignKeys].filter((k) => !b.actualAssignKeys.has(k));
  let noSite = 0, otherSite = 0, sameSiteNoRow = 0;
  const samples: string[] = [];
  for (const k of missing) {
    const [empId, rigId, date, shift] = k.split("|");
    const emp = ctx.empById.get(empId);
    const kind = !emp?.siteId ? "no-site(placeholder)" : emp.siteId !== b.siteId ? "other-site" : "same-site-no-row";
    if (kind === "no-site(placeholder)") noSite++;
    else if (kind === "other-site") otherSite++;
    else sameSiteNoRow++;
    if (samples.length < 8) {
      samples.push(`        ${date} ${shift} ${emp?.fullName ?? empId} @ ${ctx.rigById.get(rigId)?.name ?? rigId} [${kind}]`);
    }
  }
  console.log(`      planilla days NOT visible to this site's calculation=${missing.length} (no-site/placeholder=${noSite}, other-site=${otherSite}, same-site but no assignment row=${sameSiteNoRow})`);
  if (DETAIL && samples.length) {
    console.log("      samples:");
    console.log(samples.join("\n"));
    const byDate = new Map<string, number>();
    const byShift = new Map<string, number>();
    for (const k of missing) {
      const [, , date, shift] = k.split("|");
      byDate.set(date, (byDate.get(date) ?? 0) + 1);
      byShift.set(shift, (byShift.get(shift) ?? 0) + 1);
    }
    console.log(`      by shift: ${[...byShift.entries()].map(([s, n]) => `${s}=${n}`).join(" ")}`);
    console.log(`      by date: ${[...byDate.entries()].sort().map(([d, n]) => `${d}=${n}`).join(" ")}`);
  }
  if (DETAIL && detail.length) {
    console.log("      details:");
    console.log(detail.slice(0, 80).join("\n"));
    if (detail.length > 80) console.log(`      ... ${detail.length - 80} more`);
  }
}
async function main() {
  console.log(`=== Planilla vs sources - ${FROM} .. ${TO}${DETAIL ? " (detail)" : ""}`);
  const from = new Date(`${FROM}T00:00:00Z`);
  const to = new Date(`${TO}T00:00:00Z`);

  const [sites, aliases, entries, employees, attendances, uploads, performances, rigs, rigAliases, schedules] =
    await Promise.all([
      db.site.findMany({ orderBy: { name: "asc" } }),
      db.siteAlias.findMany(),
      db.dailyCrewEntry.findMany({
        where: { date: { gte: from, lte: to } },
        select: {
          date: true, projectName: true, rut: true, rutNormalized: true,
          machine: true, metros: true, turnoAB: true, shiftDayNight: true, workeraMarkedIn: true,
          uploadId: true,
        },
      }),
      db.employee.findMany({ select: { id: true, rut: true, fullName: true, siteId: true } }),
      db.attendanceRecord.findMany({
        where: { date: { gte: from, lte: to } },
        select: { employeeId: true, date: true, status: true },
      }),
      db.excelUpload.findMany({ select: { id: true, siteId: true } }),
      db.rigShiftPerformance.findMany({
        where: { date: { gte: from, lte: to } },
        select: { rigId: true, date: true, shift: true, metersDrilled: true },
      }),
      db.rig.findMany({ select: { id: true, name: true, siteId: true } }),
      db.rigAlias.findMany({ select: { normalized: true, rigId: true } }),
      db.employeeTurnSchedule.findMany({
        where: { date: { gte: from, lte: to } },
        select: { employeeId: true, date: true, turn: true },
      }),
    ]);

  const siteByProyecto = new Map(aliases.map((a) => [a.normalized, a.siteId]));
  const ctx: Ctx = {
    rigById: new Map(rigs.map((r) => [r.id, r])),
    rigByMachineKey: new Map(),
    empById: new Map(employees.map((e) => [e.id, e])),
    empByRut: new Map(employees.filter((e) => e.rut).map((e) => [normalizeRut(e.rut as string), e])),
  };
  for (const a of rigAliases) ctx.rigByMachineKey.set(rigKeyOf(a.normalized), a.rigId);
  for (const r of rigs) ctx.rigByMachineKey.set(rigKeyOf(r.name), r.id);

  for (const s of sites) bucketOf(s.id, s.name);

  // Same fallback as buildWorkDays: when the sheet proyecto text has no alias,
  // the site assigned to the uploaded file on /uploads wins.
  const siteByUpload = new Map(
    uploads.filter((u) => u.siteId).map((u) => [u.id, u.siteId as string]),
  );

  // Site headcount (from the employees synced from Workera)
  for (const e of employees) {
    if (!e.siteId) continue;
    const b = buckets.get(e.siteId);
    if (b) b.employeeCount++;
  }

  const present = new Set<string>();
  for (const a of attendances) {
    if (a.status === "absent") continue;
    present.add(`${a.employeeId}|${fmt(a.date)}`);
  }

  loadPlanilla(entries, siteByProyecto, siteByUpload, ctx, present);

  for (const a of attendances) {
    if (a.status === "absent") continue;
    const emp = ctx.empById.get(a.employeeId);
    const b = bucketOf(emp?.siteId ?? null, emp?.siteId ? "" : "(employee without site)");
    b.workeraPairs.add(`${a.employeeId}|${fmt(a.date)}`);
    b.employeesWithAttendance.add(a.employeeId);
  }

  loadPerformance(performances, ctx);

  // Engine input: CrewAssignment rows (created from the planilla) + rig performance join
  const perfKeys = new Set(performances.map((p) => `${p.rigId}|${fmt(p.date)}|${p.shift}`));
  const assignments = await db.crewAssignment.findMany({
    where: { date: { gte: from, lte: to } },
    select: { employeeId: true, rigId: true, date: true, shift: true },
  });
  for (const a of assignments) {
    const emp = ctx.empById.get(a.employeeId);
    const b = bucketOf(emp?.siteId ?? null, emp?.siteId ? "" : "(employee without site)");
    b.assignments++;
    const shift = a.shift ?? "day";
    b.actualAssignKeys.add(`${a.employeeId}|${a.rigId}|${fmt(a.date)}|${shift}`);
    if (perfKeys.has(`${a.rigId}|${fmt(a.date)}|${shift}`)) b.assignmentsWithPerf++;
  }

  for (const s of schedules) {
    const emp = ctx.empById.get(s.employeeId);
    const b = bucketOf(emp?.siteId ?? null, emp?.siteId ? "" : "(employee without site)");
    b.turnManual.set(s.turn, (b.turnManual.get(s.turn) ?? 0) + 1);
  }

  for (const b of buckets.values()) {
    if (b.planillaRows === 0 && b.workeraPairs.size === 0 && b.perfMeters.size === 0) continue;
    reportBucket(b, ctx);
  }
}

main()
  .catch((e) => {
    console.error("FAILED:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });