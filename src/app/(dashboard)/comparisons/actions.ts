"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const schema = z.object({ workeraId: z.string().min(1), planillaId: z.string().min(1) });
const bulkSchema = z.object({
  workeraIds: z.array(z.string().min(1)).min(1),
  planillaIds: z.array(z.string().min(1)).min(1),
});
const deleteBatchSchema = z.object({
  workeraId: z.string().min(1),
  planillaId: z.string().min(1),
});
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
    if (w.periodStart.getTime() !== p.periodStart.getTime() || w.periodEnd.getTime() !== p.periodEnd.getTime()) return { error: "Calculations must use the same period." };
    const existing = await db.calculationComparison.findFirst({ where: { calculationId: w.id, planillaCalculationId: p.id } });
    if (existing) return { error: "These calculations were already compared." };
    const workeraLines = await db.bonusCalculationLine.findMany({ where: { calculationId: w.id } });
    const planillaLines = await db.bonusCalculationLine.findMany({ where: { calculationId: p.id } });
    const workeraByEmployee = new Map(workeraLines.map((line) => [line.employeeId, line]));
    const planillaByEmployee = new Map(planillaLines.map((line) => [line.employeeId, line]));
    const employeeIds = [...new Set([...workeraByEmployee.keys(), ...planillaByEmployee.keys()])];
    await db.$transaction(employeeIds.map((employeeId) => {
      const workeraLine = workeraByEmployee.get(employeeId);
      const planillaLine = planillaByEmployee.get(employeeId);
      return db.calculationComparison.create({ data: { calculationId: w.id, planillaCalculationId: p.id, employeeId, siteId: w.siteId, periodStart: w.periodStart, periodEnd: w.periodEnd, workeraDays: workeraLine?.daysWorked ?? 0, planillaDays: planillaLine?.daysWorked ?? 0, workeraBonus: workeraLine?.calculatedBonus ?? 0, planillaBonus: planillaLine?.calculatedBonus ?? 0, difference: (planillaLine?.calculatedBonus ?? 0) - (workeraLine?.calculatedBonus ?? 0), differenceFlags: w.siteId !== p.siteId ? ["site-mismatch"] : [], reviewStatus: "pending" } });
    }));
    revalidatePath("/comparisons");
    return { success: "Comparison created. All rows require review." };
  } catch (error) {
    console.error("createComparisonAction", error);
    return { error: error instanceof Error ? error.message : "Comparison failed" };
  }
}

export async function createBulkComparisonsAction(_prev: ComparisonState, formData: FormData): Promise<ComparisonState> {
  const session = await auth();
  if (!session?.user) return { error: "Not authenticated" };
  const parsed = bulkSchema.safeParse({
    workeraIds: formData.getAll("workeraIds"),
    planillaIds: formData.getAll("planillaIds"),
  });
  if (!parsed.success) return { error: "Select at least one Workera and one Planilla calculation." };
  try {
    const [workeras, planillas] = await Promise.all([
      db.bonusCalculation.findMany({ where: { id: { in: parsed.data.workeraIds }, source: "workera" } }),
      db.bonusCalculation.findMany({ where: { id: { in: parsed.data.planillaIds }, source: "planilla" } }),
    ]);
    const period = workeras[0] && planillas[0]
      ? { start: workeras[0].periodStart.getTime(), end: workeras[0].periodEnd.getTime() }
      : null;
    const validWorkeras = period ? workeras.filter((c) => c.periodStart.getTime() === period.start && c.periodEnd.getTime() === period.end) : [];
    const validPlanillas = period ? planillas.filter((c) => c.periodStart.getTime() === period.start && c.periodEnd.getTime() === period.end) : [];
    if (validWorkeras.length === 0 || validPlanillas.length === 0) return { error: "Select calculations from the same period." };
    const [workeraLines, planillaLines] = await Promise.all([
      db.bonusCalculationLine.findMany({ where: { calculationId: { in: validWorkeras.map((c) => c.id) } } }),
      db.bonusCalculationLine.findMany({ where: { calculationId: { in: validPlanillas.map((c) => c.id) } } }),
    ]);
    const workeraByEmployee = new Map<string, { days: number; bonus: number; calculationIds: string[] }>();
    const planillaByEmployee = new Map<string, { days: number; bonus: number; calculationIds: string[] }>();
    for (const line of workeraLines) {
      const current = workeraByEmployee.get(line.employeeId) ?? { days: 0, bonus: 0, calculationIds: [] };
      current.days += line.daysWorked;
      current.bonus += line.calculatedBonus;
      if (!current.calculationIds.includes(line.calculationId)) current.calculationIds.push(line.calculationId);
      workeraByEmployee.set(line.employeeId, current);
    }
    for (const line of planillaLines) {
      const current = planillaByEmployee.get(line.employeeId) ?? { days: 0, bonus: 0, calculationIds: [] };
      current.days += line.daysWorked;
      current.bonus += line.calculatedBonus;
      if (!current.calculationIds.includes(line.calculationId)) current.calculationIds.push(line.calculationId);
      planillaByEmployee.set(line.employeeId, current);
    }
    const employeeIds = [...new Set([...workeraByEmployee.keys(), ...planillaByEmployee.keys()])];
    const workeraSites = [...new Set(validWorkeras.map((c) => c.siteId))];
    const planillaSites = [...new Set(validPlanillas.map((c) => c.siteId))];
    const representative = validWorkeras[0] ?? validPlanillas[0];
    const periodStart = representative.periodStart;
    const periodEnd = representative.periodEnd;
    const existing = await db.calculationComparison.findMany({ where: { periodStart, periodEnd, employeeId: { in: employeeIds } }, select: { employeeId: true } });
    const existingIds = new Set(existing.map((row) => row.employeeId));
    const newEmployeeIds = employeeIds.filter((employeeId) => !existingIds.has(employeeId));
    await db.$transaction(newEmployeeIds.map((employeeId) => {
      const workera = workeraByEmployee.get(employeeId);
      const planilla = planillaByEmployee.get(employeeId);
      return db.calculationComparison.create({ data: {
        calculationId: workera?.calculationIds[0] ?? validPlanillas[0].id,
        planillaCalculationId: planilla?.calculationIds[0] ?? validWorkeras[0]?.id ?? null,
        employeeId, siteId: workera?.calculationIds[0] ? validWorkeras[0].siteId : validPlanillas[0].siteId,
        periodStart, periodEnd, workeraDays: workera?.days ?? 0, planillaDays: planilla?.days ?? 0,
        workeraBonus: workera?.bonus ?? 0, planillaBonus: planilla?.bonus ?? 0,
        difference: (planilla?.bonus ?? 0) - (workera?.bonus ?? 0),
        differenceFlags: workeraSites.join(",") !== planillaSites.join(",") ? ["site-mismatch"] : [],
        sourceCalculationIds: { workera: workera?.calculationIds ?? [], planilla: planilla?.calculationIds ?? [] },
        sourceSiteIds: { workera: workeraSites, planilla: planillaSites }, reviewStatus: "pending",
      } });
    }));
    revalidatePath("/comparisons");
    return { success: `Created ${newEmployeeIds.length} employee-period comparison row(s); skipped ${existingIds.size} existing employee row(s).` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Bulk comparison failed" };
  }
}

export async function recalculateComparisonBatchAction(
  _prev: ComparisonState,
  formData: FormData,
): Promise<ComparisonState> {
  const session = await auth();
  if (!session?.user) return { error: "Not authenticated" };

  const workeraId = formData.get("workeraId") as string;
  const planillaId = formData.get("planillaId") as string;
  if (!workeraId || !planillaId) return { error: "Missing calculation IDs" };

  try {
    // Resolve the referenced calculations to get site + period. Recalculating a
    // calculation creates a NEW bonusCalculation record each time, so the stored
    // IDs may be stale. We re-point to the LATEST calculation for the same
    // site/period/source so the comparison always reflects the most recent
    // calculation values.
    const [wRef, pRef] = await Promise.all([
      db.bonusCalculation.findUnique({ where: { id: workeraId } }),
      db.bonusCalculation.findUnique({ where: { id: planillaId } }),
    ]);
    if (!wRef || !pRef || wRef.source !== "workera" || pRef.source !== "planilla") {
      return { error: "Select one Workera and one Planilla calculation." };
    }
    if (
      wRef.periodStart.getTime() !== pRef.periodStart.getTime() ||
      wRef.periodEnd.getTime() !== pRef.periodEnd.getTime()
    ) {
      return { error: "Calculations must use the same period." };
    }

    const latestWorkera = await db.bonusCalculation.findFirst({
      where: {
        siteId: wRef.siteId,
        source: "workera",
        periodStart: wRef.periodStart,
        periodEnd: wRef.periodEnd,
      },
      orderBy: { createdAt: "desc" },
    });
    const latestPlanilla = await db.bonusCalculation.findFirst({
      where: {
        siteId: pRef.siteId,
        source: "planilla",
        periodStart: pRef.periodStart,
        periodEnd: pRef.periodEnd,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!latestWorkera || !latestPlanilla) {
      return { error: "Could not resolve latest calculations for this batch." };
    }

    const workeraIdFinal = latestWorkera.id;
    const planillaIdFinal = latestPlanilla.id;

    // Delete existing comparison rows for this batch (by old IDs)
    await db.calculationComparison.deleteMany({
      where: { calculationId: workeraId, planillaCalculationId: planillaId },
    });

    const workeraLines = await db.bonusCalculationLine.findMany({
      where: { calculationId: workeraIdFinal },
    });
    const planillaLines = await db.bonusCalculationLine.findMany({
      where: { calculationId: planillaIdFinal },
    });
    const workeraByEmployee = new Map(
      workeraLines.map((line) => [line.employeeId, line]),
    );
    const planillaByEmployee = new Map(
      planillaLines.map((line) => [line.employeeId, line]),
    );
    const employeeIds = [
      ...new Set([...workeraByEmployee.keys(), ...planillaByEmployee.keys()]),
    ];

    await db.$transaction(
      employeeIds.map((employeeId) => {
        const workeraLine = workeraByEmployee.get(employeeId);
        const planillaLine = planillaByEmployee.get(employeeId);
        return db.calculationComparison.create({
          data: {
            calculationId: workeraIdFinal,
            planillaCalculationId: planillaIdFinal,
            employeeId,
            siteId: latestWorkera.siteId,
            periodStart: latestWorkera.periodStart,
            periodEnd: latestWorkera.periodEnd,
            workeraDays: workeraLine?.daysWorked ?? 0,
            planillaDays: planillaLine?.daysWorked ?? 0,
            workeraBonus: workeraLine?.calculatedBonus ?? 0,
            planillaBonus: planillaLine?.calculatedBonus ?? 0,
            difference:
              (planillaLine?.calculatedBonus ?? 0) -
              (workeraLine?.calculatedBonus ?? 0),
            differenceFlags:
              latestWorkera.siteId !== latestPlanilla.siteId
                ? ["site-mismatch"]
                : [],
            reviewStatus: "pending",
          },
        });
      }),
    );

    revalidatePath("/comparisons");
    return {
      success: `Recalculated comparison batch: ${employeeIds.length} employee row(s).`,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Recalculate comparison failed",
    };
  }
}

export async function bulkRecalculateComparisonsAction(
  _prev: ComparisonState,
  formData: FormData,
): Promise<ComparisonState> {
  const session = await auth();
  if (!session?.user) return { error: "Not authenticated" };

  const batchKeys = formData.getAll("batchKey") as string[];
  if (batchKeys.length === 0) return { error: "No batches selected" };

  try {
    let totalEmployees = 0;
    for (const key of batchKeys) {
      const [workeraId, planillaId] = key.split(":");
      if (!workeraId || !planillaId) continue;

      const [wRef, pRef] = await Promise.all([
        db.bonusCalculation.findUnique({ where: { id: workeraId } }),
        db.bonusCalculation.findUnique({ where: { id: planillaId } }),
      ]);
      if (!wRef || !pRef || wRef.source !== "workera" || pRef.source !== "planilla") continue;

      const latestWorkera = await db.bonusCalculation.findFirst({
        where: {
          siteId: wRef.siteId,
          source: "workera",
          periodStart: wRef.periodStart,
          periodEnd: wRef.periodEnd,
        },
        orderBy: { createdAt: "desc" },
      });
      const latestPlanilla = await db.bonusCalculation.findFirst({
        where: {
          siteId: pRef.siteId,
          source: "planilla",
          periodStart: pRef.periodStart,
          periodEnd: pRef.periodEnd,
        },
        orderBy: { createdAt: "desc" },
      });

      if (!latestWorkera || !latestPlanilla) continue;

      const workeraIdFinal = latestWorkera.id;
      const planillaIdFinal = latestPlanilla.id;

      await db.calculationComparison.deleteMany({
        where: { calculationId: workeraId, planillaCalculationId: planillaId },
      });

      const workeraLines = await db.bonusCalculationLine.findMany({
        where: { calculationId: workeraIdFinal },
      });
      const planillaLines = await db.bonusCalculationLine.findMany({
        where: { calculationId: planillaIdFinal },
      });
      const workeraByEmployee = new Map(
        workeraLines.map((line) => [line.employeeId, line]),
      );
      const planillaByEmployee = new Map(
        planillaLines.map((line) => [line.employeeId, line]),
      );
      const employeeIds = [
        ...new Set([...workeraByEmployee.keys(), ...planillaByEmployee.keys()]),
      ];
      totalEmployees += employeeIds.length;

      await db.$transaction(
        employeeIds.map((employeeId) => {
          const workeraLine = workeraByEmployee.get(employeeId);
          const planillaLine = planillaByEmployee.get(employeeId);
          return db.calculationComparison.create({
            data: {
              calculationId: workeraIdFinal,
              planillaCalculationId: planillaIdFinal,
              employeeId,
              siteId: latestWorkera.siteId,
              periodStart: latestWorkera.periodStart,
              periodEnd: latestWorkera.periodEnd,
              workeraDays: workeraLine?.daysWorked ?? 0,
              planillaDays: planillaLine?.daysWorked ?? 0,
              workeraBonus: workeraLine?.calculatedBonus ?? 0,
              planillaBonus: planillaLine?.calculatedBonus ?? 0,
              difference:
                (planillaLine?.calculatedBonus ?? 0) -
                (workeraLine?.calculatedBonus ?? 0),
              differenceFlags:
                latestWorkera.siteId !== latestPlanilla.siteId
                  ? ["site-mismatch"]
                  : [],
              reviewStatus: "pending",
            },
          });
        }),
      );
    }

    revalidatePath("/comparisons");
    return {
      success: `Recalculated ${batchKeys.length} batch(es): ${totalEmployees} employee row(s).`,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Bulk recalculate comparisons failed",
    };
  }
}

export async function deleteComparisonBatch(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated");

  const parsed = deleteBatchSchema.safeParse({
    workeraId: formData.get("workeraId"),
    planillaId: formData.get("planillaId"),
  });
  if (!parsed.success) throw new Error("Invalid comparison batch.");

  const { count } = await db.calculationComparison.deleteMany({
    where: {
      calculationId: parsed.data.workeraId,
      planillaCalculationId: parsed.data.planillaId,
    },
  });
  if (count === 0) throw new Error("Comparison batch not found.");

  revalidatePath("/comparisons");
  redirect("/comparisons?deleted=1");
}

