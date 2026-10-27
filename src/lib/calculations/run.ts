import { fmtUtc } from "@/lib/coreplan/mock";
import { normalizeRut, normalizeText } from "@/lib/excel/normalize";
import { db } from "@/lib/db";
import { calculateBonuses } from "@/lib/bonus-engine/engine";
import { buildPlanillaComparison } from "@/lib/calculations/planilla-comparison";
import { isNonProductiveInterval, resolveDrillingTypeFromDiameter } from "@/lib/bonus-engine/rate-config";
import type {
  BonusEngineInput,
  BonusRuleConfig,
  EmployeeWork,
} from "@/types/bonus";

export type RunCalculationResult = {
  calculationId: string;
  totalBonus: number;
  linesCount: number;
};

/**
 * Loads all data for a site + period, builds the normalized engine input,
 * runs the PURE calculation engine, and persists the result together with
 * the full input snapshot (audit requirement).
 */
export async function runCalculation(
  siteId: string,
  ruleSetId: string,
  periodStart: string, // yyyy-MM-dd
  periodEnd: string, // yyyy-MM-dd
  createdById: string | undefined,
  source: "workera" | "planilla" = "workera",
  replaceCalculationId?: string, // when set, replaces this existing calculation instead of creating a new one
): Promise<RunCalculationResult> {
  const normalizedPeriodStart = periodStart <= periodEnd ? periodStart : periodEnd;
  const normalizedPeriodEnd = periodStart <= periodEnd ? periodEnd : periodStart;
  const start = new Date(`${normalizedPeriodStart}T00:00:00Z`);
  const end = new Date(`${normalizedPeriodEnd}T00:00:00Z`);

  const [site, ruleSet] = await Promise.all([
    db.site.findUniqueOrThrow({ where: { id: siteId } }),
    db.bonusRuleSet.findUniqueOrThrow({
      where: { id: ruleSetId },
      include: { rules: { include: { bonusType: true } } },
    }),
  ]);

  // Approved effective-dated assignments are authoritative when present.
  // Employee.siteId remains a compatibility fallback until assignments are reviewed.
  const approvedAssignments = await db.employeeProjectAssignment.findMany({
    where: { status: "approved", startDate: { lte: end }, OR: [{ endDate: null }, { endDate: { gte: start } }] },
    select: { employeeId: true, siteId: true, startDate: true, endDate: true },
  });
  const assignedEmployeeIds = new Set(approvedAssignments.filter((a) => a.siteId === siteId).map((a) => a.employeeId));
  const assignedByEmployee = new Map<string, typeof approvedAssignments>();
  for (const assignment of approvedAssignments) {
    const list = assignedByEmployee.get(assignment.employeeId) ?? [];
    list.push(assignment);
    assignedByEmployee.set(assignment.employeeId, list);
  }
  // Multiple approved sites are valid for an employee-month. Site-specific
  // calculations must preserve the overlap; only the Planilla source resolves
  // the actual worked site from its daily entry.

  // Planilla uploads can contain people who are not yet present in the employee
  // registry. Materialize those identities from the Planilla evidence before
  // building RUT maps; otherwise every unknown RUT is silently dropped from the
  // calculation. Scope this to the upload site so a multi-site workbook cannot
  // create employees for an unrelated project.
  const planillaPeopleRuts = new Set<string>();
  if (source === "planilla") {
    const siteAliases = await db.siteAlias.findMany({ where: { siteId }, select: { normalized: true } });
    const siteProjectNames = new Set([
      normalizeText(site.name),
      ...siteAliases.map((alias) => alias.normalized),
    ]);
    const planillaPeople = await db.dailyCrewEntry.findMany({
      where: {
        date: { gte: start, lte: end },
        OR: [{ upload: { siteId } }, { projectName: { not: null } }],
      },
      select: { rut: true, rutNormalized: true, fullName: true, cargoRaw: true, projectName: true, upload: { select: { siteId: true } } },
      orderBy: { date: "asc" },
    });
    const registeredRuts = new Set(
      (await db.employee.findMany({ where: { rut: { not: null } }, select: { rut: true } }))
        .map((employee) => normalizeRut(employee.rut as string)),
    );
    for (const person of planillaPeople) {
      const belongsToSite = person.upload.siteId === siteId || (person.projectName !== null && siteProjectNames.has(normalizeText(person.projectName)));
      if (!belongsToSite) continue;
      planillaPeopleRuts.add(person.rutNormalized);
      if (registeredRuts.has(person.rutNormalized) || !person.fullName.trim()) continue;
      await db.employee.create({
        data: {
          fullName: person.fullName.trim(),
          rut: person.rutNormalized,
          siteId,
          jobPositionName: person.cargoRaw?.trim() || null,
        },
      });
      registeredRuts.add(person.rutNormalized);
    }
  }

  // Workera follows the reviewed project-assignment registry when that registry
  // has entries. Planilla is independent evidence: its uploaded RUT/crew rows must
  // not be collapsed to the one employee who happens to have an approved
  // assignment (this affected Chile Chico, whose Planilla had 60 matched staff).
  // Planilla employees are selected from the RUTs present in this site's
  // Planilla project evidence. Never fall back to Employee.siteId here: that
  // field is Workera allocation data and may disagree with the Planilla site.
  const planillaEmployeeIds = source === "planilla"
    ? (await db.employee.findMany({
        where: { rut: { not: null } },
        select: { id: true, rut: true },
      }))
        .filter((employee) => planillaPeopleRuts.has(normalizeRut(employee.rut as string)))
        .map((employee) => employee.id)
    : [];
  // Workera employees: the approved assignment registry is authoritative, but we
  // also include employees whose home site is this site and who actually have
  // Workera attendance in the period. Otherwise staff whose registry row is
  // incomplete (e.g. workeraId not yet mapped, no assignment row) disappear from
  // calculations even though they worked — e.g. Chile Chico crew synced from
  // Workera with no workeraId. When no assignments exist yet, fall back to all
  // site employees (previous behaviour).
  const attendingEmployeeIds = new Set<string>();
  if (source === "workera" && assignedEmployeeIds.size > 0) {
    const attEmployees = await db.attendanceRecord.findMany({
      where: { date: { gte: start, lte: end } },
      select: { employeeId: true },
      distinct: ["employeeId"],
    });
    for (const r of attEmployees) attendingEmployeeIds.add(r.employeeId);
  }

  const employees = await db.employee.findMany({
    where: source === "planilla"
      ? { id: { in: planillaEmployeeIds } }
      : assignedEmployeeIds.size === 0
        ? { siteId }
        : {
            OR: [
              { id: { in: [...assignedEmployeeIds] } },
              { AND: [{ siteId }, { id: { in: [...attendingEmployeeIds] } }] },
            ],
          },
    include: { defaultRole: true },
  });
  const employeeIds = new Set(employees.map((e) => e.id));

  // Site rigs: scoped by the PER-SHIFT site stamped on each performance row
  // (set at upload time), NOT by Rig.siteId — rigs move between sites and the
  // static assignment would silently steal or drop their historical meters on
  // re-runs. Legacy rows (siteId null) fall back to their rig's current site.
  const performances = await db.rigShiftPerformance.findMany({
    where: {
      date: { gte: start, lte: end },
      OR: [{ siteId: site.id }, { siteId: null, rig: { siteId: site.id } }],
    },
    include: { rig: { include: { siteRigs: { where: { siteId: site.id } } } } },
  });
  // Union of rigs: anything drilled at this site during the period, plus the
  // current site roster (type configuration must warn even for idle rigs).
  const rigById = new Map<string, (typeof performances)[number]["rig"]>();
  for (const p of performances) rigById.set(p.rigId, p.rig);
  const currentSiteRigs = await db.rig.findMany({
    where: { siteId: site.id, id: { notIn: [...rigById.keys()] } },
    include: { siteRigs: { where: { siteId: site.id } } },
  });
  const siteRigs = [...rigById.values(), ...currentSiteRigs];
  const rigNameById = new Map(siteRigs.map((r) => [r.id, r.name]));

  // Effective drilling type per rig (Rig.rigType + SiteRig.effectiveType).
  // Multipurpose rigs without a site type block the run with a clear message.
  const { buildRigTypesMap, unconfiguredMultipurposeRigs } = await import("@/lib/rigs/effective-type");
  const missingTypes = unconfiguredMultipurposeRigs(
    siteRigs.map((r) => ({ id: r.id, name: r.name, rigType: r.rigType, siteRig: r.siteRigs[0] ?? null })),
  );
  if (missingTypes.length > 0) {
    throw new Error(
      `Multipurpose rig(s) without drilling type on this site: ${missingTypes.join(", ")}. Set Diamantina or Aire Reverso on the Sites page before running the calculation.`,
    );
  }
  const rigTypes = buildRigTypesMap(
    siteRigs.map((r) => ({ id: r.id, name: r.name, rigType: r.rigType, siteRig: r.siteRigs[0] ?? null })),
  );

  const [empAttendance, planillaAttendance, assignments, turnSchedules, planillaTurns] = await Promise.all([
    db.attendanceRecord.findMany({
      where: { employeeId: { in: [...employeeIds] }, date: { gte: start, lte: end }, source: "workera" },
    }),
    db.dailyCrewEntry.findMany({
      where: { date: { gte: start, lte: end } },
      select: {
        date: true,
        rutNormalized: true,
        projectName: true,
        asistencia: true,
        workeraMarkedIn: true,
        workeraMarkedOut: true,
        upload: { select: { siteId: true } },
      },
    }),
    db.crewAssignment.findMany({
      where: {
        date: { gte: start, lte: end },
        employeeId: { in: [...employeeIds] },
      },
      include: { employee: { include: { defaultRole: true } }, rig: true },
    }),
    db.employeeTurnSchedule.findMany({
      where: { date: { gte: start, lte: end } },
      select: { employeeId: true, date: true, turn: true },
    }),
    // The planilla's own TURNO A/B section is the primary source of the 14x14 crew
    // cycle; the manual schedule below only fills the days the file doesn't carry.
    db.dailyCrewEntry.findMany({
      where: { date: { gte: start, lte: end } },
      select: { rutNormalized: true, date: true, turnoAB: true },
    }),
  ]);

  // Rig performance lookup key: rigId + date + shift
  const perfKey = (rigId: string, date: Date, shift: string) =>
    `${rigId}|${fmtUtc(date)}|${shift}`;

  // Resolve each crew assignment to the site where the employee actually worked
  // this shift. Priority: (1) CrewAssignment.siteId (set at upload time from the
  // upload's declared site), (2) RigShiftPerformance.siteId (per-shift site from
  // the intervals upload), (3) Rig.siteId (static home site, legacy fallback).
  // Only assignments whose resolved site matches this calculation's site are kept.
  // Rigs with null Rig.siteId are no longer silently dropped when their upload
  // declares a site (the fix for zero-meter shifts on moved rigs).
  const perfSiteByKey = new Map<string, string | null>();
  for (const p of performances) {
    perfSiteByKey.set(perfKey(p.rigId, p.date, p.shift), p.siteId ?? null);
  }
  const rigSiteById = new Map<string, string | null>();
  for (const p of performances) {
    rigSiteById.set(p.rigId, p.rig.siteId ?? null);
  }

  const resolvedAssignments = assignments.filter((a) => {
    const key = perfKey(a.rigId, a.date, a.shift ?? "day");
    const resolvedSiteId =
      a.siteId ?? perfSiteByKey.get(key) ?? rigSiteById.get(a.rigId) ?? null;
    return resolvedSiteId === site.id;
  });

  // Manual turn (A/B) lookup per employee per day — fallback when the planilla has no turn.
  const turnMap = new Map<string, "A" | "B">();
  for (const s of turnSchedules) {
    const k = `${s.employeeId}|${fmtUtc(s.date)}`;
    turnMap.set(k, s.turn as "A" | "B");
  }

  // Planilla turn (A/B) lookup per employee per day, resolved by RUT.
  const employeeIdByRut = new Map(
    employees.filter((e) => e.rut).map((e) => [normalizeRut(e.rut as string), e.id]),
  );
  const planillaTurnMap = new Map<string, "A" | "B">();
  for (const p of planillaTurns) {
    if (p.turnoAB !== "A" && p.turnoAB !== "B") continue;
    const employeeId = employeeIdByRut.get(p.rutNormalized);
    if (!employeeId) continue;
    planillaTurnMap.set(`${employeeId}|${fmtUtc(p.date)}`, p.turnoAB);
  }

  // Rig performance lookup: rigId + date + shift (rows pre-filtered above by
  // per-shift site, so foreign-site shifts of a moved rig are excluded and
  // other sites' machines can never win the "best rig of the month" selection)
  const perfMap = new Map(performances.map((p) => [perfKey(p.rigId, p.date, p.shift), p]));

  type PerfInterval = { band?: string; escala?: string | null; diameter?: string; meters?: number };
  const productiveIntervals = (
    perf: (typeof performances)[number],
  ): PerfInterval[] => {
    const intervals = perf.intervals as PerfInterval[] | null;
    if (!intervals || intervals.length === 0) return [];
    // Defence-in-depth: rows parsed before the grouting exclusion (or from any
    // other source) may still carry non-productive passes (e.g. "Grouting HQ").
    // Bonus + rig totals only ever see productive drilled metres.
    return intervals.filter((i) => !isNonProductiveInterval(i.band, i.diameter));
  };
  /** Productive metres for a shift (grouting passes excluded). */
  const getProductiveMeters = (perf: (typeof performances)[number]): number => {
    const intervals = perf.intervals as PerfInterval[] | null;
    if (intervals && intervals.length > 0) {
      return productiveIntervals(perf).reduce((n, i) => n + (i.meters ?? 0), 0);
    }
    return perf.metersDrilled ?? 0;
  };

    // Helper: extract drilling type from intervals (diameter field)
  // Maps diameter names to the drilling type codes used in rate tables.
  // Types are the REAL diameters (HQ, NQ, PQ, DDH, NAVI = Diamantina;
  // RC = Aire Reverso). Interval diameters carry method suffixes
  // ("RockH 2m Extract Dry" / "RockT 2m Extract Wet" = RC), so match by prefix;
  // unknown diameters pass through unchanged (they simply have no configured rate).
  const getDrillingType = (perf: (typeof performances)[number]): string | null => {
    const intervals = productiveIntervals(perf);
    if (intervals.length === 0) return null;
    // Use the diameter from the interval with the most meters
    let bestInterval = intervals[0];
    for (const interval of intervals) {
      if ((interval.meters ?? 0) > (bestInterval.meters ?? 0)) {
        bestInterval = interval;
      }
    }
    if (!bestInterval.diameter) return null;
    return resolveDrillingTypeFromDiameter(bestInterval.diameter);
  };

  /**
   * Extract the deepest depth reached from the performance intervals.
   * Intervals look like { band: "HQ (0.00 - 200.00)", escala: "0-200", diameter: "HQ", meters: 15 }.
   * We take the max "to" value across all intervals as the drilling depth for the shift.
   */
  const getDrillingDepth = (perf: (typeof performances)[number]): number | null => {
    const intervals = productiveIntervals(perf);
    if (intervals.length === 0) return null;
    let maxDepth = 0;
    let found = false;
    for (const interval of intervals) {
      const band = interval.band ?? "";
      const m = band.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
      if (m) {
        const to = Number.parseFloat(m[2]);
        if (Number.isFinite(to) && to > maxDepth) {
          maxDepth = to;
          found = true;
        }
      }
    }
    return found ? maxDepth : null;
  };

  /**
   * Extract the depth scale string (e.g. "0-500", "500-1000") from the interval
   * with the most meters, for direct rate-table lookup.
   */
  const getDepthScale = (perf: (typeof performances)[number]): string | null => {
    const intervals = productiveIntervals(perf);
    if (intervals.length === 0) return null;
    let best = intervals[0];
    for (const interval of intervals) {
      if ((interval.meters ?? 0) > (best.meters ?? 0)) best = interval;
    }
    return best.escala ?? null;
  };

  // Attendance day count per employee (present/late counts as worked)
  const daysWorkedMap = new Map<string, number>();
  const attHoursMap = new Map<string, number>();
  const siteAllocation = new Map<string, { siteDays: Record<string, number>; conflicts: Array<{ date: string; siteIds: string[] }> }>();
  if (source === "planilla") {
    // Planilla worked-day authority: a day counts only when the ASISTENCIA
    // column says "PRESENTE". Row presence alone (DESCANSO / AUSENTE /
    // OBSERVACION / blank) is NOT a worked day. The uploaded Workera
    // ENTRADA/SALIDA columns are advisory reconciliation evidence only.
    // Deduplicate by employee/date because a person can have multiple Planilla
    // rows on the same date.
    // Resolve a planilla row to its site GLOBALLY (not just this run's site) so a
    // person who split the month across sites is credited to each site separately,
    // and any same-day cross-site overlap is surfaced as a conflict instead of being
    // silently double-counted in two site calculations.
    const siteIdByProject = new Map<string, string>();
    for (const alias of await db.siteAlias.findMany({ select: { normalized: true, siteId: true } })) {
      siteIdByProject.set(alias.normalized, alias.siteId);
    }
    siteIdByProject.set(normalizeText(site.name), siteId);

    const siteDaysByEmployee = new Map<string, Map<string, Set<string>>>();
    for (const rec of planillaAttendance) {
      // A planilla day counts as worked only when ASISTENCIA = "PRESENTE".
      if (rec.asistencia !== "PRESENTE") continue;
      const employeeId = employeeIdByRut.get(rec.rutNormalized);
      if (!employeeId) continue;
      // Site this row belongs to: the upload's assigned site first, else the
      // project text via the global alias map. Unplaceable rows are ignored.
      const recSiteId =
        rec.upload.siteId ??
        (rec.projectName ? siteIdByProject.get(normalizeText(rec.projectName)) : undefined) ??
        siteId; // fall back to the calculation's site when unplaceable
      const dateKey = fmtUtc(rec.date);
      const dateSites = siteDaysByEmployee.get(employeeId) ?? new Map<string, Set<string>>();
      const sitesForDate = dateSites.get(dateKey) ?? new Set<string>();
      sitesForDate.add(recSiteId);
      dateSites.set(dateKey, sitesForDate);
      siteDaysByEmployee.set(employeeId, dateSites);
    }
    for (const [employeeId, dateSites] of siteDaysByEmployee) {
      const siteDays: Record<string, number> = {};
      const conflicts: Array<{ date: string; siteIds: string[] }> = [];
      for (const [date, siteIds] of dateSites) {
        // A worker can only be at one site per day. More than one resolved site for
        // the same date is a data conflict. If this calculation's site is among the
        // conflicting sites, attribute the day to it; otherwise surface as conflict
        // and DON'T count the day (never paid in two different site calculations).
        if (siteIds.size !== 1) {
          if (siteIds.has(siteId)) {
            siteDays[siteId] = (siteDays[siteId] ?? 0) + 1;
          } else {
            conflicts.push({ date, siteIds: [...siteIds] });
          }
          continue;
        }
        const actualSiteId = [...siteIds][0];
        siteDays[actualSiteId] = (siteDays[actualSiteId] ?? 0) + 1;
      }
      // This run is for ONE site: count only the days actually worked at THIS site.
      daysWorkedMap.set(employeeId, siteDays[siteId] ?? 0);
      siteAllocation.set(employeeId, { siteDays, conflicts });
    }
  } else {
    for (const rec of empAttendance) {
      if (rec.status === "absent") continue;
      daysWorkedMap.set(rec.employeeId, (daysWorkedMap.get(rec.employeeId) ?? 0) + 1);
      attHoursMap.set(rec.employeeId, (attHoursMap.get(rec.employeeId) ?? 0) + (rec.hoursWorked ?? 0));
    }
  }

  // Build normalized engine input
  const works = new Map<string, EmployeeWork>();
  // Role token resolver: raw role -> [raw, normalized, mainPosition, groupKey]
  // (from the PositionAlias registry) so rule matching works on canonical
  // main roles / groups instead of exact cargo strings.
  const { buildRoleTokenResolver } = await import("@/lib/positions/registry");
  const roleTokensFor = await buildRoleTokenResolver();
  for (const emp of employees) {
    // Token sources mirror the engine's roleUsed precedence: the roles ACTUALLY
    // worked on shifts decide which position rules apply; Workera's defaultRole
    // is only a FALLBACK for employees with no assignments (support staff that
    // qualify for MEJOR MÁQUINA). Unconditionally unioning defaultRole used to
    // leak a conflicting position family into the token set — e.g. planilla
    // "Ayudante Perforista" + defaultRole "Perforista Training" resolving to
    // main position "Perforista" matched BOTH Bono Metro rules and paid the
    // same day/meters twice (Tabla 1 @750 + Tabla 2 @500).
    const shiftRoles = resolvedAssignments
      .filter((a) => a.employeeId === emp.id)
      .map((a) => a.roleOnShift)
      .filter((r): r is string => Boolean(r));
    const roleCounts = new Map<string, number>();
    for (const role of shiftRoles) roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
    const defaultRole = emp.defaultRole?.name ?? null;
    const primaryShiftRole = [...roleCounts.entries()]
      .sort((a, b) => b[1] - a[1] || (a[0] === defaultRole ? -1 : b[0] === defaultRole ? 1 : 0))[0]?.[0];
    const roleCandidates = new Set<string>(
      primaryShiftRole
        ? [primaryShiftRole]
        : defaultRole
          ? [defaultRole]
          : [],
    );
    const roleTokens = [...roleCandidates].flatMap((r) => roleTokensFor(r));
    works.set(emp.id, {
      employeeId: emp.id,
      fullName: emp.fullName,
      daysWorked: daysWorkedMap.get(emp.id) ?? 0,
      attendanceHours: attHoursMap.get(emp.id) ?? 0,
      siteDaysWorked: source === "planilla" ? siteAllocation.get(emp.id)?.siteDays : undefined,
      siteConflicts: source === "planilla" ? siteAllocation.get(emp.id)?.conflicts : undefined,
      defaultRole: emp.defaultRole?.name ?? null,
      roleTokens: [...new Set(roleTokens)],
      shifts: [],
    });
  }

  for (const a of resolvedAssignments) {
    const work = works.get(a.employeeId);
    if (!work) continue;
    const shift = a.shift ?? "day";
    const perf = perfMap.get(perfKey(a.rigId, a.date, shift));
    work.shifts.push({
      date: fmtUtc(a.date),
      shift,
      rigName: a.rig.name,
      role: a.roleOnShift ?? a.employee.defaultRole?.name ?? "Unknown",
      meters: perf ? getProductiveMeters(perf) : 0,
      hours: perf?.hoursSpent ?? null,
      drillingLevel: perf?.drillingLevel ?? null,
      drillingType: perf ? getDrillingType(perf) : null,
      drillingDepth: perf ? getDrillingDepth(perf) : null,
      depthScale: perf ? getDepthScale(perf) : null,
      turn: planillaTurnMap.get(`${a.employeeId}|${fmtUtc(a.date)}`) ?? turnMap.get(`${a.employeeId}|${fmtUtc(a.date)}`) ?? null,
    });
  }

  // Map new BonusRule format (bonusTypeId + parameters) to engine BonusRuleConfig
  const rules: BonusRuleConfig[] = ruleSet.rules.map((r) => ({
    ruleId: r.id,
    bonusTypeCode: r.bonusType.code,
    positionFilter: r.positionFilter,
    positionExclude: r.positionExclude ?? [],
    drillingTypeFilter: r.drillingTypeFilter,
    priority: r.priority,
    parameters: r.parameters as unknown as BonusRuleConfig["parameters"],
    minAttendanceDays: r.minAttendanceDays ?? null,
  }));

  /**
   * Normalize an arbitrary depth-scale string (e.g. "0-500", "0-600", "500-1000")
   * to the bucket used in rate tables. Falls back to a numeric mapping.
   */
  const normalizeDepthScale = (scale: string | null | undefined, depth: number | null | undefined): string => {
    if (typeof scale === "string") {
      const m = scale.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
      if (m) {
        const from = Number.parseFloat(m[1]);
        const to = Number.parseFloat(m[2]);
        if (Number.isFinite(from) && Number.isFinite(to)) {
          if (from < 500) return "0-500";
          if (from < 1000) return "500-1000";
          if (from < 1500) return "1000-1500";
          if (from < 2000) return "1500-2000";
          return "2000-2500";
        }
      }
    }
    const d = depth ?? 0;
    if (d < 500) return "0-500";
    if (d < 1000) return "500-1000";
    if (d < 1500) return "1000-1500";
    if (d < 2000) return "1500-2000";
    return "2000-2500";
  };

  // Compute monthly rig totals for best-rig calculations
  const monthlyRigTotals: Record<string, number> = {};
  const rigTotalsByType: Record<string, Record<string, number>> = {};
  const rigTotalsByTypeAndScale: Record<string, Record<string, Record<string, number>>> = {};
  const rigDailyTotalsByTypeAndScale: Record<string, Record<string, Record<string, Record<string, number>>>> = {};
  for (const perf of performances) {
    const rigName = rigNameById.get(perf.rigId) ?? perf.rigId;
    const dateKey = fmtUtc(perf.date);
    const meters = getProductiveMeters(perf);
    monthlyRigTotals[rigName] = (monthlyRigTotals[rigName] ?? 0) + meters;
    const intervals = productiveIntervals(perf);
    if (intervals.length > 0) {
      // Split the shift into its productive bands: each interval books ONLY its
      // own metres to its own (type, escala). Booking the whole shift total to
      // the biggest band (previous behaviour) kept the month total right but
      // skewed every per-band figure (e.g. 0-100: 474.6 vs true 454.5).
      for (const iv of intervals) {
        const ivType = resolveDrillingTypeFromDiameter(iv.diameter);
        if (!ivType) continue;
        const ivMeters = iv.meters ?? 0;
        if (!rigTotalsByType[rigName]) rigTotalsByType[rigName] = {};
        rigTotalsByType[rigName][ivType] = (rigTotalsByType[rigName][ivType] ?? 0) + ivMeters;
        // Diamantina = every Diamantina-group type (HQ, NQ, PQ, DDH, NAVI) grouped
        // (memo TERCERO: the goal is 1.000 m "en Diamantina" per machine, whatever
        // the core size actually drilled). RC belongs to Aire Reverso.
        if (ivType !== "RC" && ivType !== "DIAMANTINA") {
          rigTotalsByType[rigName].DIAMANTINA = (rigTotalsByType[rigName].DIAMANTINA ?? 0) + ivMeters;
        }
        const scaleKeys = new Set<string>();
        // Keep the RAW band string (e.g. "0-100", "200-300") — sites whose memos
        // define non-standard tramos (Chile Chico) resolve rates off these.
        if (iv.escala) {
          const m = iv.escala.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
          if (m && Number.isFinite(Number.parseFloat(m[1])) && Number.isFinite(Number.parseFloat(m[2]))) {
            scaleKeys.add(iv.escala.replace(/\s+/g, ""));
          }
        }
        // Plus the canonical bucket (e.g. "0-500") for memos that pay on it.
        // Rate tables use either the canonical buckets or raw bands — never
        // both — so no metres are ever counted twice in a lookup.
        scaleKeys.add(normalizeDepthScale(iv.escala, null));
        if (!rigTotalsByTypeAndScale[rigName]) rigTotalsByTypeAndScale[rigName] = {};
        if (!rigTotalsByTypeAndScale[rigName][ivType]) rigTotalsByTypeAndScale[rigName][ivType] = {};
        for (const key of scaleKeys) {
          rigTotalsByTypeAndScale[rigName][ivType][key] =
            (rigTotalsByTypeAndScale[rigName][ivType][key] ?? 0) + ivMeters;
        }
        // Per-day totals (day + night turn summed) for Bono Metro (PRIMERO §1).
        if (!rigDailyTotalsByTypeAndScale[rigName]) rigDailyTotalsByTypeAndScale[rigName] = {};
        if (!rigDailyTotalsByTypeAndScale[rigName][dateKey]) rigDailyTotalsByTypeAndScale[rigName][dateKey] = {};
        if (!rigDailyTotalsByTypeAndScale[rigName][dateKey][ivType]) rigDailyTotalsByTypeAndScale[rigName][dateKey][ivType] = {};
        for (const key of scaleKeys) {
          rigDailyTotalsByTypeAndScale[rigName][dateKey][ivType][key] =
            (rigDailyTotalsByTypeAndScale[rigName][dateKey][ivType][key] ?? 0) + ivMeters;
        }
      }
      continue;
    }
    const drillingType = getDrillingType(perf);
    if (drillingType) {
      if (!rigTotalsByType[rigName]) rigTotalsByType[rigName] = {};
      rigTotalsByType[rigName][drillingType] = (rigTotalsByType[rigName][drillingType] ?? 0) + meters;
      // Diamantina = every Diamantina-group type (HQ, NQ, PQ, DDH, NAVI) grouped
      // (memo TERCERO: the goal is 1.000 m "en Diamantina" per machine, whatever
      // the core size actually drilled). RC belongs to Aire Reverso.
      if (drillingType !== "RC" && drillingType !== "DIAMANTINA") {
        rigTotalsByType[rigName].DIAMANTINA = (rigTotalsByType[rigName].DIAMANTINA ?? 0) + meters;
      }
      const scale = normalizeDepthScale(getDepthScale(perf), getDrillingDepth(perf));
      const rawScale = getDepthScale(perf);
      const scaleKeys = new Set<string>([scale]);
      // Keep the RAW tramo string too (e.g. "0-200", "200-400") when it parses,
      // so sites whose memos define non-standard tramos (Chile Chico) resolve
      // rates. Rate tables use either the canonical buckets or raw tramos —
      // never both — so no meters are ever counted twice in a lookup.
      if (rawScale) {
        const m = rawScale.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
        if (m && Number.isFinite(Number.parseFloat(m[1])) && Number.isFinite(Number.parseFloat(m[2]))) {
          scaleKeys.add(rawScale.replace(/\s+/g, ""));
        }
      }
      if (!rigTotalsByTypeAndScale[rigName]) rigTotalsByTypeAndScale[rigName] = {};
      if (!rigTotalsByTypeAndScale[rigName][drillingType]) rigTotalsByTypeAndScale[rigName][drillingType] = {};
      for (const key of scaleKeys) {
        rigTotalsByTypeAndScale[rigName][drillingType][key] =
          (rigTotalsByTypeAndScale[rigName][drillingType][key] ?? 0) + meters;
      }
      // Per-day totals (day + night turn summed) for Bono Metro (PRIMERO §1).
      if (!rigDailyTotalsByTypeAndScale[rigName]) rigDailyTotalsByTypeAndScale[rigName] = {};
      if (!rigDailyTotalsByTypeAndScale[rigName][dateKey]) rigDailyTotalsByTypeAndScale[rigName][dateKey] = {};
      if (!rigDailyTotalsByTypeAndScale[rigName][dateKey][drillingType]) rigDailyTotalsByTypeAndScale[rigName][dateKey][drillingType] = {};
      for (const key of scaleKeys) {
        rigDailyTotalsByTypeAndScale[rigName][dateKey][drillingType][key] =
          (rigDailyTotalsByTypeAndScale[rigName][dateKey][drillingType][key] ?? 0) + meters;
      }
    }
  }

  const input: BonusEngineInput = {
    period: { start: periodStart, end: periodEnd },
    employees: [...works.values()],
    rules,
    monthlyRigTotals,
    rigTypes,
    rigTotalsByType,
    rigTotalsByTypeAndScale,
    rigDailyTotalsByTypeAndScale,
  };

  // PURE engine call – no DB access inside
  const result = calculateBonuses(input);

  // Persist: either replace an existing calculation or create a new one
  let calculation;
  if (replaceCalculationId) {
    // Remove old lines and update the existing record in place
    await db.bonusCalculationLine.deleteMany({
      where: { calculationId: replaceCalculationId },
    });
    calculation = await db.bonusCalculation.update({
      where: { id: replaceCalculationId },
      data: {
        siteId: site.id,
        ruleSetId: ruleSet.id,
        periodStart: start,
        periodEnd: end,
        source,
        status: source === "planilla" ? "pending_review" : "draft",
        totalBonus: result.totalBonus,
        inputSnapshot: { input } as unknown as object,
        updatedAt: new Date(),
      },
    });
  } else {
    calculation = await db.bonusCalculation.create({
      data: {
        siteId: site.id,
        ruleSetId: ruleSet.id,
        periodStart: start,
        periodEnd: end,
        source,
        status: source === "planilla" ? "pending_review" : "draft",
        totalBonus: result.totalBonus,
        inputSnapshot: { input } as unknown as object,
        createdById: createdById ?? null,
      },
    });
  }

  for (const line of result.lines) {
    await db.bonusCalculationLine.create({
      data: {
        calculationId: calculation.id,
        employeeId: line.employeeId,
        roleUsed: line.roleUsed,
        daysWorked: line.daysWorked,
        totalMeters: line.totalMeters,
        totalHours: line.totalHours,
        basePercentage: 0, // No longer a single base percentage
        calculatedBonus: line.calculatedBonus,
        breakdown: { components: line.components, shifts: line.breakdown.shifts } as unknown as object,
      },
    });
  }

  return {
    calculationId: calculation.id,
    totalBonus: result.totalBonus,
    linesCount: result.lines.length,
  };
}


/** Runs Planilla source and persists review rows against the Workera calculation. */
export async function runPlanillaComparison(workeraCalculationId: string, createdById: string | undefined) {
  const official = await db.bonusCalculation.findUniqueOrThrow({ where: { id: workeraCalculationId }, include: { lines: true } });
  if (official.source !== "workera") throw new Error("The official calculation must be a Workera calculation.");
  const start = official.periodStart.toISOString().slice(0, 10);
  const end = official.periodEnd.toISOString().slice(0, 10);
  const planilla = await runCalculation(official.siteId, official.ruleSetId, start, end, createdById, "planilla");
  const officialByEmployee = new Map(official.lines.map((line) => [line.employeeId, line]));
  const planillaLines = await db.bonusCalculationLine.findMany({ where: { calculationId: planilla.calculationId } });
  const employees = [...new Set([...officialByEmployee.keys(), ...planillaLines.map((line) => line.employeeId)])];
  let totalDifference = 0;
  let firstComparisonId = "";
  for (const employeeId of employees) {
    const w = officialByEmployee.get(employeeId);
    const p = planillaLines.find((line) => line.employeeId === employeeId);
    const row = buildPlanillaComparison({ employeeId, siteId: official.siteId, periodStart: start, periodEnd: end, workeraDays: w?.daysWorked ?? 0, planillaDays: p?.daysWorked ?? 0, workeraBonus: w?.calculatedBonus ?? 0, planillaBonus: p?.calculatedBonus ?? 0 });
    totalDifference += row.difference;
    const saved = await db.calculationComparison.create({ data: { calculationId: official.id, employeeId, siteId: official.siteId, periodStart: official.periodStart, periodEnd: official.periodEnd, workeraDays: row.workeraDays, planillaDays: row.planillaDays, workeraBonus: row.workeraBonus, planillaBonus: row.planillaBonus, difference: row.difference, differenceFlags: row.flags, reviewStatus: "pending" } });
    firstComparisonId ||= saved.id;
  }
  return { comparisonId: firstComparisonId, planillaCalculationId: planilla.calculationId, totalDifference };
}
