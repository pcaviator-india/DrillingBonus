/**
 * Mock CorePlan-style data (rig performance + crew assignments).
 * Used only while the real CorePlan integration (Phase 3) is not available.
 * Keeping it isolated in lib/coreplan/ means swapping providers later
 * requires no changes to the engine or UI.
 */
/** UTC-safe yyyy-MM-dd formatter (date-fns format() is local-time based). */
export function fmtUtc(date: Date): string {
  return (
    date.getUTCFullYear() +
    "-" +
    String(date.getUTCMonth() + 1).padStart(2, "0") +
    "-" +
    String(date.getUTCDate()).padStart(2, "0")
  );
}

export interface MockRigPerformance {
  rigName: string;
  rigCode: string;
  date: string;
  shift: "day" | "night";
  hole: string;
  drillingLevel: string;
  metersDrilled: number;
  hoursSpent: number;
}

export interface MockCrewAssignment {
  workeraId: string;
  rigName: string;
  date: string;
  shift: "day" | "night";
  roleOnShift: string;
}

const RIGS = [
  { name: "Rig 01", code: "RIG-01" },
  { name: "Rig 02", code: "RIG-02" },
];

const CREW_ROTATION: { workeraId: string; rig: number; role: string; shift: "day" | "night" }[] = [
  { workeraId: "wk-001", rig: 0, role: "Supervisor", shift: "day" },
  { workeraId: "wk-002", rig: 0, role: "Driller", shift: "day" },
  { workeraId: "wk-003", rig: 0, role: "Driver", shift: "night" },
  { workeraId: "wk-004", rig: 1, role: "Helper", shift: "day" },
  { workeraId: "wk-005", rig: 1, role: "Driller", shift: "night" },
];

const LEVELS = ["soft", "medium", "hard"];

/** All UTC-safe: no local-time Date methods anywhere. */
function utcDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let d = 1; d <= last; d++) days.push(new Date(Date.UTC(year, month - 1, d)));
  return days;
}

export function getMockRigPerformances(year: number, month: number): MockRigPerformance[] {
  const out: MockRigPerformance[] = [];
  const days = utcDaysInMonth(year, month);
  for (const day of days) {
    const dow = day.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    for (const rig of RIGS) {
      for (const shift of ["day", "night"] as const) {
        const seed = day.getUTCDate() + rig.code.length + (shift === "night" ? 5 : 0);
        out.push({
          rigName: rig.name,
          rigCode: rig.code,
          date: fmtUtc(day),
          shift,
          hole: `H-${String(day.getUTCDate()).padStart(2, "0")}-${shift[0].toUpperCase()}`,
          drillingLevel: LEVELS[seed % LEVELS.length],
          metersDrilled: 40 + (seed % 7) * 10,
          hoursSpent: 6 + (seed % 3),
        });
      }
    }
  }
  return out;
}

export function getMockCrewAssignments(year: number, month: number): MockCrewAssignment[] {
  const out: MockCrewAssignment[] = [];
  const days = utcDaysInMonth(year, month);
  for (const day of days) {
    const dow = day.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    for (const member of CREW_ROTATION) {
      // wk-004 occasionally misses days to exercise the attendance gate
      if (member.workeraId === "wk-004" && day.getUTCDate() % 5 === 0) continue;
      out.push({
        workeraId: member.workeraId,
        rigName: RIGS[member.rig].name,
        date: fmtUtc(day),
        shift: member.shift,
        roleOnShift: member.role,
      });
    }
  }
  return out;
}
