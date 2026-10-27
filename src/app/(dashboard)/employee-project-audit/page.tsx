import { auditEmployeeProjects } from "@/lib/employee-project-audit/audit";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default async function EmployeeProjectAuditPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams; const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
  const defaultTo = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const from = datePattern.test(sp.from ?? "") ? sp.from! : defaultFrom;
  const to = datePattern.test(sp.to ?? "") && sp.to! >= from ? sp.to! : defaultTo;
  const rows = await auditEmployeeProjects(from, to);
  const counts = rows.reduce<Record<string, number>>((a, r) => { a[r.status] = (a[r.status] ?? 0) + 1; return a; }, {});
  return <div className="space-y-8"><div><h1 className="text-2xl font-bold">Employee project audit</h1><p className="text-sm text-muted-foreground">Select the period to compare Planilla Diaria evidence, approved assignments, crew/rig sites, legacy sites, and stored calculations.</p></div><form method="get" className="flex flex-wrap items-end gap-3 rounded-md border p-4"><div className="space-y-2"><Label htmlFor="audit-from">From</Label><Input id="audit-from" name="from" type="date" defaultValue={from} required /></div><div className="space-y-2"><Label htmlFor="audit-to">To</Label><Input id="audit-to" name="to" type="date" defaultValue={to} required /></div><Button type="submit">Run audit</Button><p className="text-sm text-muted-foreground">Current range: {from} → {to}</p></form><div className="grid grid-cols-2 gap-3 md:grid-cols-5">{["correct", "wrong", "missing", "duplicate", "conflict"].map((s) => <Card key={s} className="py-2"><CardContent><p className="text-xs text-muted-foreground capitalize">{s}</p><p className="text-2xl font-bold">{counts[s] ?? 0}</p></CardContent></Card>)}</div><Card><CardHeader><CardTitle>Audit detail</CardTitle><CardDescription>No data is changed by this page.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Planilla sites</TableHead><TableHead>Approved</TableHead><TableHead>Crew/rig sites</TableHead><TableHead>Calculated sites</TableHead><TableHead>Legacy site</TableHead><TableHead>Status</TableHead><TableHead>Recommendation</TableHead></TableRow></TableHeader><TableBody>{rows.map((r) => <TableRow key={r.employeeId}><TableCell>{r.employeeName}<br /><span className="text-xs text-muted-foreground">{r.rut ?? "No RUT"}</span></TableCell><TableCell>{r.planillaSites.join(", ") || "—"}</TableCell><TableCell>{r.approvedSites.join(", ") || "—"}</TableCell><TableCell>{r.crewSites.join(", ") || "—"}</TableCell><TableCell>{r.calculatedSites.join(", ") || "—"}</TableCell><TableCell>{r.legacySite ?? "—"}</TableCell><TableCell><Badge variant={r.status === "correct" ? "default" : "destructive"}>{r.status}</Badge></TableCell><TableCell>{r.recommendation}</TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card></div>;
}
