"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export type TurnBulkState = { error?: string; success?: string };

const bulkSchema = z.object({
  employeeIds: z.array(z.string().min(1)).min(1),
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1),
  turn: z.enum(["A", "B"]),
  siteId: z.string().min(1).optional(),
  note: z.string().max(500).optional(),
});

/** One or more employees, one or more days. From the /turns month grid. */
export async function setEmployeeTurnsAction(
  _prev: TurnBulkState,
  formData: FormData,
): Promise<TurnBulkState> {
  const session = await auth();
  if (session?.user.role !== "admin") {
    return { error: "Only admins can edit turn schedules." };
  }

  const parseIds = (key: string): string[] => {
    const raw = formData.get(key);
    return typeof raw === "string" && raw.trim().length > 0 ? raw.trim().split(",") : [];
  };
  const parsed = bulkSchema.safeParse({
    employeeIds: parseIds("employeeIds"),
    dates: parseIds("dates"),
    turn: formData.get("turn"),
    siteId: formData.get("siteId") || undefined,
    note: formData.get("note") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { employeeIds, dates, turn, siteId, note } = parsed.data;

  try {
    let created = 0;
    let updated = 0;
    // One (employee, day) row; upsert keyed on employeeId+date so re-saving a
    // month just refines existing rows instead of accumulating duplicates.
    for (const employeeId of employeeIds) {
      for (const date of dates) {
        const day = new Date(`${date}T00:00:00Z`);
        const existing = await db.employeeTurnSchedule.findUnique({
          where: { employeeId_date: { employeeId, date: day } },
          select: { turn: true },
        });
        const data = {
          turn,
          siteId: siteId ?? null,
          note: note ?? null,
          setById: session.user.id,
        };
        if (existing) {
          if (existing.turn === turn) continue;
          await db.employeeTurnSchedule.update({
            where: { employeeId_date: { employeeId, date: day } },
            data,
          });
          updated++;
        } else {
          await db.employeeTurnSchedule.create({
            data: { employeeId, date: day, ...data },
          });
          created++;
        }
      }
    }

    const scope = siteId ? `/turns?siteId=${siteId}` : "/turns";
    revalidatePath(scope);
    return {
      success: `Turn ${turn} set: ${created} created, ${updated} changed across ${employeeIds.length} employee(s) × ${dates.length} day(s).`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Save failed" };
  }
}

export type TurnClearState = { error?: string; success?: string };

const clearSchema = z.object({
  employeeIds: z.array(z.string().min(1)).min(1),
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1),
  siteId: z.string().min(1).optional(),
});

/** Remove manual turn rows for the selected employees × days (restore to unspecified). */
export async function clearEmployeeTurnsAction(
  _prev: TurnClearState,
  formData: FormData,
): Promise<TurnClearState> {
  const session = await auth();
  if (session?.user.role !== "admin") {
    return { error: "Only admins can edit turn schedules." };
  }

  const parseIds = (key: string): string[] => {
    const raw = formData.get(key);
    return typeof raw === "string" && raw.trim().length > 0 ? raw.trim().split(",") : [];
  };
  const parsed = clearSchema.safeParse({
    employeeIds: parseIds("employeeIds"),
    dates: parseIds("dates"),
    siteId: formData.get("siteId") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { employeeIds, dates, siteId } = parsed.data;

  try {
    const dateObjs = dates.map((d) => new Date(`${d}T00:00:00Z`));
    let deleted = 0;
    for (const employeeId of employeeIds) {
      const res = await db.employeeTurnSchedule.deleteMany({
        where: { employeeId, date: { in: dateObjs } },
      });
      deleted += res.count;
    }

    const scope = siteId ? `/turns?siteId=${siteId}` : "/turns";
    revalidatePath(scope);
    return {
      success: `Cleared ${deleted} turn assignment(s) for ${employeeIds.length} employee(s) × ${dates.length} day(s).`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Clear failed" };
  }
}