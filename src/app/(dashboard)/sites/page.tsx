import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreateSiteForm } from "./create-site-form";
import { SiteSettingsForm } from "./site-settings-form";
import { SiteRigsForm } from "./site-rigs-form";

export default async function SitesPage() {
  const [sites, allRigs] = await Promise.all([
    db.site.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { employees: true, bonusRuleSets: true } },
        rigs: { orderBy: { name: "asc" }, include: { rigAliases: true } },
        siteRigs: true,
      },
    }),
    db.rig.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, code: true, siteId: true, rigType: true } }),
  ]);

  const effByRig = new Map(sites.flatMap((s) => s.siteRigs.map((sr) => [sr.rigId, sr.effectiveType] as const)));

  // Rigs currently not attached to any site (available to add)
  const unassignedRigs = allRigs.filter((r) => !r.siteId);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Sites</h1>
        <p className="text-sm text-muted-foreground">
          Each site has its own configurable bonus rules and GPS geofence for attendance attribution.
          Manage which rigs/machines belong to each site here.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Site list</CardTitle>
          <CardDescription>{sites.length} site(s) registered</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>GPS (lat, lon)</TableHead>
                <TableHead>Radius</TableHead>
                <TableHead>Employees</TableHead>
                <TableHead>Rule Sets</TableHead>
                <TableHead>Rigs</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sites.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    No sites yet. Create one below.
                  </TableCell>
                </TableRow>
              ) : (
                sites.map((site) => (
                  <TableRow key={site.id}>
                    <TableCell className="font-medium">{site.name}</TableCell>
                    <TableCell>{site.code ?? "—"}</TableCell>
                    <TableCell className="max-w-48 truncate">{site.address ?? "—"}</TableCell>
                    <TableCell>
                      {site.latitude !== null && site.longitude !== null ? (
                        <span className="font-mono text-xs">
                          {site.latitude.toFixed(4)}, {site.longitude.toFixed(4)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {site.gpsRadiusKm !== null ? `${site.gpsRadiusKm} km` : "—"}
                    </TableCell>
                    <TableCell>{site._count.employees}</TableCell>
                    <TableCell>{site._count.bonusRuleSets}</TableCell>
                    <TableCell>
                      <SiteRigsForm
                        siteId={site.id}
                        assignedRigs={site.rigs.map((r) => ({
                          id: r.id,
                          name: r.name,
                          code: r.code,
                          rigType: r.rigType,
                          effectiveType: site.siteRigs.find((sr) => sr.rigId === r.id)?.effectiveType ?? null,
                          aliases: r.rigAliases.map((a) => a.displayName),
                        }))}
                        unassignedRigs={unassignedRigs.map((r) => ({
                          id: r.id,
                          name: r.name,
                          code: r.code,
                          rigType: r.rigType,
                          effectiveType: effByRig.get(r.id) ?? null,
                        }))}
                      />
                    </TableCell>
                    <TableCell>
                      {site.isActive ? (
                        <Badge variant="secondary">Active</Badge>
                      ) : (
                        <Badge variant="outline">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <SiteSettingsForm site={site} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CreateSiteForm />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Clocks &amp; Devices</CardTitle>
          <CardDescription>
            Manage the biometric and mobile clocks mapped to sites. Set which site has
            access to each device. (You are viewing this page — see <a
              href="/sites/clocks"
              className="text-primary underline underline-offset-2"
            >/sites/clocks</a> for the full device inventory.)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <svg
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.85-9.476a1 1 0 00-1.704-.648l-3.526 4.13A1 1 0 007.546 11h5.864a1 1 0 00.91-.524l3.526-4.13a1 1 0 00-1.704-.648zM10 12a2 2 0 100-4 2 2 0 000 4z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-xs">
              No devices are mapped to a site yet. Use the Clocks page to assign and move devices.
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
