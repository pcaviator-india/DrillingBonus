"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const schema = z.object({ workeraId: z.string().min(1), planillaId: z.string().min(1) });
export type ComparisonState = { error?: string; success?: string };

export async function createComparisonAction(_prev: ComparisonState, formData: FormData): Promise<ComparisonState> {
  try {
    const session = await auth();
    if (!session?.user) return { error: "Not authenticated" };
    const parsed = schema.safeParse({ workeraId: formData.get("workeraId"), planillaId: formData.get("planillaId") });
    if (!parsed.success) return { error: "Select one Workera and one Planilla calculation." };
    const [w, p] = await Promise.all([
      db.bonusCalculation.findUnique({ where: { id: parsed.data.workeraId } }),
      db.bonusCalculation.findUnique({ where: { id: parsed.data.planillaId } }),
    ]);
    if (!w || !p || w.source !== "workera" || p.source !== "planilla") return { error: "Select one Workera and one Planilla calculation." };
    if (w.siteId !== p.siteId || w.periodStart.getTime() !== p.periodStart.getTime() || w.periodEnd.getTime() !== p.periodEnd.getTime()) return { error: "Calculations must use the same project and period." };
    const existing = await db.calculationComparison.findFirst({ where: { calculationId: w.id, planillaCalculationId: p.id } });
    if (existing) return { error: "These calculations were already compared." };
    const [wl, pl] = await Promise.all([
      db.bonusCalculationLine.findMany({ where: { calculationId: w.id } }),
      db.bonusCalculationLine.findMany({ where: { calculationId: p.id } }),
    ]);
    const byEmployee = new Map(pl.map((line) => [line.employeeId, line]));
    await db.$transaction(wl.map((line) => {
      const other = byEmployee.get(line.employeeId);
      return db.calculationComparison.create({ data: { calculationId: w.id, planillaCalculationId: p.id, employeeId: line.employeeId, siteId: w.siteId, periodStart: w.periodStart, periodEnd: w.periodEnd, workeraDays: line.daysWorked, planillaDays: other?.daysWorked ?? 0, workeraBonus: line.calculatedBonus, planillaBonus: other?.calculatedBonus ?? 0, difference: (other?.calculatedBonus ?? 0) - line.calculatedBonus, reviewStatus: "pending" } });
    }));
    revalidatePath("/comparisons");
    return { success: "Comparison created. All rows require review." };
  } catch (error) {
    console.error("createComparisonAction", error);
    return { error: error instanceof Error ? error.message : "Comparison failed" };
  }
}

