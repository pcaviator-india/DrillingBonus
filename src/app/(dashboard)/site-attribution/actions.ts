"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { attributeToSite, type SiteGeo } from "@/lib/geo";
import { autoApprovePending } from "@/lib/attribution/auto-approve";

const ATTRIBUTION_STATUSES = ["pending", "approved", "rejected"] as const;

const setStatusSchema = z.object({
  attendanceRecordId: z.string().min(1),
  // Only "approved" and "rejected" are set here; "pending" clears the review.
  status: z.enum(ATTRIBUTION_STATUSES),
  // Optional explicit site to approve. When omitted on "approved", falls back
  // to the auto-attributed nearest site.
  siteId: z.string().min(1).optional().or(z.literal("")),
  note: z.string().max(500).optional().or(z.literal("")),
});

export type SetAttributionState = { error?: string };

/**
 * Set the manual review status for a single attendance mark's site attribution.
 * - approved -> stores an approved site (explicit, or nearest by GPS)
 * - rejected -> marks rejected (approved site cleared)
 * - pending  -> resets back to pending
 *
 * Any status can transition to any other (e.g. rejected -> approved once the
 * employee provides proof), so this action has no transition restrictions.
 */
export async function setAttributionStatusAction(
  _prev: SetAttributionState,
  formData: FormData,
): Promise<SetAttributionState> {
  const session = await auth();
  if (!session?.user) {
    return { error: "You must be signed in" };
  }
  if (session.user.role !== "admin" && session.user.role !== "supervisor") {
    return { error: "Only admins and supervisors can review attributions" };
  }

  const parsed = setStatusSchema.safeParse({
    attendanceRecordId: formData.get("attendanceRecordId"),
    status: formData.get("status") || "",
    siteId: formData.get("siteId") ?? "",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { attendanceRecordId, status, note } = parsed.data;
  const requestedSiteId = (parsed.data.siteId as string | undefined)?.trim() || null;

  const record = await db.attendanceRecord.findUnique({
    where: { id: attendanceRecordId },
    select: { id: true, inCoordinates: true },
  });
  if (!record) {
    return { error: "Attendance record not found" };
  }

  try {
    let approvedSiteId: string | null = null;

    if (status === "approved") {
      // Resolve the approved site: use the reviewer's explicit pick, otherwise
      // fall back to the nearest site that auto-matched the GPS coordinates.
      if (requestedSiteId) {
        const site = await db.site.findUnique({ where: { id: requestedSiteId } });
        if (!site) {
          return { error: "Selected site does not exist" };
        }
        approvedSiteId = requestedSiteId;
      } else {
        const geo = await allSiteGeo();
        const attribution = attributeToSite(record.inCoordinates ?? null, geo);
        approvedSiteId = attribution.site?.id ?? null;
        if (!approvedSiteId) {
          return { error: "Cannot approve: mark has no coordinates and no site was selected" };
        }
      }
    }

    await db.attendanceRecord.update({
      where: { id: attendanceRecordId },
      data: {
        siteAttributionStatus: status,
        siteAttributionSiteId: approvedSiteId,
        siteAttributionNote: note || null,
        siteAttributionReviewedById: session.user.id,
        siteAttributionReviewedAt: new Date(),
      },
    });
  } catch (e) {
    console.error("Failed to set attribution status", e);
    return { error: "Failed to update attribution status" };
  }

  revalidatePath("/site-attribution");
  return {};
}

async function allSiteGeo(): Promise<SiteGeo[]> {
  const sites = await db.site.findMany({
    where: { latitude: { not: null }, longitude: { not: null } },
    select: { id: true, name: true, latitude: true, longitude: true, gpsRadiusKm: true },
  });
  return sites.map((s) => ({
    id: s.id,
    name: s.name,
    latitude: s.latitude!,
    longitude: s.longitude!,
    gpsRadiusKm: s.gpsRadiusKm,
  }));
}

export type AutoApproveState = { error?: string; approved?: number };

/**
 * Bulk auto-approve every currently-pending mark that falls within its nearest
 * site's geofence radius. Manual approved/rejected decisions are left intact.
 */
export async function runAutoApproveAction(): Promise<AutoApproveState> {
  const session = await auth();
  if (!session?.user) {
    return { error: "You must be signed in" };
  }
  if (session.user.role !== "admin" && session.user.role !== "supervisor") {
    return { error: "Only admins and supervisors can auto-approve" };
  }

  let approved = 0;
  try {
    ({ approved } = await autoApprovePending(session.user.id));
  } catch (e) {
    console.error("Failed to auto-approve", e);
    return { error: "Failed to run auto-approval" };
  }

  revalidatePath("/site-attribution");
  return { approved };
}

export type BulkSetResult = { error?: string; changed: number; skipped: number };

/**
 * Apply a review status to many marks at once (bulk approve / reject / pending).
 * - approved: each mark is approved to its nearest auto-attributed site; a mark
 *   with no resolvable site is skipped (cannot approve without a site).
 * - rejected / pending: approved site is cleared.
 * Existing per-mark notes are preserved.
 */
export async function bulkSetAttributionStatusAction(input: {
  recordIds: string[];
  status: "approved" | "rejected" | "pending";
}): Promise<BulkSetResult> {
  const session = await auth();
  if (!session?.user) {
    return { error: "You must be signed in", changed: 0, skipped: 0 };
  }
  if (session.user.role !== "admin" && session.user.role !== "supervisor") {
    return { error: "Only admins and supervisors can review attributions", changed: 0, skipped: 0 };
  }

  const ids = [...new Set(input.recordIds)];
  if (ids.length === 0) return { changed: 0, skipped: 0 };

  const records = await db.attendanceRecord.findMany({
    where: { id: { in: ids } },
    select: { id: true, inCoordinates: true },
  });
  const byId = new Map(records.map((r) => [r.id, r]));
  const geo = await allSiteGeo();
  const now = new Date();

  let changed = 0;
  let skipped = 0;
  const updates: Promise<unknown>[] = [];

  for (const id of ids) {
    const rec = byId.get(id);
    if (!rec) continue;

    let approvedSiteId: string | null = null;
    if (input.status === "approved") {
      const attribution = attributeToSite(rec.inCoordinates ?? null, geo);
      if (!attribution.site) {
        skipped++;
        continue;
      }
      approvedSiteId = attribution.site.id;
    }

    updates.push(
      db.attendanceRecord.update({
        where: { id },
        data: {
          siteAttributionStatus: input.status,
          siteAttributionSiteId: approvedSiteId,
          siteAttributionReviewedById: session.user.id,
          siteAttributionReviewedAt: now,
        },
      }),
    );
    changed++;
  }

  await Promise.all(updates);
  revalidatePath("/site-attribution");
  return { changed, skipped };
}