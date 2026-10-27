import { db } from "@/lib/db";
import { workeraClient } from "./client";
import type { WorkeraAttendance, WorkeraEmployee, WorkeraOrgUnit } from "./types";
import { normalizeRut } from "@/lib/excel/normalize";
import { determineShift } from "@/lib/config";
import { autoApprovePending } from "@/lib/attribution/auto-approve";
import { parseChileLocal, formatDateChile, chileHour } from "@/lib/datetime";
import {
  createSyncUnits,
  recordSyncUnit,
  resetSyncUnitsForRetry,
  type SyncUnitReport,
} from "@/lib/jobs/service";

export type SyncResult = {
  employeesCreated: number;
  employeesUpdated: number;
  attendanceUpserted: number;
  /** Detail counters for the attendance bubble (undefined for employee-only syncs). */
  rawMarks?: number;
  daysAggregated?: number;
  skippedUnknown?: number;
  autoApproved?: number;
};

export type OrgUnitImportResult = {
  branchesImported: number;
  departmentsImported: number;
};

/** Imports /branchOffice and /department lists for the scope selection UI */
export async function importOrgUnitsFromWorkera(): Promise<OrgUnitImportResult> {
  const [branches, departments] = await Promise.all([
    workeraClient.fetchBranchOffices(),
    workeraClient.fetchDepartments(),
  ]);

  await Promise.all(
    branches.flatMap((b) => [
      db.branchOffice.upsert({
        where: { code: b.code },
        create: { code: b.code, name: b.name ?? null },
        update: { name: b.name ?? null },
      }),
    ]),
  );
  await Promise.all(
    departments.flatMap((d) => [
      db.department.upsert({
        where: { code: d.code },
        create: { code: d.code, name: d.name ?? null },
        update: { name: d.name ?? null },
      }),
    ]),
  );

  return { branchesImported: branches.length, departmentsImported: departments.length };
}

/** Scope pairs currently selected in the DB (cartesian of selected branches × departments) */
export async function getSelectedScopePairs(): Promise<
  { branchOffice: string; department: string }[]
> {
  const [branches, departments] = await Promise.all([
    db.branchOffice.findMany({ where: { selected: true } }),
    db.department.findMany({ where: { selected: true } }),
  ]);
  const pairs: { branchOffice: string; department: string }[] = [];
  for (const b of branches) {
    for (const d of departments) {
      pairs.push({ branchOffice: b.code, department: d.code });
    }
  }
  return pairs;
}

export async function setBranchSelected(code: string, selected: boolean) {
  await db.branchOffice.update({ where: { code }, data: { selected } });
}

export async function setDepartmentSelected(code: string, selected: boolean) {
  await db.department.update({ where: { code }, data: { selected } });
}

function fullNameOf(emp: WorkeraEmployee): string {
  return [emp.name, emp.secondName, emp.lastName, emp.secondLastName]
    .filter((p): p is string => Boolean(p && p.trim()))
    .join(" ")
    .trim();
}

/**
 * Keep the Positions registry in sync with Workera roles: Role rows +
 * jobPositionName values become PositionAlias rows so every Attendance-page
 * role is visible/classifiable on the Positions page (previously Workera
 * roles like "LIDER DE PREVENCION" were invisible → no group token → 0 for
 * group-filtered bonus rules). Failures never break the sync itself.
 */
async function syncPositionRegistry(): Promise<void> {
  try {
    const { ensureGroupsSeeded, ensureMainPositionsSeeded, registerRolesFromWorkera } =
      await import("@/lib/positions/registry");
    await ensureGroupsSeeded();
    await ensureMainPositionsSeeded();
    const created = await registerRolesFromWorkera();
    if (created > 0) {
      console.log(`[workera] ${created} new role alias(es) registered on Positions page`);
    }
  } catch (err) {
    console.warn("[workera] position registry sync skipped:", err);
  }
}

/**
 * Syncs employees from Workera into the normalized Employee/Site models.
 * Workera has no "drilling role" concept – default roles are assigned via the
 * crew assignment Excel / future UI, so defaultRoleId is left untouched here.
 */
export async function syncEmployeesFromWorkera(): Promise<SyncResult> {
  const pairs = await getSelectedScopePairs();
  if (pairs.length === 0) {
    throw new Error("No scope selected: pick at least one branch office and department first");
  }
  const employees = await workeraClient.fetchEmployees(pairs);
  const cargos = await workeraClient.fetchJobPositions();
  const cargoNameByCode = new Map(
    cargos
      .filter((c) => c.code)
      .map((c) => [String(c.code) as string, c.name as string]),
  );

  // Site = branch office (sucursal) — dedupe and upsert once
  const branchCodes = [...new Set(employees.map((e) => e.branchOfficeCode).filter(Boolean))] as string[];
  const siteIdByCode = new Map<string, string>();
  await Promise.all(
    branchCodes.map(async (code) => {
      const name = employees.find((e) => e.branchOfficeCode === code)?.branchOfficeName ?? code;
      const site = await db.site.upsert({
        where: { code },
        create: { name: name ?? code, code },
        update: { name: name ?? code },
      });
      siteIdByCode.set(code, site.id);
    }),
  );

  // Cargo → Role (name unique): resolve each distinct jobPosition to a Role row
  const cargoCodes = [
    ...new Set(employees.map((e) => e.jobPositionCode).filter((c): c is string => Boolean(c))),
  ];
  const roleIdByCode = new Map<string, string>();
  await Promise.all(
    cargoCodes.map(async (code) => {
      const name = cargoNameByCode.get(code) ?? `Cargo ${code}`;
      const role = await db.role.upsert({
        where: { name },
        create: { name, source: "workera", sourceCode: code },
        update: { source: "workera", sourceCode: code },
      });
      roleIdByCode.set(code, role.id);
    }),
  );

  const rows = employees.map((emp) => {
    const cargoCode = emp.jobPositionCode ?? null;
    return {
      workeraId: emp.code,
      fullName: fullNameOf(emp),
      rut: emp.identification ?? null,
      siteId: emp.branchOfficeCode ? (siteIdByCode.get(emp.branchOfficeCode) ?? null) : null,
      isActive: emp.employeeStatus === "ACTIVO",
      defaultRoleId: cargoCode ? (roleIdByCode.get(cargoCode) ?? null) : null,
      jobPositionCode: cargoCode,
      jobPositionName: cargoCode ? (cargoNameByCode.get(cargoCode) ?? null) : null,
      costCenterCode: emp.costCenterCode ?? null,
      costCenterName: emp.costCenterName ?? null,
      departmentCode: emp.departmentCode ?? null,
      departmentName: emp.departmentName ?? null,
      nationality: emp.nationality ?? null,
      rawData: emp as unknown as object,
    };
  });

  // Parallel upserts in chunks – a remote Postgres makes sequential writes
  // over hundreds of employees painfully slow.
  const CHUNK = 25;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await Promise.all(
      rows.slice(i, i + CHUNK).map((r) =>
        db.employee.upsert({
          where: { workeraId: r.workeraId },
          create: {
            fullName: r.fullName,
            rut: r.rut,
            workeraId: r.workeraId,
            siteId: r.siteId,
            isActive: r.isActive,
            defaultRoleId: r.defaultRoleId,
            jobPositionCode: r.jobPositionCode,
            jobPositionName: r.jobPositionName,
            costCenterCode: r.costCenterCode,
            costCenterName: r.costCenterName,
            departmentCode: r.departmentCode,
            departmentName: r.departmentName,
            nationality: r.nationality,
            rawData: r.rawData,
          },
          update: {
            fullName: r.fullName,
            rut: r.rut,
            siteId: r.siteId,
            isActive: r.isActive,
            defaultRoleId: r.defaultRoleId,
            jobPositionCode: r.jobPositionCode,
            jobPositionName: r.jobPositionName,
            costCenterCode: r.costCenterCode,
            costCenterName: r.costCenterName,
            departmentCode: r.departmentCode,
            departmentName: r.departmentName,
            nationality: r.nationality,
            rawData: r.rawData,
          },
        }),
      ),
    );
  }

  // Keep the Positions registry in sync with Workera roles (see helper).
  await syncPositionRegistry();

  return {
    employeesCreated: 0,
    employeesUpdated: rows.length,
    attendanceUpserted: 0,
  };
}


/**
 * Aggregates raw punch marks into one AttendanceRecord per employee per workday,
 * using in→out pairing so overnight (night shift) pairs are handled correctly.
 * For each workday (keyed by the clock-in date) it produces:
 *   - timeIn  = earliest clock-in
 *   - timeOut = latest clock-out
 *   - hoursWorked = sum of (out − in) across pairs on that day (decimal hours)
 *   - shift  = day/night derived from the first clock-in hour
 *   - status = "present" when at least one clock-in exists
 *
 * Duplicate-mark handling (mis-punches):
 *   - IN, IN, OUT  → pairs earliest IN → OUT (extra IN ignored). The correct
 *     clock-in for a turn is its first mark; a repeated "IN at out time" would
 *     otherwise produce a ~0h pair and corrupt hours.
 *   - IN, OUT, OUT → earliest IN → latest OUT (extra OUT extends the turn).
 *   - OUT, IN, OUT (out marked as IN by error, then corrected) → the stray
 *     leading OUT is kept and paired with the next OUT as an IN-less segment
 *     rather than dropped: latest OUT still recorded, hours counted from the
 *     first mark of the segment.
 *   - trailing IN with no OUT → open turn: timeOut stays null, hours counted 0.
 */
export type AttendanceDay = {
  employeeCode: string;
  /** Normalized RUT from Workera's `employee.identification`; used to attribute
   * marks when Workera's internal `code`/`workeraId` isn't mapped to an employee. */
  employeeRut: string | null;
  date: string;
  timeIn: string | null;
  timeOut: string | null;
  hoursWorked: number | null;
  status: string;
  shift: string | null;
  corrected: boolean; // true when duplicate/mis-ordered marks were cleaned
  needsReview: boolean; // true when punches are missing, duplicates removed, or shift is ambiguous
  // Mark details of the clock-in / clock-out punches
  inOrigin: string | null;
  inDevice: string | null;
  inAddress: string | null;
  inIsMobile: boolean | null;
  inCoordinates: string | null;
  outOrigin: string | null;
  outDevice: string | null;
  outAddress: string | null;
  outIsMobile: boolean | null;
  outCoordinates: string | null;
};

function aggregateAttendance(marks: WorkeraAttendance[]): AttendanceDay[] {
  // Live API returns "Activo"/"Activo" (capitalized); match case-insensitively.
  const active = marks.filter((m) => (m.attendanceStatus ?? "").toUpperCase() !== "INACTIVO");

  // Group marks per employee, sorted by time
  const byEmp = new Map<string, WorkeraAttendance[]>();
  for (const m of active) {
    const list = byEmp.get(m.employee.code) ?? [];
    list.push(m);
    byEmp.set(m.employee.code, list);
  }

  const dayMap = new Map<string, {
    employeeCode: string;
    employeeRut: string | null;
    date: string;
    timeIn: Date | null;
    timeOut: Date | null;
    hours: number;
    shift: string | null;
    shiftSet: boolean;
    corrected: boolean;
    needsReview: boolean;
    inOrigin: string | null;
    inDevice: string | null;
    inAddress: string | null;
    inIsMobile: boolean | null;
    inCoordinates: string | null;
    outOrigin: string | null;
    outDevice: string | null;
    outAddress: string | null;
    outIsMobile: boolean | null;
    outCoordinates: string | null;
  }>();

  const markDetails = (m: WorkeraAttendance) => ({
    origin: m.origin ?? null,
    device: m.deviceName ?? null,
    address: m.address ?? null,
    isMobile: m.isMobile ?? null,
    coordinates: m.coordinatesMobile ?? null,
  });

  for (const [code, list] of byEmp) {
    list.sort((a, b) => a.attendanceDate.localeCompare(b.attendanceDate));
    // Segment pairing: IN..OUT closes on OUT; repeated INs collapse to the
    // FIRST, repeated OUTs extend to the LAST. Stray OUT with no open IN
    // starts an IN-less segment so the day + timeOut are kept, not dropped.
    // Normalized RUT from this employee's Workera identification, used to
    // attribute marks when workeraId isn't mapped to a local employee.
    const employeeRut = normalizeRut(list[0]?.employee?.identification ?? "") || null;

    let segIn: WorkeraAttendance | null = null;
    let segStart: WorkeraAttendance | null = null;
    let segOut: WorkeraAttendance | null = null;
    let segDupes = 0;

    const aggFor = (anchor: Date) => {
      const dateKey = formatDateChile(anchor);
      const key = `${code}|${dateKey}`;
      let agg = dayMap.get(key);
      if (!agg) {
        agg = {
          employeeCode: code,
          employeeRut,
          date: dateKey,
          timeIn: null,
          timeOut: null,
          hours: 0,
          shift: null,
          shiftSet: false,
          corrected: false,
          needsReview: false,
          inOrigin: null,
          inDevice: null,
          inAddress: null,
          inIsMobile: null,
          inCoordinates: null,
          outOrigin: null,
          outDevice: null,
          outAddress: null,
          outIsMobile: null,
          outCoordinates: null,
        };
        dayMap.set(key, agg);
      }
      return agg;
    };

    const flushSeg = () => {
      if (!segStart || !segOut) return;
      const anchor = segIn ?? segStart;
      const inTime = parseChileLocal(anchor.attendanceDate);
      const outTime = parseChileLocal(segOut.attendanceDate);
      // Guard against cross-window pairing artifacts: a clock-in matched with
      // a clock-out more than 24h later means the real OUT is missing from
      // this window (it lives in the next one). Keep the IN as an open turn
      // so the day shows as present instead of recording inflated hours.
      if (outTime.getTime() - inTime.getTime() > 24 * 3_600_000) {
        const agg = aggFor(inTime);
        if (!agg.timeIn || agg.timeIn > inTime) {
          const d = markDetails(anchor);
          agg.inOrigin = d.origin;
          agg.inDevice = d.device;
          agg.inAddress = d.address;
          agg.inIsMobile = d.isMobile;
          agg.inCoordinates = d.coordinates;
        }
        agg.timeIn = agg.timeIn && agg.timeIn < inTime ? agg.timeIn : inTime;
        agg.corrected = true;
        agg.needsReview = true;
        if (!agg.shiftSet) {
          agg.shift = determineShift(chileHour(inTime));
          agg.shiftSet = true;
        }
      } else if (outTime.getTime() >= inTime.getTime()) {
        const agg = aggFor(inTime);
        if (!agg.timeIn || agg.timeIn > inTime) {
          const d = markDetails(anchor);
          agg.inOrigin = d.origin;
          agg.inDevice = d.device;
          agg.inAddress = d.address;
          agg.inIsMobile = d.isMobile;
          agg.inCoordinates = d.coordinates;
        }
        if (!agg.timeOut || agg.timeOut < outTime) {
          const d = markDetails(segOut);
          agg.outOrigin = d.origin;
          agg.outDevice = d.device;
          agg.outAddress = d.address;
          agg.outIsMobile = d.isMobile;
          agg.outCoordinates = d.coordinates;
        }
        agg.timeIn = agg.timeIn && agg.timeIn < inTime ? agg.timeIn : inTime;
        agg.timeOut = agg.timeOut && agg.timeOut > outTime ? agg.timeOut : outTime;
        agg.hours += (outTime.getTime() - inTime.getTime()) / 3_600_000;
        agg.corrected = agg.corrected || segDupes > 0 || !segIn;
        agg.needsReview = agg.needsReview || segDupes > 0;
        if (!agg.shiftSet) {
          agg.shift = determineShift(chileHour(inTime));
          agg.shiftSet = true;
        }
      }
      segIn = null;
      segStart = null;
      segOut = null;
      segDupes = 0;
    };

    for (const m of list) {
      const isIn = m.attendanceType === 0 || m.attendanceType === 3;
      const isOut = m.attendanceType === 1 || m.attendanceType === 2;
      if (!isIn && !isOut) continue; // break start/end (4/5) don't define pair boundaries

      if (isIn) {
        if (!segStart) {
          segStart = m;
          segIn = m;
        } else if (!segIn) {
          segIn = m; // stray OUT then corrected IN: adopt as clock-in
          segDupes += 1;
        } else {
          segDupes += 1; // duplicate IN: keep earliest, ignore
        }
      } else if (!segStart) {
        segStart = m; // stray OUT with no IN yet: keep as segment start
        segOut = m;
      } else {
        if (segOut) segDupes += 1; // repeated OUT: extend to latest
        segOut = m;
        if (segIn) flushSeg();
      }
    }
    // Trailing segment: closed pair never flushed (OUT without IN at end),
    // or open turn (IN with no OUT → day present, timeOut null).
    if (segStart && segOut && !segIn) {
      flushSeg();
    } else if (segStart && segIn && !segOut) {
      const inTime = parseChileLocal(segIn.attendanceDate);
      const agg = aggFor(inTime);
      if (!agg.timeIn || agg.timeIn > inTime) {
        const d = markDetails(segIn);
        agg.inOrigin = d.origin;
        agg.inDevice = d.device;
        agg.inAddress = d.address;
        agg.inIsMobile = d.isMobile;
        agg.inCoordinates = d.coordinates;
      }
      agg.timeIn = agg.timeIn && agg.timeIn < inTime ? agg.timeIn : inTime;
      agg.corrected = agg.corrected || segDupes > 0;
      agg.needsReview = agg.needsReview || segDupes > 0 || !agg.timeOut;
      if (!agg.shiftSet) {
        agg.shift = determineShift(chileHour(inTime));
        agg.shiftSet = true;
      }
    }
  }

  const out: AttendanceDay[] = [];
  for (const agg of dayMap.values()) {
    const hours = agg.timeOut && agg.timeIn ? Math.round(agg.hours * 100) / 100 : null;
    out.push({
      employeeCode: agg.employeeCode,
      employeeRut: agg.employeeRut,
      date: agg.date,
      timeIn: agg.timeIn ? agg.timeIn.toISOString() : null,
      timeOut: agg.timeOut ? agg.timeOut.toISOString() : null,
      hoursWorked: hours,
      status: agg.timeIn ? "present" : "absent",
      shift: agg.shift,
      corrected: agg.corrected,
      needsReview: agg.needsReview,
      inOrigin: agg.inOrigin,
      inDevice: agg.inDevice,
      inAddress: agg.inAddress,
      inIsMobile: agg.inIsMobile,
      inCoordinates: agg.inCoordinates,
      outOrigin: agg.outOrigin,
      outDevice: agg.outDevice,
      outAddress: agg.outAddress,
      outIsMobile: agg.outIsMobile,
      outCoordinates: agg.outCoordinates,
    });
  }
  return out;
}

/** Test-only export of the attendance aggregator (kept out of the module's public API). */
export const aggregateAttendanceForTest = aggregateAttendance;

/**
 * Syncs attendance for a period as a set of (site × 7-day-window) units so the
 * detailed progress modal can show exactly which site + date range is being
 * processed and log per-unit errors.
 *
 * Workera's docs warn that /attendanceData over multi-day ranges can take
 * minutes or time out, while strict day-by-day fetching splits overnight
 * (night-shift) pairs: the IN lands in day N's response and its OUT in day
 * N+1's, so neither day can pair them and days go missing. A 7-day window
 * (fetched per branch) keeps requests fast but lets pairs span midnight; the
 * 1-day overlap additionally rescues pairs whose IN sits just before the
 * window edge. Aggregation is keyed by clock-in date, so the overlap never
 * double-counts — re-upsert of the same employee+date.
 *
 * @param onProgress overall progress callback (label, done, total)
 * @param jobId      when set, the full (site × window) plan is persisted up
 *                   front and each unit reports RUNNING/DONE/ERROR so the modal
 *                   can render the whole grid and support retry-only-failures.
 * @param onUnit     per-unit report callback (mirrors what's stored when jobId set)
 */
export async function syncAttendanceFromWorkera(
  from: string,
  to: string,
  onProgress?: (windowLabel: string, done: number, total: number) => Promise<void> | void,
  jobId?: string,
  onUnit?: (report: SyncUnitReport) => Promise<void> | void,
): Promise<SyncResult> {
  const pairs = await getSelectedScopePairs();
  if (pairs.length === 0) {
    throw new Error("No scope selected: pick at least one branch office and department first");
  }

  const employees = await db.employee.findMany({
    select: { id: true, workeraId: true, rut: true },
  });
  const byWorkeraId = new Map(employees.map((e) => [e.workeraId, e.id]));
  // Fallback: attribute Workera marks by normalized RUT when workeraId isn't
  // mapped (e.g. employees created from Planilla with no workeraId yet).
  const byRut = new Map<string, string>();
  for (const e of employees) {
    const r = normalizeRut(e.rut ?? "");
    if (r) byRut.set(r, e.id);
  }

  // Sites = unique branch offices from the selected scope pairs, with names.
  const branchCodes = [...new Set(pairs.map((p) => p.branchOffice).filter(Boolean))] as string[];
  const branchRows = await db.branchOffice.findMany({
    where: { code: { in: branchCodes } },
    select: { code: true, name: true },
  });
  const nameByCode = new Map(branchRows.map((b) => [b.code, b.name]));
  const sites: { code: string; name: string | null }[] = branchCodes.map((code) => ({
    code,
    name: nameByCode.get(code) ?? null,
  }));

  let upserted = 0;
  let rawMarksTotal = 0;
  let daysAggregatedTotal = 0;
  let skippedUnknownTotal = 0;
  // Load active devices for automatic site attribution during persist
  const devices = await db.device.findMany({
    where: { isActive: true },
    select: { id: true, name: true, siteId: true },
  });
  const deviceByName = new Map<string, { id: string; name: string; siteId: string | null }>(devices.map((d: { id: string; name: string; siteId: string | null }) => [d.name, { id: d.id, name: d.name, siteId: d.siteId }]));
  const startDay = new Date(`${from}T00:00:00Z`);
  const endDay = new Date(`${to}T00:00:00Z`);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const addDays = (d: Date, n: number) => {
    const c = new Date(d);
    c.setUTCDate(c.getUTCDate() + n);
    return c;
  };

  // 7-day windows, each starting 1 day before the previous ended (overlap).
  const windows: { wStart: Date; wEnd: Date }[] = [];
  for (let wStart = new Date(startDay); wStart <= endDay; wStart = addDays(wStart, 6)) {
    const wEnd = addDays(wStart, 6) > endDay ? new Date(endDay) : addDays(wStart, 6);
    windows.push({ wStart, wEnd });
  }
  // Build the full work plan (site × window) and persist it up front when a job
  // is tracking this sync, so the modal can render every row immediately.
  const siteList = sites.length > 0 ? sites : [{ code: "", name: null }];
  const units: { site: { code: string; name: string | null }; wStart: Date; wEnd: Date }[] = [];
  for (const site of siteList) {
    for (const { wStart, wEnd } of windows) {
      units.push({ site, wStart, wEnd });
    }
  }
  if (jobId) {
    await createSyncUnits(
      jobId,
      units.map((u) => ({
        siteCode: u.site.code || null,
        siteName: u.site.name,
        windowFrom: fmt(u.wStart),
        windowTo: fmt(u.wEnd),
      })),
    );
  }

  // Persist one (site × window) unit's aggregated days. Only days inside the
  // real window are saved (the 1-day overlap is pairing context only).
  const persistWindow = async (
    marks: WorkeraAttendance[],
    wStartStr: string,
    wEndStr: string,
  ): Promise<{ rows: number; days: number }> => {
    const daily = aggregateAttendance(marks);
    daysAggregatedTotal += daily.length;
    const inWindow = daily.filter((rec) => rec.date >= wStartStr && rec.date <= wEndStr);
    const matched = inWindow.map((rec) => ({
      rec,
      employeeId:
        byWorkeraId.get(rec.employeeCode) ??
        (rec.employeeRut ? byRut.get(rec.employeeRut) : undefined),
    }));
    skippedUnknownTotal += matched.filter((r) => !r.employeeId).length;
    const rows = matched.filter(
      (r): r is { rec: (typeof inWindow)[number]; employeeId: string } => Boolean(r.employeeId),
    );

    const CHUNK = 5;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await Promise.all(
        rows.slice(i, i + CHUNK).map(({ rec, employeeId }) => {
          const raw = marks.filter(
            (m) => m.employee.code === rec.employeeCode && m.attendanceDate.startsWith(rec.date),
          ) as unknown as object;
          const date = new Date(`${rec.date}T00:00:00Z`);
          return db.attendanceRecord.upsert({
            where: { employeeId_date_shift: { employeeId, date, shift: rec.shift ?? "",
            },
            },
            create: {
              employeeId,
              date,
              timeIn: rec.timeIn ? new Date(rec.timeIn) : null,
              timeOut: rec.timeOut ? new Date(rec.timeOut) : null,
              shift: rec.shift,
              hoursWorked: rec.hoursWorked,
              status: rec.status,
              corrected: rec.corrected,
              needsReview: rec.needsReview,
              reviewStatus: "pending",
              inOrigin: rec.inOrigin,
              inDevice: rec.inDevice,
              inAddress: rec.inAddress,
              inIsMobile: rec.inIsMobile,
              inCoordinates: rec.inCoordinates,
              outOrigin: rec.outOrigin,
              outDevice: rec.outDevice,
              outAddress: rec.outAddress,
              outIsMobile: rec.outIsMobile,
              outCoordinates: rec.outCoordinates,
              source: "workera",
              rawData: raw,
            },
            update: {
              timeIn: rec.timeIn ? new Date(rec.timeIn) : null,
              timeOut: rec.timeOut ? new Date(rec.timeOut) : null,
              shift: rec.shift,
              hoursWorked: rec.hoursWorked,
              status: rec.status,
              corrected: rec.corrected,
              needsReview: rec.needsReview,
              reviewStatus: "pending",
              inOrigin: rec.inOrigin,
              inDevice: rec.inDevice,
              inAddress: rec.inAddress,
              inIsMobile: rec.inIsMobile,
              inCoordinates: rec.inCoordinates,
              outOrigin: rec.outOrigin,
              outDevice: rec.outDevice,
              outAddress: rec.outAddress,
              outIsMobile: rec.outIsMobile,
              outCoordinates: rec.outCoordinates,
              rawData: raw,
            },
          });
        }),
      );
    }
    return { rows: rows.length, days: inWindow.length };
  };

  for (let ui = 0; ui < units.length; ui++) {
    const { site, wStart, wEnd } = units[ui];
    const wStartStr = fmt(wStart);
    const wEndStr = fmt(wEnd);
    // Overlap: include the day before the window so an IN just outside the
    // edge still pairs with its OUT inside, and 1 day after so an OUT just
    // outside the window (night shift ending next morning) still pairs with
    // its IN inside. persistWindow filters saved records to the real window.
    const fetchFrom = wStart > startDay ? fmt(addDays(wStart, -1)) : fmt(wStart);
    const fetchTo = fmt(addDays(wEnd, 1));
    const siteLabel = site.name ? `${site.name} (${site.code})` : site.code || "(all)";
    const report = async (
      rep: Omit<SyncUnitReport, "siteCode" | "siteName" | "windowFrom" | "windowTo">,
    ) => {
      const full: SyncUnitReport = {
        siteCode: site.code || null,
        siteName: site.name,
        windowFrom: wStartStr,
        windowTo: wEndStr,
        ...rep,
      };
      if (onUnit) await onUnit(full);
      if (jobId) await recordSyncUnit(jobId, full);
    };

    await report({ status: "RUNNING" });
    try {
      const marks = site.code
        ? await workeraClient.fetchAttendanceForBranch(fetchFrom, fetchTo, site.code)
        : await workeraClient.fetchAttendance(fetchFrom, fetchTo, pairs);
      rawMarksTotal += marks.length;
      const { rows, days } = await persistWindow(marks, wStartStr, wEndStr);
      upserted += rows;
      console.log(
        `[workera] attendance ${siteLabel} ${wStartStr}..${wEndStr}: ${marks.length} marks → ${rows} records persisted`,
      );
      await report({ status: "DONE", marks: marks.length, days, upserted: rows });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[workera] attendance unit ${siteLabel} ${wStartStr}..${wEndStr} FAILED: ${message}`,
      );
      await report({ status: "ERROR", error: message });
      // Continue with the next unit — one failing site/window must not abort
      // the whole sync; the modal surfaces it and offers retry.
    }

    if (onProgress) {
      await onProgress(`${siteLabel} ${wStartStr}..${wEndStr}`, ui + 1, units.length);
    }
  }

  // Auto-attribute site from clocking device for workera marks whose inDevice
  // matches a known Device but siteAttribution was not set during persist.
  await (async () => {
    const unattributed = await db.attendanceRecord.findMany({
      where: {
        source: "workera",
        siteAttributionStatus: "pending",
        inDevice: { not: null },
        deviceId: null,
      },
      select: { id: true, inDevice: true },
    });
    const hits = unattributed.filter((r) => deviceByName.has(r.inDevice ?? ""));
    for (const r of hits) {
      const dev = deviceByName.get(r.inDevice!)!;
      await db.attendanceRecord.update({
        where: { id: r.id },
        data: {
          deviceId: dev.id,
          siteAttributionStatus: "approved",
          siteAttributionSiteId: dev.siteId,
          siteAttributionNote: `Auto-attributed from device "${r.inDevice}"`,
          siteAttributionReviewedAt: new Date(),
        },
      });
    }
  })();

  // Auto-approve marks whose GPS falls within a site geofence (pure convenience
  // for the common in-range case; out-of-range/missing-coord marks stay pending
  // for manual review). Only pending marks are touched.
  const { approved } = await autoApprovePending(null);
  if (approved > 0) {
    console.log(`[workera] auto-approved ${approved} attendance marks within site range`);
  }

  // Keep the Positions registry in sync with Workera roles: Role rows +
  // jobPositionName values become PositionAlias rows so every Attendance-page
  // role is visible/classifiable on the Positions page (previously Workera
  // roles like "LIDER DE PREVENCION" were invisible → no group token → 0).
  await syncPositionRegistry();

  return {
    employeesCreated: 0,
    employeesUpdated: 0,
    attendanceUpserted: upserted,
    rawMarks: rawMarksTotal,
    daysAggregated: daysAggregatedTotal,
    skippedUnknown: skippedUnknownTotal,
    autoApproved: approved,
  };
}

/**
 * Retries only the failed (or explicitly selected) units of an attendance sync
 * job. Upserts are idempotent (keyed employee+date), so re-running a unit is
 * safe. Reports each unit through onUnit / recordSyncUnit like a full sync.
 *
 * @param unitIds when omitted, all units with status ERROR are retried
 * @returns counts of units attempted / succeeded / still failing
 */
export async function retryAttendanceUnits(
  jobId: string,
  unitIds?: string[],
  onProgress?: (windowLabel: string, done: number, total: number) => Promise<void> | void,
  onUnit?: (report: SyncUnitReport) => Promise<void> | void,
): Promise<{ retried: number; succeeded: number; failed: number }> {
  const employees = await db.employee.findMany({
    select: { id: true, workeraId: true, rut: true },
  });
  const byWorkeraId = new Map(employees.map((e) => [e.workeraId, e.id]));
  // Fallback: attribute Workera marks by normalized RUT when workeraId isn't
  // mapped (e.g. employees created from Planilla with no workeraId yet).
  const byRut = new Map<string, string>();
  for (const e of employees) {
    const r = normalizeRut(e.rut ?? "");
    if (r) byRut.set(r, e.id);
  }

  const units = await db.syncUnit.findMany({
    where: {
      jobId,
      ...(unitIds && unitIds.length > 0 ? { id: { in: unitIds } } : { status: "ERROR" }),
    },
    orderBy: [{ siteCode: "asc" }, { windowFrom: "asc" }],
  });
  await resetSyncUnitsForRetry(jobId, unitIds);

  // Load active devices for automatic site attribution during persist
  const devices = await db.device.findMany({
    where: { isActive: true },
    select: { id: true, name: true, siteId: true },
  });
  const deviceByName = new Map<string, { id: string; name: string; siteId: string | null }>(devices.map((d: { id: string; name: string; siteId: string | null }) => [d.name, { id: d.id, name: d.name, siteId: d.siteId }]));

  const persistWindow = async (
    marks: WorkeraAttendance[],
    wStartStr: string,
    wEndStr: string,
  ): Promise<{ rows: number; days: number }> => {
    const daily = aggregateAttendance(marks);
    const inWindow = daily.filter((rec) => rec.date >= wStartStr && rec.date <= wEndStr);
    const matched = inWindow.map((rec) => ({
      rec,
      employeeId:
        byWorkeraId.get(rec.employeeCode) ??
        (rec.employeeRut ? byRut.get(rec.employeeRut) : undefined),
    }));
    const rows = matched.filter(
      (r): r is { rec: (typeof inWindow)[number]; employeeId: string } => Boolean(r.employeeId),
    );
    const CHUNK = 5;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await Promise.all(
        rows.slice(i, i + CHUNK).map(({ rec, employeeId }) => {
          const raw = marks.filter(
            (m) => m.employee.code === rec.employeeCode && m.attendanceDate.startsWith(rec.date),
          ) as unknown as object;
          const date = new Date(`${rec.date}T00:00:00Z`);
          return db.attendanceRecord.upsert({
            where: { employeeId_date_shift: { employeeId, date, shift: rec.shift ?? "",
            },
            },
            create: {
              employeeId,
              date,
              timeIn: rec.timeIn ? new Date(rec.timeIn) : null,
              timeOut: rec.timeOut ? new Date(rec.timeOut) : null,
              shift: rec.shift,
              hoursWorked: rec.hoursWorked,
              status: rec.status,
              corrected: rec.corrected,
              needsReview: rec.needsReview,
              reviewStatus: "pending",
              inOrigin: rec.inOrigin,
              inDevice: rec.inDevice,
              inAddress: rec.inAddress,
              inIsMobile: rec.inIsMobile,
              inCoordinates: rec.inCoordinates,
              outOrigin: rec.outOrigin,
              outDevice: rec.outDevice,
              outAddress: rec.outAddress,
              outIsMobile: rec.outIsMobile,
              outCoordinates: rec.outCoordinates,
              source: "workera",
              rawData: raw,
            },
            update: {
              timeIn: rec.timeIn ? new Date(rec.timeIn) : null,
              timeOut: rec.timeOut ? new Date(rec.timeOut) : null,
              shift: rec.shift,
              hoursWorked: rec.hoursWorked,
              status: rec.status,
              corrected: rec.corrected,
              needsReview: rec.needsReview,
              reviewStatus: "pending",
              inOrigin: rec.inOrigin,
              inDevice: rec.inDevice,
              inAddress: rec.inAddress,
              inIsMobile: rec.inIsMobile,
              inCoordinates: rec.inCoordinates,
              outOrigin: rec.outOrigin,
              outDevice: rec.outDevice,
              outAddress: rec.outAddress,
              outIsMobile: rec.outIsMobile,
              outCoordinates: rec.outCoordinates,
              rawData: raw,
            },
          });
        }),
      );
    }
    return { rows: rows.length, days: inWindow.length };
  };

  let succeeded = 0;
  let failed = 0;
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    const siteCode = u.siteCode ?? "";
    const siteLabel = u.siteName ? `${u.siteName} (${siteCode})` : siteCode || "(all)";
    const wStartStr = u.windowFrom;
    const wEndStr = u.windowTo;
    const d = new Date(`${wStartStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    const fetchFrom = d.toISOString().slice(0, 10);
    // 1-day post overlap so night-shift OUTs after window end still pair
    const fetchTo = new Date(`${wEndStr}T00:00:00Z`);
    fetchTo.setUTCDate(fetchTo.getUTCDate() + 1);
    const fetchToStr = fetchTo.toISOString().slice(0, 10);
    const report = async (
      rep: Omit<SyncUnitReport, "siteCode" | "siteName" | "windowFrom" | "windowTo">,
    ) => {
      const full: SyncUnitReport = {
        siteCode: siteCode || null,
        siteName: u.siteName,
        windowFrom: wStartStr,
        windowTo: wEndStr,
        ...rep,
      };
      if (onUnit) await onUnit(full);
      await recordSyncUnit(jobId, full);
    };

    await report({ status: "RUNNING" });
    try {
      const marks = siteCode
        ? await workeraClient.fetchAttendanceForBranch(fetchFrom, fetchToStr, siteCode)
        : await workeraClient.fetchAttendance(fetchFrom, fetchToStr);
      const { rows, days } = await persistWindow(marks, wStartStr, wEndStr);
      succeeded += 1;
      await report({ status: "DONE", marks: marks.length, days, upserted: rows });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failed += 1;
      await report({ status: "ERROR", error: message });
    }
    if (onProgress) {
      await onProgress(`${siteLabel} ${wStartStr}..${wEndStr}`, i + 1, units.length);
    }
  }

  // Auto-attribute site from clocking device for workera marks whose inDevice
  // matches a known Device but siteAttribution was not set during persist.
  await (async () => {
    const unattributed = await db.attendanceRecord.findMany({
      where: {
        source: "workera",
        siteAttributionStatus: "pending",
        inDevice: { not: null },
        deviceId: null,
      },
      select: { id: true, inDevice: true },
    });
    const hits = unattributed.filter((r) => deviceByName.has(r.inDevice ?? ""));
    for (const r of hits) {
      const dev = deviceByName.get(r.inDevice!)!;
      await db.attendanceRecord.update({
        where: { id: r.id },
        data: {
          deviceId: dev.id,
          siteAttributionStatus: "approved",
          siteAttributionSiteId: dev.siteId,
          siteAttributionNote: `Auto-attributed from device "${r.inDevice}"`,
          siteAttributionReviewedAt: new Date(),
        },
      });
    }
  })();

  // Auto-discover devices from attendance data and map them to sites.
  // Workera has no dedicated device endpoint, so devices are discovered
  // from the inDevice/outDevice fields on attendance marks. When all
  // employees who used a device are assigned to the same site, the device
  // is auto-mapped to that site.
  await discoverAndMapDevices();

  return { retried: units.length, succeeded, failed };
}

/**
 * Discovers clocking/biometric devices from attendance data and maps them
 * to sites. Devices whose users all belong to a single site are auto-mapped;
 * unmapped devices remain in the table with siteId=null for manual mapping.
 */
export async function discoverAndMapDevices(): Promise<{
  discovered: number;
  mapped: number;
  unmapped: number;
}> {
  // Collect distinct device names from recent workera attendance marks
  const marks = await db.attendanceRecord.findMany({
    where: {
      source: "workera",
      inDevice: { not: null },
    },
    select: { inDevice: true, employeeId: true },
    distinct: ["inDevice"],
    take: 1000,
  });

  const deviceNames = [...new Set(marks.map((m) => m.inDevice!).filter(Boolean))];

  let discovered = 0;
  let mapped = 0;
  let unmapped = 0;

  // Upsert each device (without siteId initially)
  for (const name of deviceNames) {
    const existing = await db.device.findUnique({ where: { name } });
    if (!existing) {
      await db.device.create({ data: { name, isActive: true } });
      discovered++;
    }
  }

  // Reload all devices with their current site mapping
  const allDevices = await db.device.findMany({
    select: { id: true, name: true, siteId: true },
  });
  const deviceByName = new Map(allDevices.map((d) => [d.name, d]));

  // For each device, check what sites its users are assigned to
  for (const name of deviceNames) {
    const dev = deviceByName.get(name);
    if (!dev) continue;

    // Skip devices already mapped
    if (dev.siteId) {
      mapped++;
      continue;
    }

    // Find employees who used this device and their sites
    const deviceMarks = await db.attendanceRecord.findMany({
      where: {
        source: "workera",
        inDevice: name,
      },
      select: { employeeId: true },
      distinct: ["employeeId"],
      take: 500,
    });

    const employeeIds = deviceMarks.map((m) => m.employeeId);
    if (employeeIds.length === 0) {
      unmapped++;
      continue;
    }

    const employees = await db.employee.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, siteId: true },
    });

    const siteIds = [...new Set(employees.map((e) => e.siteId).filter(Boolean))];

    if (siteIds.length === 1) {
      // All users of this device are at one site — auto-map
      await db.device.update({
        where: { id: dev.id },
        data: { siteId: siteIds[0] },
      });
      mapped++;
    } else {
      unmapped++;
    }
  }

  return { discovered, mapped, unmapped };
}






