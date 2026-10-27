"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { validateBonusTypeParams } from "@/lib/bonus-engine/schema";

export type CreateRuleSetState = { error?: string; success?: string };

const bonusRuleSchema = z.object({
  bonusTypeId: z.string().min(1),
  positionFilter: z.string().optional(), // comma-separated list
  drillingTypeFilter: z.string().optional(), // comma-separated list
  priority: z.coerce.number().int().default(0),
  minAttendanceDays: z.coerce.number().int().min(0).nullable().optional(),
  parametersJson: z.string().min(1, "Parameters JSON is required"),
  notes: z.string().optional(),
});

const createRuleSetSchema = z.object({
  siteId: z.string().min(1),
  name: z.string().min(1).max(100),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rules: z.array(bonusRuleSchema).min(1, "At least one rule is required"),
});

function parseStringList(raw: string | undefined): string[] {
  if (!raw || !raw.trim()) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export async function createRuleSetAction(
  _prev: CreateRuleSetState,
  formData: FormData,
): Promise<CreateRuleSetState> {
  const session = await auth();
  if (session?.user.role !== "admin") {
    return { error: "Only admins can manage rules" };
  }

  const bonusTypeIds = formData.getAll("bonusTypeId").map(String);
  const rulesRaw = bonusTypeIds.map((bonusTypeId, i) => ({
    bonusTypeId,
    positionFilter: (formData.getAll("positionFilter")[i] as string) ?? "",
    drillingTypeFilter: (formData.getAll("drillingTypeFilter")[i] as string) ?? "",
    priority: formData.getAll("priority")[i],
    minAttendanceDays: (formData.getAll("minAttendanceDays")[i] as string) || null,
    parametersJson: (formData.getAll("parametersJson")[i] as string) ?? "",
    notes: (formData.getAll("notes")[i] as string) ?? "",
  }));

  const parsed = createRuleSetSchema.safeParse({
    siteId: formData.get("siteId"),
    name: formData.get("name"),
    effectiveFrom: formData.get("effectiveFrom"),
    rules: rulesRaw,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // Validate each rule's parameters against its bonus type schema
  const rulesToCreate = [];
  for (const rule of parsed.data.rules) {
    let parameters: unknown;
    try {
      parameters = JSON.parse(rule.parametersJson);
    } catch {
      return { error: `Invalid JSON in parameters for rule` };
    }

    // Find the bonus type to validate parameters
    const bonusType = await db.bonusType.findUnique({ where: { id: rule.bonusTypeId } });
    if (!bonusType) {
      return { error: `Bonus type not found: ${rule.bonusTypeId}` };
    }

    const validation = validateBonusTypeParams(bonusType.code, parameters);
    if (!validation.success) {
      return { error: `Invalid parameters for ${bonusType.name}: ${validation.error}` };
    }

    rulesToCreate.push({
      bonusTypeId: rule.bonusTypeId,
      positionFilter: parseStringList(rule.positionFilter),
      drillingTypeFilter: parseStringList(rule.drillingTypeFilter),
      priority: rule.priority,
      minAttendanceDays: rule.minAttendanceDays ?? null,
      parameters: parameters as object,
      notes: rule.notes || null,
    });
  }

  try {
    await db.bonusRuleSet.create({
      data: {
        siteId: parsed.data.siteId,
        name: parsed.data.name,
        effectiveFrom: new Date(`${parsed.data.effectiveFrom}T00:00:00Z`),
        rules: { create: rulesToCreate },
      },
    });
  } catch (e) {
    console.error("Failed to create rule set:", e);
    return { error: "Failed to create rule set" };
  }

  revalidatePath("/rules");
  return { success: `Rule set "${parsed.data.name}" created` };
}
