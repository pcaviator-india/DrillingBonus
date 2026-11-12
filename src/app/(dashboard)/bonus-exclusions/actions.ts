"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

export type ExclusionActionState = { error?: string; success?: string };

const exclusionSchema = z.object({
  employeeId: z.string().min(1, "Select an employee"),
  siteId: z.string().optional().nullable(),
  reason: z.string().optional(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  effectiveTo: z.string().optional().nullable(),
});

export async function createExclusionAction(
  _prev: ExclusionActionState,
  formData: FormData,
): Promise<ExclusionActionState> {
  const session = await auth();
  if (session?.user.role !== "admin" && session?.user.role !== "supervisor") {
    return { error: "Only admins and supervisors can manage exclusions." };
  }

  const parsed = exclusionSchema.safeParse({
    employeeId: formData.get("employeeId"),
    siteId: formData.get("siteId") || null,
    reason: formData.get("reason") || undefined,
    effectiveFrom: formData.get("effectiveFrom"),
    effectiveTo: formData.get("effectiveTo") || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    await db.bonusExclusion.create({
      data: {
        employeeId: parsed.data.employeeId,
        siteId: parsed.data.siteId ?? undefined,
        reason: parsed.data.reason ?? null,
        effectiveFrom: new Date(`${parsed.data.effectiveFrom}T00:00:00Z`),
        effectiveTo: parsed.data.effectiveTo
          ? new Date(`${parsed.data.effectiveTo}T00:00:00Z`)
          : null,
        createdById: session.user.id,
      },
    });
  } catch (e) {
    console.error("Failed to create exclusion:", e);
    return { error: "Failed to create exclusion." };
  }

  revalidatePath("/bonus-exclusions");
  return { success: "Exclusion created." };
}

export async function deleteExclusionAction(id: string): Promise<ExclusionActionState> {
  const session = await auth();
  if (session?.user.role !== "admin" && session?.user.role !== "supervisor") {
    return { error: "Only admins and supervisors can manage exclusions." };
  }

  try {
    await db.bonusExclusion.delete({ where: { id } });
  } catch (e) {
    console.error("Failed to delete exclusion:", e);
    return { error: "Failed to delete exclusion." };
  }

  revalidatePath("/bonus-exclusions");
  return { success: "Exclusion deleted." };
}