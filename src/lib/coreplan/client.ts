import { z } from "zod";
import {
  coreplanRigSchema,
  coreplanPlodSchema,
  coreplanAssignmentSchema,
  type CorePlanRig,
  type CorePlanPlod,
  type CorePlanAssignment,
} from "./types";
import {
  getMockRigPerformances,
  getMockCrewAssignments,
} from "./mock";

const BASE_URL = process.env.COREPLAN_BASE_URL ?? "";
const API_KEY = process.env.COREPLAN_API_KEY ?? "";
const MOCK = process.env.COREPLAN_MOCK !== "false";

function toRig(r: { rigName: string; rigCode: string }): CorePlanRig {
  return { code: r.rigCode, name: r.rigName };
}

function toPlod(p: {
  rigCode: string;
  date: string;
  shift: "day" | "night";
  hole: string;
  drillingLevel: string;
  metersDrilled: number;
  hoursSpent: number;
}): CorePlanPlod {
  return {
    rigCode: p.rigCode,
    date: p.date,
    shift: p.shift,
    hole: p.hole,
    drillingLevel: p.drillingLevel,
    meters: p.metersDrilled,
    hours: p.hoursSpent,
  };
}

function toAssignment(a: {
  workeraId: string;
  rigName: string;
  date: string;
  shift: "day" | "night";
  roleOnShift: string;
}): CorePlanAssignment {
  return {
    employeeExternalId: a.workeraId,
    rigCode: a.rigName, // mock uses rig name as code reference
    date: a.date,
    shift: a.shift,
    role: a.roleOnShift,
  };
}

/**
 * Dedicated CorePlan client. All external CorePlan API calls go through here –
 * never call CorePlan from components, routes, or the bonus engine directly.
 * Mock mode (COREPLAN_MOCK) stands in until real credentials are available;
 * swapping to the real API requires no changes elsewhere.
 */
export const coreplanClient = {
  isMock(): boolean {
    return MOCK;
  },

  async fetchRigs(): Promise<CorePlanRig[]> {
    if (MOCK) return mockRigs();
    const res = await fetch(`${BASE_URL}/rigs`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`CorePlan rigs fetch failed: ${res.status}`);
    const json: unknown = await res.json();
    return z.array(coreplanRigSchema).parse(json);
  },

  async fetchPlods(from: string, to: string): Promise<CorePlanPlod[]> {
    if (MOCK) return mockPlods(from, to);
    const res = await fetch(`${BASE_URL}/plods?from=${from}&to=${to}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`CorePlan plods fetch failed: ${res.status}`);
    const json: unknown = await res.json();
    return z.array(coreplanPlodSchema).parse(json);
  },

  async fetchStaffAssignments(from: string, to: string): Promise<CorePlanAssignment[]> {
    if (MOCK) return mockAssignments(from, to);
    const res = await fetch(
      `${BASE_URL}/staff-assignments?from=${from}&to=${to}`,
      { headers: { Authorization: `Bearer ${API_KEY}` }, cache: "no-store" },
    );
    if (!res.ok)
      throw new Error(`CorePlan staff assignments fetch failed: ${res.status}`);
    const json: unknown = await res.json();
    return z.array(coreplanAssignmentSchema).parse(json);
  },
};

// ---- mock-mode helpers (parse raw mock data through the same schemas) ----

function mockRigs(): CorePlanRig[] {
  const seen = new Map<string, CorePlanRig>();
  for (const p of getMockRigPerformances(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1)) {
    if (!seen.has(p.rigCode)) seen.set(p.rigCode, toRig(p));
  }
  return [...seen.values()];
}

function inRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

function mockPlods(from: string, to: string): CorePlanPlod[] {
  const year = Number(from.slice(0, 4));
  const month = Number(from.slice(5, 7));
  return getMockRigPerformances(year, month)
    .filter((p) => inRange(p.date, from, to))
    .map(toPlod)
    .filter((p) => coreplanPlodSchema.safeParse(p).success);
}

function mockAssignments(from: string, to: string): CorePlanAssignment[] {
  const year = Number(from.slice(0, 4));
  const month = Number(from.slice(5, 7));
  const rigs = new Map(
    getMockRigPerformances(year, month).map((p) => [p.rigName, p.rigCode]),
  );
  return getMockCrewAssignments(year, month)
    .filter((a) => inRange(a.date, from, to))
    .map((a) => toAssignment({ ...a, rigName: rigs.get(a.rigName) ?? a.rigName }))
    .filter((a) => coreplanAssignmentSchema.safeParse(a).success);
}
