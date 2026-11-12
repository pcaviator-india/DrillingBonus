"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

export type BestRigActionState = { error?: string; success?: string };

const bestRigSchema = z.object({
  employeeId: z.string().min(1, "Select an employee"),
  siteId: z.string().optional().nullable(),
  reason: z.string().optional(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  effectiveTo: z.string().optional().nullable(),
});

export async function createBestRigEligibleAction(
  _prev: BestRigActionState,
  formData: FormData,
): Promise<BestRigActionState> {
  const session = await auth();
  if (session?.user.role !== "admin" && session?.user.role !== "supervisor") {
    return { error: "Only admins and supervisors can manage best rig eligibility." };
  }

  const parsed = bestRigSchema.safeParse({
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
    await db.bestRigEligibleEmployee.create({
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
    console.error("Failed to create best rig eligibility:", e);
    return { error: "Failed to create best rig eligibility." };
  }

  revalidatePath("/best-rig-eligible");
  return { success: "Best rig eligibility created." };
}

export async function deleteBestRigEligibleAction(
  id: string,
): Promise<BestRigActionState> {
  const session = await auth();
  if (session?.user.role !== "admin" && session?.user.role !== "supervisor") {
    return { error: "Only admins and supervisors can manage best rig eligibility." };
  }

  try {
    await db.bestRigEligibleEmployee.delete({ where: { id } });
  } catch (e) {
    console.error("Failed to delete best rig eligibility:", e);
    return { error: "Failed to delete best rig eligibility." };
  }

  revalidatePath("/best-rig-eligible");
  return { success: "Best rig eligibility deleted." };
}