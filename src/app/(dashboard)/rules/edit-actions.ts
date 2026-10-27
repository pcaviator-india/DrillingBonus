"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { validateBonusTypeParams } from "@/lib/bonus-engine/schema";

export type UpdateRuleSetState = { error?: string; success?: string };

const bonusRuleSchema = z.object({
  ruleId: z.string().optional(),
  bonusTypeId: z.string().min(1),
  positionFilter: z.string().optional(),
  drillingTypeFilter: z.string().optional(),
  priority: z.coerce.number().int().default(0),
  minAttendanceDays: z.coerce.number().int().min(0).nullable().optional(),
  parametersJson: z.string().min(1, "Parameters JSON is required"),
  notes: z.string().optional(),
});

const updateRuleSetSchema = z.object({
  ruleSetId: z.string().min(1),
  name: z.string().min(1).max(100),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  isActive: z.boolean().default(true),
  rules: z.array(bonusRuleSchema).min(1, "At least one rule is required"),
});

function parseStringList(raw: string | undefined): string[] {
  if (!raw || !raw.trim()) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export async function updateRuleSetAction(
  _prev: UpdateRuleSetState,
  formData: FormData,
): Promise<UpdateRuleSetState> {
  const session = await auth();
  if (session?.user.role !== "admin") {
    return { error: "Only admins can manage rules" };
  }

  const ruleSetId = formData.get("ruleSetId") as string;
  const bonusTypeIds = formData.getAll("bonusTypeId").map(String);
  const rulesRaw = bonusTypeIds.map((bonusTypeId, i) => ({
    ruleId: (formData.getAll("ruleId")[i] as string) || undefined,
    bonusTypeId,
    positionFilter: (formData.getAll("positionFilter")[i] as string) ?? "",
    drillingTypeFilter: (formData.getAll("drillingTypeFilter")[i] as string) ?? "",
    priority: formData.getAll("priority")[i],
    minAttendanceDays: (formData.getAll("minAttendanceDays")[i] as string) || null,
    parametersJson: (formData.getAll("parametersJson")[i] as string) ?? "",
    notes: (formData.getAll("notes")[i] as string) ?? "",
  }));

  const parsed = updateRuleSetSchema.safeParse({
    ruleSetId,
    name: formData.get("name"),
    effectiveFrom: formData.get("effectiveFrom"),
    effectiveTo: (formData.get("effectiveTo") as string) || null,
    isActive: formData.get("isActive") === "true",
    rules: rulesRaw,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // Validate each rule's parameters
  for (const rule of parsed.data.rules) {
    let parameters: unknown;
    try {
      parameters = JSON.parse(rule.parametersJson);
    } catch {
      return { error: "Invalid JSON in parameters" };
    }

    const bonusType = await db.bonusType.findUnique({ where: { id: rule.bonusTypeId } });
    if (!bonusType) {
      return { error: `Bonus type not found` };
    }

    const validation = validateBonusTypeParams(bonusType.code, parameters);
    if (!validation.success) {
      return { error: `Invalid parameters for ${bonusType.name}: ${validation.error}` };
    }
  }

  try {
    const { rules, ...ruleSetData } = parsed.data;

    // Update rule set metadata
    await db.bonusRuleSet.update({
      where: { id: ruleSetId },
      data: {
        name: ruleSetData.name,
        effectiveFrom: new Date(`${ruleSetData.effectiveFrom}T00:00:00Z`),
        effectiveTo: ruleSetData.effectiveTo ? new Date(`${ruleSetData.effectiveTo}T00:00:00Z`) : null,
        isActive: ruleSetData.isActive,
      },
    });

    // Get existing rule IDs
    const existingRules = await db.bonusRule.findMany({
      where: { ruleSetId },
      select: { id: true },
    });
    const existingRuleIds = new Set(existingRules.map((r) => r.id));

    // Track which rules are being kept
    const keptRuleIds = new Set<string>();

    // Upsert rules
    for (const rule of rules) {
      const ruleData = {
        bonusTypeId: rule.bonusTypeId,
        positionFilter: parseStringList(rule.positionFilter),
        drillingTypeFilter: parseStringList(rule.drillingTypeFilter),
        priority: rule.priority,
        minAttendanceDays: rule.minAttendanceDays ?? null,
        parameters: JSON.parse(rule.parametersJson) as object,
        notes: rule.notes || null,
      };

      if (rule.ruleId && existingRuleIds.has(rule.ruleId)) {
        // Update existing rule
        await db.bonusRule.update({
          where: { id: rule.ruleId },
          data: ruleData,
        });
        keptRuleIds.add(rule.ruleId);
      } else {
        // Create new rule
        const newRule = await db.bonusRule.create({
          data: { ...ruleData, ruleSetId },
        });
        keptRuleIds.add(newRule.id);
      }
    }

    // Delete rules that were removed
    for (const id of existingRuleIds) {
      if (!keptRuleIds.has(id)) {
        await db.bonusRule.delete({ where: { id } });
      }
    }
  } catch (e) {
    console.error("Failed to update rule set:", e);
    return { error: "Failed to update rule set" };
  }

  revalidatePath("/rules");
  revalidatePath(`/rules/${ruleSetId}`);
  return { success: "Rule set updated successfully" };
}
