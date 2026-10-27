import { db } from "@/lib/db";
import { autoApprovalMatches, type SiteGeo } from "@/lib/geo";

/**
 * Promote pending attendance marks to `approved` when their GPS falls within
 * a site's geofence radius (auto-approval).
 *
 * Only `pending` marks are touched, so a manual `approved` or `rejected`
 * decision is never silently overridden. Only sites with `autoApproveGps`
 * enabled participate. `reviewerId` records who/what ran the approval
 * (null = fully automated, e.g. during sync).
 */
export async function autoApprovePending(
  reviewerId: string | null,
): Promise<{ approved: number }> {
  const [pending, sites] = await Promise.all([
    db.attendanceRecord.findMany({
      where: { siteAttributionStatus: "pending", inCoordinates: { not: null } },
      select: { id: true, inCoordinates: true },
    }),
    db.site.findMany({
      where: {
        autoApproveGps: true,
        latitude: { not: null },
        longitude: { not: null },
      },
    }),
  ]);

  const siteGeo: SiteGeo[] = sites.map((s) => ({
    id: s.id,
    name: s.name,
    latitude: s.latitude!,
    longitude: s.longitude!,
    gpsRadiusKm: s.gpsRadiusKm,
  }));

  const matches = autoApprovalMatches(pending, siteGeo);
  if (matches.length === 0) return { approved: 0 };

  const now = new Date();
  await Promise.all(
    matches.map((m) =>
      db.attendanceRecord.update({
        where: { id: m.recordId },
        data: {
          siteAttributionStatus: "approved",
          siteAttributionSiteId: m.site.id,
          siteAttributionReviewedById: reviewerId,
          siteAttributionReviewedAt: now,
          siteAttributionNote: `Auto-approved within ${m.distanceKm} km of ${m.site.name}`,
        },
      }),
    ),
  );

  return { approved: matches.length };
}