import { z } from "zod";

/**
 * Zod schemas for validating bonus type parameters.
 * Each bonus type has its own parameter schema that validates
 * the JSON configuration stored in BonusRule.parameters.
 */

// Production Meter Bonus parameters
export const productionMeterParamsSchema = z.object({
  rateTable: z.record(z.string(), z.record(z.string(), z.record(z.string(), z.number()))),
  bestRigSelection: z.enum(["employee_rig_month", "best_rig_month", "employee_rig"]),
  maxMetersPerShift: z.number().positive().optional(),
  // Report depth band -> rateTable depth key (e.g. { "0-100": "0-200" }).
  depthScaleAliases: z.record(z.string(), z.string()).optional(),
  attendanceProrate: z
    .object({
      // "days_in_month" is a FIXED standard of 30 days (regardless of actual calendar length).
      divisor: z.union([z.literal("days_in_month"), z.number().int().positive()]),
    })
    .optional(),
  rateKey: z.string().optional(),
  splitFactor: z.number().positive().optional(),
  bestRigRule: z
    .object({
      arThresholdMeters: z.number().positive(),
    })
    .optional(),
});

// Above Threshold Bonus parameters
export const aboveThresholdParamsSchema = z.object({
  thresholds: z.record(z.string(), z.number().nonnegative()),
  multiplier: z.number().positive(),
  baseRateTable: z.record(z.string(), z.record(z.string(), z.record(z.string(), z.number()))),
  incrementOnly: z.boolean().optional(),
});

// Monthly Goal Bonus parameters
export const monthlyGoalParamsSchema = z.object({
  goals: z.record(z.string(), z.number().positive()),
  amounts: z.record(z.string(), z.number().nonnegative()),
});

// High Altitude Bonus parameters
export const highAltitudeParamsSchema = z.object({
  monthlyAmount: z.number().nonnegative(),
  daysInMonth: z.number().int().positive().default(30),
  payMode: z.enum(["prorated", "full"]).default("prorated"),
});

// End of Season Bonus parameters
export const endOfSeasonParamsSchema = z.object({
  salaryMultiplier: z.number().positive(),
  totalDays: z.number().int().positive(),
  baseSalary: z.number().nonnegative(),
  excellenceWeight: z.number().min(0).max(1).optional(),
  attendanceWeight: z.number().min(0).max(1).optional(),
});

// Directional Drilling Bonus parameters
export const directionalParamsSchema = z.object({
  rateTable: z.record(z.string(), z.record(z.string(), z.number())),
  hoursFactor: z.number().positive(),
});

// Termination Adjustment parameters (gate that multiplies all other bonuses)
export const terminationParamsSchema = z.object({
  terminationMultiplier: z.number().min(0).max(1),
  reason: z.string(),
  witnessOrientationOk: z.boolean().optional(),
  equipmentNotificationOk: z.boolean().optional(),
});

/**
 * Maps bonus type codes to their parameter schemas for validation.
 */
export const BONUS_TYPE_PARAMETER_SCHEMAS: Record<string, z.ZodType> = {
  production_meter: productionMeterParamsSchema,
  above_threshold: aboveThresholdParamsSchema,
  monthly_goal: monthlyGoalParamsSchema,
  high_altitude: highAltitudeParamsSchema,
  end_of_season: endOfSeasonParamsSchema,
  directional: directionalParamsSchema,
  termination_adjustment: terminationParamsSchema,
};

/**
 * Validates parameters for a given bonus type.
 */
export function validateBonusTypeParams(bonusTypeCode: string, params: unknown): { success: boolean; error?: string } {
  const schema = BONUS_TYPE_PARAMETER_SCHEMAS[bonusTypeCode];
  if (!schema) {
    return { success: false, error: `Unknown bonus type: ${bonusTypeCode}` };
  }
  const result = schema.safeParse(params);
  if (!result.success) {
    return { success: false, error: result.error.issues[0]?.message ?? "Invalid parameters" };
  }
  return { success: true };
}

export type ProductionMeterParams = z.infer<typeof productionMeterParamsSchema>;
export type AboveThresholdParams = z.infer<typeof aboveThresholdParamsSchema>;
export type MonthlyGoalParams = z.infer<typeof monthlyGoalParamsSchema>;
export type HighAltitudeParams = z.infer<typeof highAltitudeParamsSchema>;
export type EndOfSeasonParams = z.infer<typeof endOfSeasonParamsSchema>;
export type DirectionalParams = z.infer<typeof directionalParamsSchema>;
export type TerminationParams = z.infer<typeof terminationParamsSchema>;
