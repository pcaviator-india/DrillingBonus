import { db } from "@/lib/db";
import { normalizeRut } from "@/lib/excel/normalize";
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
import { EmployeeFilters } from "./employee-filters";

type SearchParams = {
  name?: string;
  rut?: string;
  role?: string;
  site?: string;
  status?: string;
};

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const nameParts = (params.name ?? "").trim().split(/\s+/).filter(Boolean);
  const where = {
    ...(nameParts.length
      ? { AND: nameParts.map((part) => ({ fullName: { contains: part, mode: "insensitive" as const } })) }
      : {}),
    ...(params.rut ? { rut: { contains: params.rut, mode: "insensitive" as const } } : {}),
    ...(params.role ? { defaultRole: { name: params.role } } : {}),
    ...(params.site ? { site: { name: params.site } } : {}),
    ...(params.status === "active" ? { isActive: true } : {}),
    ...(params.status === "inactive" ? { isActive: false } : {}),
  };

  const [employees, roles, sites, planillaRows, siteAliases] = await Promise.all([
    db.employee.findMany({ where, orderBy: { fullName: "asc" }, include: { defaultRole: true, site: true } }),
    db.role.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
    db.site.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.dailyCrewEntry.findMany({
      where: { date: { gte: new Date(Date.UTC(2026, 0, 1)) } },
      select: { rutNormalized: true, projectName: true, upload: { select: { siteId: true } } },
    }),
    db.siteAlias.findMany({ select: { normalized: true, siteId: true } }),
  ]);
  const siteNameById = new Map(sites.map((site) => [site.id, site.name]));
  const siteNameByProject = new Map<string, string>(sites.map((site) => [site.name, site.name]));
  const planillaSiteNames = new Map<string, Set<string>>();
  for (const alias of siteAliases) {
    siteNameByProject.set(alias.normalized, siteNameById.get(alias.siteId) ?? alias.normalized);
  }
  for (const row of planillaRows) {
    const site = siteNameByProject.get(row.projectName ?? "") ?? (row.upload.siteId ? siteNameById.get(row.upload.siteId) : undefined);
    if (!site) continue;
    const set = planillaSiteNames.get(row.rutNormalized) ?? new Set<string>();
    set.add(site);
    planillaSiteNames.set(row.rutNormalized, set);
  }
  const planillaSitesByEmployee = new Map(employees.map((employee) => [employee.id, employee.rut ? planillaSiteNames.get(normalizeRut(employee.rut)) : undefined]));
  const normalizedPlanillaSiteName = (value: string) => value;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Employees</h1>
        <p className="text-sm text-muted-foreground">
          Synced from Workera. {employees.length} employee(s) match the current filters.
        </p>
      </div>

      <EmployeeFilters
        roles={roles.map((role) => role.name)}
        sites={sites.map((site) => site.name)}
        currentParams={params}
      />

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>RUT</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Workera site</TableHead>
                <TableHead>Planilla site(s)</TableHead>
                <TableHead>Workera ID</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No employees yet. Run a sync from the Sync page.
                  </TableCell>
                </TableRow>
              ) : (
                employees.map((emp) => (
                  <TableRow key={emp.id}>
                    <TableCell className="font-medium">{emp.fullName}</TableCell>
                    <TableCell>{emp.rut ?? "—"}</TableCell>
                    <TableCell>{emp.defaultRole?.name ?? "—"}</TableCell>
                    <TableCell>{emp.site?.name ?? "—"}</TableCell>
                    <TableCell>
                      {planillaSitesByEmployee.get(emp.id)?.size
                        ? [...planillaSitesByEmployee.get(emp.id)!].map(normalizedPlanillaSiteName).join(", ")
                        : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{emp.workeraId ?? "—"}</TableCell>
                    <TableCell>
                      {emp.isActive ? (
                        <Badge variant="secondary">Active</Badge>
                      ) : (
                        <Badge variant="outline">Inactive</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
