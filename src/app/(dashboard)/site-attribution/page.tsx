import { format } from "date-fns";
import { db } from "@/lib/db";
import { formatDateUtc } from "@/lib/datetime";
import { attributeToSite } from "@/lib/geo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { AttributionTable, type AttributionRow } from "./attribution-table";
import { AutoApproveButton } from "./auto-approve-button";

export default async function SiteAttributionPage() {
  // All sites: used for the manual review's site picker.
  const allSites = await db.site.findMany({ orderBy: { name: "asc" } });

  const sites = await db.site.findMany({
    where: { latitude: { not: null }, longitude: { not: null } },
  });
  const siteGeo = sites.map((s) => ({
    id: s.id,
    name: s.name,
    latitude: s.latitude!,
    longitude: s.longitude!,
    gpsRadiusKm: s.gpsRadiusKm,
  }));

  const session = await auth();
  const canReview =
    session?.user.role === "admin" || session?.user.role === "supervisor";
  const siteOptions = allSites.map((s) => ({ id: s.id, name: s.name }));

  // Pull recent attendance marks that carry coordinates
  const marks = await db.attendanceRecord.findMany({
    where: {
      inCoordinates: { not: null },
      OR: [{ inIsMobile: true }, { inIsMobile: null }],
    },
    include: {
      employee: { include: { site: true } },
      siteAttributionSite: true,
      siteAttributionReviewer: true,
    },
    orderBy: { date: "desc" },
    take: 500,
  });

  const rows = marks.map((m) => {
    const attribution = attributeToSite(m.inCoordinates ?? null, siteGeo);
    return { rec: m, attribution };
  });

  const tableRows: AttributionRow[] = rows.map(({ rec, attribution }) => {
    const a = attribution.point;
    const matched = attribution.withinRadius && attribution.site;
    const reviewStatus = (rec.siteAttributionStatus ?? "pending") as AttributionRow["reviewStatus"];
    const approvedSiteName = rec.siteAttributionSite?.name ?? null;
    const nearestSiteName = attribution.site?.name ?? null;
    return {
      id: rec.id,
      date: formatDateUtc(rec.date),
      employeeName: rec.employee.fullName,
      assignedSite: rec.employee.site?.name ?? null,
      device: rec.inDevice ?? null,
      coordinates: rec.inCoordinates ?? null,
      parsed: a ? `${a.latitude.toFixed(4)}, ${a.longitude.toFixed(4)}` : null,
      effectiveSiteName:
        reviewStatus === "approved" && approvedSiteName ? approvedSiteName : nearestSiteName,
      approvedSiteName,
      nearestSiteName,
      distanceKm: attribution.distanceKm !== null ? `${attribution.distanceKm} km` : null,
      verdict: matched ? "matched" : attribution.site ? "outOfRange" : "noCoords",
      reviewStatus,
      note: rec.siteAttributionNote ?? null,
      reviewerName: rec.siteAttributionReviewer?.name ?? null,
      approvedSiteId: rec.siteAttributionSiteId ?? null,
      autoSiteId: attribution.site?.id ?? null,
    };
  });

  const reviewStatuses = ["pending", "approved", "rejected"] as const;
  const summary = Object.fromEntries(
    reviewStatuses.map((s) => [
      s,
      rows.filter((r) => (r.rec.siteAttributionStatus ?? "pending") === s).length,
    ]),
  ) as Record<(typeof reviewStatuses)[number], number>;

  const attributed = rows.filter((r) => r.attribution.withinRadius);
  const outOfRange = rows.filter((r) => r.attribution.site && !r.attribution.withinRadius);
  const noCoord = rows.filter((r) => !r.attribution.point);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Site attribution (GPS)</h1>
          <p className="text-sm text-muted-foreground">
            Where each mobile attendance mark occurred, based on the per-site GPS geofences.
            Approve, reject, or leave each attribution pending. A rejected mark can always be
            re-approved once the employee provides proof. Marks whose GPS lands inside a
            site&apos;s radius are auto-approved.
          </p>
        </div>
        {canReview ? <AutoApproveButton disabled={siteGeo.length === 0} /> : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Matched", value: attributed.length, tone: "", hint: "Nearest site within radius" },
          { label: "Out of range", value: outOfRange.length, tone: "", hint: "Has nearest site but beyond radius" },
          { label: "No coords", value: noCoord.length, tone: "", hint: "Biometric / clock / missing GPS" },
          { label: "Approved", value: summary.approved, tone: "text-green-600", hint: "Manual review accepted" },
          { label: "Rejected", value: summary.rejected, tone: "text-red-600", hint: "Manual review declined" },
          { label: "Pending", value: summary.pending, tone: "", hint: "Awaiting review" },
        ].map((s) => (
          <Card key={s.label} className="py-2" title={s.hint}>
            <CardContent className="flex items-baseline justify-between gap-2 px-3">
              <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
              <span className={`text-lg font-bold ${s.tone}`}>{s.value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Attribution detail</CardTitle>
          <CardDescription>
            {siteGeo.length === 0
              ? "No sites have GPS configured yet — add coordinates in Sites → Settings to enable attribution."
              : `${siteGeo.length} site(s) with GPS.`}
            {!canReview ? " Reviews require an admin or supervisor role." : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AttributionTable rows={tableRows} sites={siteOptions} canReview={canReview} />
        </CardContent>
      </Card>
    </div>
  );
}
