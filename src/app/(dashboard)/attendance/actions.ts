"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export type AttendanceActionState = {
  error?: string;
  message?: string;
};

const correctSchema = z.object({
  id: z.string(),
  timeIn: z.string().optional(),
  timeOut: z.string().optional(),
  shift: z.enum(["day", "night"]).optional(),
  hoursWorked: z.coerce.number().optional(),
  status: z.string().optional(),
  correctionReason: z.string().min(1, "Reason is required"),
});

const reviewSchema = z.object({
  id: z.string(),
  reviewStatus: z.enum(["approved", "rejected"]),
  reviewNote: z.string().optional(),
});

/**
 * Manually correct an attendance record (forgotten/missing/double punches).
 * Stores original values as audit trail before applying changes.
 * Sets needsReview=false and reviewStatus="pending" after correction.
 */
export async function correctAttendanceRecord(
  _prev: AttendanceActionState,
  formData: FormData,
): Promise<AttendanceActionState> {
  const session = await auth();
  if (!session?.user) return { error: "Not authenticated" };

  const parsed = correctSchema.safeParse({
    id: formData.get("id"),
    timeIn: formData.get("timeIn") ?? undefined,
    timeOut: formData.get("timeOut") ?? undefined,
    shift: formData.get("shift") ?? undefined,
    hoursWorked: formData.get("hoursWorked") ?? undefined,
    status: formData.get("status") ?? undefined,
    correctionReason: formData.get("correctionReason") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { id, timeIn, timeOut, shift, hoursWorked, status, correctionReason } = parsed.data;

  const existing = await db.attendanceRecord.findUnique({ where: { id } });
  if (!existing) return { error: "Attendance record not found" };

  // Store originals as audit trail
  await db.attendanceRecord.update({
    where: { id },
    data: {
      timeIn: timeIn !== undefined ? new Date(timeIn) : existing.timeIn,
      timeOut: timeOut !== undefined ? new Date(timeOut) : existing.timeOut,
      shift: shift ?? existing.shift,
      hoursWorked: hoursWorked !== undefined ? hoursWorked : existing.hoursWorked,
      status: status ?? existing.status,
      corrected: true,
      correctedById: session.user.id,
      correctedAt: new Date(),
      correctionReason,
      originalTimeIn: existing.timeIn,
      originalTimeOut: existing.timeOut,
      originalShift: existing.shift,
      originalHoursWorked: existing.hoursWorked,
      needsReview: false,
      reviewStatus: "pending",
    },
  });

  revalidatePath("/attendance");
  return { message: "Attendance record corrected." };
}

/**
 * Approve or reject a needs-review attendance record.
 */
export async function reviewAttendanceRecord(
  _prev: AttendanceActionState,
  formData: FormData,
): Promise<AttendanceActionState> {
  const session = await auth();
  if (!session?.user) return { error: "Not authenticated" };

  const parsed = reviewSchema.safeParse({
    id: formData.get("id"),
    reviewStatus: formData.get("reviewStatus"),
    reviewNote: formData.get("reviewNote") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { id, reviewStatus, reviewNote } = parsed.data;

  await db.attendanceRecord.update({
    where: { id },
    data: {
      reviewStatus,
      reviewedById: session.user.id,
      reviewedAt: new Date(),
      reviewNote,
      needsReview: false,
    },
  });

  revalidatePath("/attendance");
  return { message: `Attendance record ${reviewStatus}.` };
}

/**
 * Bulk flag records for review (e.g. all missing OUT in a period).
 */
export async function bulkFlagReview(
  _prev: AttendanceActionState,
  formData: FormData,
): Promise<AttendanceActionState> {
  const session = await auth();
  if (!session?.user) return { error: "Not authenticated" };

  const ids = (formData.get("ids") as string ?? "").split(",").filter(Boolean);
  if (ids.length === 0) return { error: "No records selected" };

  await db.attendanceRecord.updateMany({
    where: { id: { in: ids } },
    data: { needsReview: true, reviewStatus: "pending" },
  });

  revalidatePath("/attendance");
  return { message: `Flagged ${ids.length} record(s) for review.` };
}