import { z } from "zod";

/**
 * Raw CorePlan payload schemas (Zod-validated at the client boundary).
 * These mirror the Workera types pattern: raw provider data is validated
 * before it ever reaches normalized models or the engine.
 */

export const coreplanRigSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
});

export const coreplanPlodSchema = z.object({
  /** CorePlan plod (shift performance record) */
  rigCode: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shift: z.enum(["day", "night"]),
  hole: z.string().min(1),
  drillingLevel: z.string().min(1),
  meters: z.number().nonnegative(),
  hours: z.number().nonnegative(),
});

export const coreplanAssignmentSchema = z.object({
  /** Staff assignment to a rig/shift */
  employeeExternalId: z.string().min(1),
  rigCode: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shift: z.enum(["day", "night"]),
  role: z.string().min(1),
});

export type CorePlanRig = z.infer<typeof coreplanRigSchema>;
export type CorePlanPlod = z.infer<typeof coreplanPlodSchema>;
export type CorePlanAssignment = z.infer<typeof coreplanAssignmentSchema>;
