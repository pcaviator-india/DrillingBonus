"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { runCalculation } from "@/lib/calculations/run";
import { createJob, runJobInBackground } from "@/lib/jobs/service";
import { normalizeText, normalizeRut, rigKeyOf } from "@/lib/excel/normalize";

export type RunCalculationState = { error?: string; success?: string };

const schema = z.object({
  siteId: z.string().min(1),
  ruleSetId: z.string().min(1),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: z.enum(["workera", "planilla"]),
});

const backfillSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * Backfills CrewAssignment records from existing DailyCrewEntry data.
 * This bridges the gap for uploads processed before the crew-assignment
 * creation logic was added to the Excel processing pipeline.
 */
export async function rebuildCrewAssignmentsAction(
  _prev: RunCalculationState,
  formData: FormData,
): Promise<RunCalculationState> {
  const session = await auth();
  if (!session?.user) return { error: "Not authenticated" };

  const parsed = backfillSchema.safeParse({
    from: formData.get("from"),
    to: formData.get("to"),
  });
  if (!parsed.success) {
    return { error: "Invalid date range" };
  }
  const { from, to } = parsed.data;

  try {
    const start = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);

    // Background job (same pattern as uploads/calculation): return immediately,
    // report through the bottom bubble.
    const job = await createJob({ type: "crew_rebuild", label: `Crew assignments ${from} → ${to}`, source: "calculation" });

    runJobInBackground({
      jobId: job.id,
      run: async () => {
        const result = await rebuildCrewAssignments(start, end);
        return { message: result, revalidatePaths: ["/calculations"] };
      },
    });

    revalidatePath("/calculations");
    return {
      success: `Crew assignment rebuild started in the background — watch the bubble at the bottom for the result.`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Rebuild failed" };
  }
}

/** Rebuilds CrewAssignment rows from DailyCrewEntry data in a date range. */
async function rebuildCrewAssignments(
  start: Date,
  end: Date,
): Promise<string> {
    // Load employees, rig aliases, and position aliases for matching + role resolution
    const [employees, rigAliases, entries, positionAliases, mainPositions] = await Promise.all([
      db.employee.findMany({ select: { id: true, rut: true } }),
      db.rigAlias.findMany({ select: { normalized: true, rigId: true } }),
      db.dailyCrewEntry.findMany({
        where: { date: { gte: start, lte: end } },
      }),
      db.positionAlias.findMany({ select: { normalized: true, mainPositionId: true } }),
      db.mainPosition.findMany({ select: { id: true, name: true } }),
    ]);

    const employeeByRut = new Map(
      employees.filter((e) => e.rut).map((e) => [normalizeRut(e.rut as string), e.id]),
    );
    const rigByMachine = new Map(rigAliases.map((a) => [rigKeyOf(a.normalized), a.rigId]));
    const mainPosNameById = new Map(mainPositions.map((m) => [m.id, m.name]));
    const mainPosByCargo = new Map(
      positionAliases
        .filter((a) => a.mainPositionId)
        .map((a) => [a.normalized, mainPosNameById.get(a.mainPositionId!) ?? null]),
    );

    const resolveRole = (cargoNormalized: string): string => {
      if (!cargoNormalized) return "";
      const mainName = mainPosByCargo.get(cargoNormalized);
      return mainName ?? cargoNormalized;
    };

    // Resolve per-upload site for each entry's upload (batch-fetched to avoid N+1),
    // falling back to project-name → site alias inference.
    const uploadIds = [...new Set(entries.map((e) => e.uploadId).filter(Boolean))];
    const uploads = await db.excelUpload.findMany({
      where: { id: { in: uploadIds } },
      select: { id: true, siteId: true },
    });
    const uploadSiteById = new Map(uploads.map((u) => [u.id, u.siteId ?? null]));
    const siteAliases = await db.siteAlias.findMany({ select: { normalized: true, siteId: true } });
    const siteByProject = new Map(siteAliases.map((a) => [a.normalized, a.siteId]));

    let created = 0;
    let skipped = 0;
    for (const entry of entries) {
      const employeeId = employeeByRut.get(entry.rutNormalized);
      const rigId = entry.machine ? rigByMachine.get(rigKeyOf(entry.machine)) : null;
      if (!employeeId || !rigId) {
        skipped++;
        continue;
      }
      const shift = entry.shiftDayNight === "night" ? "night" : "day";
      const roleOnShift = resolveRole(entry.cargoNormalized);
      // Site: upload-declared site first, else project-name alias inference.
      const siteId =
        (uploadSiteById.get(entry.uploadId) ?? null) ??
        (entry.projectName ? siteByProject.get(normalizeText(entry.projectName)) : undefined) ??
        null;
      const existing = await db.crewAssignment.findFirst({
        where: { employeeId, rigId, date: entry.date, shift },
      });
      if (existing) {
        await db.crewAssignment.update({
          where: { id: existing.id },
          data: {
            roleOnShift,
            source: "excel",
            siteId,
            siteEvidence: siteId ? "planilla" : null,
          },
        });
      } else {
        await db.crewAssignment.create({
          data: {
            employeeId,
            rigId,
            date: entry.date,
            shift,
            roleOnShift,
            siteId,
            siteEvidence: siteId ? "planilla" : null,
            source: "excel",
            rawData: { dailyCrewEntryId: entry.id } as object,
          },
        });
      }
      created++;
    }

    return `Crew assignments rebuilt: ${created} created/updated, ${skipped} skipped (unmatched employee or machine).`;
}

export async function runCalculationAction(
  _prev: RunCalculationState,
  formData: FormData,
): Promise<RunCalculationState> {
  const session = await auth();
  if (!session?.user) return { error: "Not authenticated" };

  const parsed = schema.safeParse({
    siteId: formData.get("siteId"),
    ruleSetId: formData.get("ruleSetId"),
    periodStart: formData.get("periodStart"),
    periodEnd: formData.get("periodEnd"),
    source: formData.get("source"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  if (parsed.data.periodEnd < parsed.data.periodStart) {
    return { error: "Period end must be equal to or later than period start." };
  }

  try {
    const site = await db.site.findUnique({ where: { id: parsed.data.siteId } });
    const label = `${site?.name ?? "Site"} — ${parsed.data.periodStart} → ${parsed.data.periodEnd}`;

    // Keep the request light: register a pending job and return immediately,
    // then run the heavy calculation in the background (same pattern as Excel
    // uploads). The bubble at the bottom reports progress and the result.
    const job = await createJob({ type: "calculation", label, source: "calculation" });

    runJobInBackground({
      jobId: job.id,
      run: async () => {
        const result = await runCalculation(
          parsed.data.siteId,
          parsed.data.ruleSetId,
          parsed.data.periodStart,
          parsed.data.periodEnd,
          session.user.id,
          parsed.data.source,
        );
        return {
          message: `Calculation completed: ${result.linesCount} lines, total bonus ${result.totalBonus}.`,
          revalidatePaths: ["/calculations"],
        };
      },
    });

    revalidatePath("/calculations");
    return {
      success: `Calculation for ${label} started in the background — you can start another one right away. Watch the bubble at the bottom for the result.`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Calculation failed" };
  }
}

export type RecalcState = { error?: string; success?: string };

/**
 * Recalculates a single existing calculation by reusing its stored
 * site, rule set, period and source — no re-selection needed.
 */
export async function recalculateCalculationAction(
  _prev: RecalcState,
  formData: FormData,
): Promise<RecalcState> {
  const session = await auth();
  if (!session?.user) return { error: "Not authenticated" };

  const calculationId = formData.get("calculationId") as string;
  if (!calculationId) return { error: "Missing calculation id" };

  try {
    const calculation = await db.bonusCalculation.findUnique({
      where: { id: calculationId },
      include: { site: true, ruleSet: true },
    });
    if (!calculation) return { error: "Calculation not found" };

    const start = calculation.periodStart.toISOString().slice(0, 10);
    const end = calculation.periodEnd.toISOString().slice(0, 10);
    const label = `${calculation.site.name} — ${start} → ${end}`;

    const job = await createJob({
      type: "calculation",
      label: `Recalculate ${label}`,
      source: "calculation",
    });

    runJobInBackground({
      jobId: job.id,
      run: async () => {
        const result = await runCalculation(
          calculation.siteId,
          calculation.ruleSetId,
          start,
          end,
          session.user.id,
          calculation.source as "workera" | "planilla",
          calculationId, // replace existing row instead of creating a new one
        );
        return {
          message: `Recalculation completed: ${result.linesCount} lines, total bonus ${result.totalBonus}.`,
          revalidatePaths: ["/calculations"],
        };
      },
    });

    revalidatePath("/calculations");
    return {
      success: `Recalculation for ${label} started in the background.`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Recalculate failed" };
  }
}

/**
 * Recalculates multiple existing calculations in the background (one job each).
 * Each existing calculation row is updated in place — no duplicate rows are created.
 */
export async function bulkRecalculateAction(
  _prev: RecalcState,
  formData: FormData,
): Promise<RecalcState> {
  const session = await auth();
  if (!session?.user) return { error: "Not authenticated" };

  const calculationIds = formData.getAll("calculationId") as string[];
  if (calculationIds.length === 0) return { error: "No calculations selected" };

  try {
    const calculations = await db.bonusCalculation.findMany({
      where: { id: { in: calculationIds } },
      include: { site: true, ruleSet: true },
    });

    for (const calculation of calculations) {
      const start = calculation.periodStart.toISOString().slice(0, 10);
      const end = calculation.periodEnd.toISOString().slice(0, 10);

      const job = await createJob({
        type: "calculation",
        label: `Recalculate ${calculation.site.name} — ${start} → ${end}`,
        source: "calculation",
      });

      runJobInBackground({
        jobId: job.id,
        run: async () => {
          const result = await runCalculation(
            calculation.siteId,
            calculation.ruleSetId,
            start,
            end,
            session.user.id,
            calculation.source as "workera" | "planilla",
            calculation.id, // replace existing row instead of creating a new one
          );
          return {
            message: `Recalculation completed: ${result.linesCount} lines.`,
            revalidatePaths: ["/calculations"],
          };
        },
      });
    }

    revalidatePath("/calculations");
    return {
      success: `Started recalculation for ${calculations.length} calculation(s).`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Bulk recalculate failed" };
  }
}

export async function getRuleSetsForSiteAction(siteId: string) {
  return db.bonusRuleSet.findMany({
    where: { siteId, isActive: true },
    orderBy: { version: "desc" },
  });
}

export async function reviewComparisonAction(
  comparisonId: string,
  status: "approved" | "rejected",
  note: string,
): Promise<{ error?: string; success?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "Not authenticated" };
  if (session.user.role !== "admin" && session.user.role !== "supervisor" && session.user.role !== "finance") {
    return { error: "You do not have permission to review comparisons" };
  }
  try {
    await db.calculationComparison.update({
      where: { id: comparisonId },
      data: { reviewStatus: status, reviewNote: note.trim() || null, reviewedById: session.user.id, reviewedAt: new Date() },
    });
    revalidatePath("/calculations");
    return { success: "Comparison reviewed" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Review failed" };
  }
}


export type DeleteCalculationState = { error?: string; deleted?: boolean };

/** Deletes a bonus calculation and its lines. Returns errors instead of throwing. */
export async function deleteCalculationAction(
  calculationId: string,
): Promise<DeleteCalculationState> {
  const session = await auth();
  if (session?.user.role !== "admin") {
    return { error: "Only admins can delete calculations" };
  }
  try {
    await db.bonusCalculationLine.deleteMany({ where: { calculationId } });
    await db.bonusCalculation.delete({ where: { id: calculationId } });
    revalidatePath("/calculations");
    return { deleted: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Delete failed" };
  }
}
