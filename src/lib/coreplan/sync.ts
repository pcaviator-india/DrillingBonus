import { db } from "@/lib/db";
import { coreplanClient } from "./client";

export type CorePlanSyncResult = {
  source: "coreplan" | "coreplan-mock";
  rigsUpserted: number;
  plodsUpserted: number;
  assignmentsUpserted: number;
  unmatchedAssignments: number;
};

/**
 * Syncs CorePlan data (rigs, plods/shift performances, staff assignments)
 * into the normalized models. Goes exclusively through coreplanClient.
 * Join key for staff: CorePlan employeeExternalId ↔ Employee.workeraId
 * (falling back to Employee.coreplanId).
 */
export async function syncCorePlanData(
  from: string, // yyyy-MM-dd
  to: string, // yyyy-MM-dd
): Promise<CorePlanSyncResult> {
  const [rigs, plods, assignments] = await Promise.all([
    coreplanClient.fetchRigs(),
    coreplanClient.fetchPlods(from, to),
    coreplanClient.fetchStaffAssignments(from, to),
  ]);

  // Upsert rigs by code
  const rigByCode = new Map<string, { id: string }>();
  for (const r of await db.rig.findMany()) {
    if (r.code) rigByCode.set(r.code, r);
  }
  let rigsUpserted = 0;
  for (const rig of rigs) {
    const existing = rigByCode.get(rig.code);
    if (existing) continue;
    const created = await db.rig.upsert({
      where: { code: rig.code },
      create: { code: rig.code, name: rig.name },
      update: { name: rig.name },
    });
    rigByCode.set(rig.code, created);
    rigsUpserted += 1;
  }

  // Upsert plods → RigShiftPerformance (unique: rigId+date+shift)
  let plodsUpserted = 0;
  for (const p of plods) {
    const rig = rigByCode.get(p.rigCode);
    if (!rig) continue;
    const date = new Date(`${p.date}T00:00:00Z`);
    await db.rigShiftPerformance.upsert({
      where: { rigId_date_shift: { rigId: rig.id, date, shift: p.shift } },
      create: {
        rigId: rig.id,
        date,
        shift: p.shift,
        hole: p.hole,
        drillingLevel: p.drillingLevel,
        metersDrilled: p.meters,
        hoursSpent: p.hours,
        source: "coreplan",
        rawData: p as unknown as object,
      },
      update: {
        hole: p.hole,
        drillingLevel: p.drillingLevel,
        metersDrilled: p.meters,
        hoursSpent: p.hours,
        rawData: p as unknown as object,
      },
    });
    plodsUpserted += 1;
  }

  // Upsert staff assignments → CrewAssignment
  const employees = await db.employee.findMany({
    select: { id: true, workeraId: true, coreplanId: true },
  });
  const empByExternal = new Map<string, string>();
  for (const e of employees) {
    if (e.workeraId) empByExternal.set(e.workeraId, e.id);
    if (e.coreplanId) empByExternal.set(e.coreplanId, e.id);
  }

  let assignmentsUpserted = 0;
  let unmatchedAssignments = 0;
  for (const a of assignments) {
    const employeeId = empByExternal.get(a.employeeExternalId);
    const rig = rigByCode.get(a.rigCode);
    if (!employeeId || !rig) {
      unmatchedAssignments += 1;
      continue;
    }
    const date = new Date(`${a.date}T00:00:00Z`);
    const existing = await db.crewAssignment.findFirst({
      where: { employeeId, rigId: rig.id, date, shift: a.shift },
    });
    if (existing) {
      await db.crewAssignment.update({
        where: { id: existing.id },
        data: { roleOnShift: a.role, source: "coreplan" },
      });
    } else {
      await db.crewAssignment.create({
        data: {
          employeeId,
          rigId: rig.id,
          date,
          shift: a.shift,
          roleOnShift: a.role,
          source: "coreplan",
          rawData: a as unknown as object,
        },
      });
    }
    assignmentsUpserted += 1;
  }

  return {
    source: coreplanClient.isMock() ? "coreplan-mock" : "coreplan",
    rigsUpserted,
    plodsUpserted,
    assignmentsUpserted,
    unmatchedAssignments,
  };
}

/** Backward-compatible alias used by existing callers. */
export async function loadMockCorePlanData(
  year: number,
  month: number,
): Promise<{ performancesUpserted: number; assignmentsUpserted: number }> {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const to = `${year}-${String(month).padStart(2, "0")}-31`;
  const res = await syncCorePlanData(from, to);
  return {
    performancesUpserted: res.plodsUpserted,
    assignmentsUpserted: res.assignmentsUpserted,
  };
}

