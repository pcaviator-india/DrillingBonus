import { db } from "@/lib/db";
import { normalizeRut, normalizeText } from "@/lib/excel/normalize";

export type EmployeeProjectAuditStatus = "correct" | "wrong" | "missing" | "duplicate" | "conflict" | "unresolved";
export type EmployeeProjectAuditRow = {
  employeeId: string; employeeName: string; rut: string | null; legacySite: string | null;
  planillaSites: string[]; uploadSites: string[]; crewSites: string[]; approvedSites: string[]; calculatedSites: string[];
  planillaRows: number; status: EmployeeProjectAuditStatus; recommendation: string;
};

export async function auditEmployeeProjects(from: string, to: string): Promise<EmployeeProjectAuditRow[]> {
  const start = new Date(`${from}T00:00:00Z`); const end = new Date(`${to}T23:59:59Z`);
  const [employees, aliases, uploads, entries, assignments, projectAssignments, calculations] = await Promise.all([
    db.employee.findMany({ include: { site: true }, orderBy: { fullName: "asc" } }),
    db.siteAlias.findMany({ select: { normalized: true, siteId: true } }),
    db.excelUpload.findMany({ select: { id: true, siteId: true } }),
    db.dailyCrewEntry.findMany({ where: { date: { gte: start, lte: end } }, select: { rutNormalized: true, projectName: true, uploadId: true } }),
    db.crewAssignment.findMany({ where: { date: { gte: start, lte: end } }, include: { rig: { include: { site: true } } } }),
    db.employeeProjectAssignment.findMany({ where: { status: "approved", startDate: { lte: end }, OR: [{ endDate: null }, { endDate: { gte: start } }] }, include: { site: true } }),
    db.bonusCalculation.findMany({ where: { periodStart: { lte: end }, periodEnd: { gte: start } }, include: { site: true, lines: { include: { employee: true } } } }),
  ]);
  const byRut = new Map(employees.filter((e) => e.rut).map((e) => [normalizeRut(e.rut!).toUpperCase(), e]));
  const siteByAlias = new Map(aliases.map((a) => [a.normalized, a.siteId]));
  const siteByUpload = new Map(uploads.map((u) => [u.id, u.siteId]));
  const siteIds = new Map(await db.site.findMany({ select: { id: true, name: true } }).then((v) => v.map((s) => [s.id, s.name] as const)));
  const sitesById = siteIds;
  const rows = new Map<string, EmployeeProjectAuditRow>();
  const ensure = (employee: (typeof employees)[number]) => rows.get(employee.id) ?? { employeeId: employee.id, employeeName: employee.fullName, rut: employee.rut, legacySite: employee.site?.name ?? null, planillaSites: [], uploadSites: [], crewSites: [], approvedSites: [], calculatedSites: [], planillaRows: 0, status: "correct", recommendation: "" };
  for (const e of entries) {
    const employee = byRut.get(normalizeRut(e.rutNormalized).toUpperCase()); if (!employee) continue;
    const row = ensure(employee); rows.set(employee.id, row); row.planillaRows++;
    const siteId = e.projectName ? siteByAlias.get(normalizeText(e.projectName)) : null;
    const resolved = siteId ?? (e.uploadId ? siteByUpload.get(e.uploadId) : null);
    if (resolved) { const site = sitesById.get(resolved); if (site && !row.planillaSites.includes(site)) row.planillaSites.push(site); }
  }
  for (const a of assignments) { const employee = employees.find((e) => e.id === a.employeeId); if (!employee) continue; const row = ensure(employee); rows.set(employee.id, row); const site = a.rig.site?.name; if (site && !row.crewSites.includes(site)) row.crewSites.push(site); }
  for (const a of projectAssignments) { const employee = employees.find((e) => e.id === a.employeeId); if (!employee) continue; const row = ensure(employee); rows.set(employee.id, row); if (!row.approvedSites.includes(a.site.name)) row.approvedSites.push(a.site.name); }
  for (const c of calculations) for (const l of c.lines) { const employee = employees.find((e) => e.id === l.employeeId); if (!employee) continue; const row = ensure(employee); rows.set(employee.id, row); if (!row.calculatedSites.includes(c.site.name)) row.calculatedSites.push(c.site.name); }
  for (const row of rows.values()) {
    const expected = row.planillaSites.length > 0 ? row.planillaSites : row.approvedSites;
    const actual = row.calculatedSites;
    if (expected.length > 1 || row.planillaSites.some((s) => row.approvedSites.length > 0 && !row.approvedSites.includes(s))) row.status = "conflict";
    else if (actual.length === 0 && expected.length > 0) row.status = "missing";
    else if (actual.length > 1) row.status = "duplicate";
    else if (expected.length === 1 && actual.some((s) => s !== expected[0])) row.status = "wrong";
    else row.status = "correct";
    row.recommendation = row.status === "correct" ? "No action" : row.status === "conflict" ? "Review project evidence" : "Re-run correct project calculation and invalidate old result";
  }
  return [...rows.values()].sort((a, b) => a.status.localeCompare(b.status) || a.employeeName.localeCompare(b.employeeName));
}
