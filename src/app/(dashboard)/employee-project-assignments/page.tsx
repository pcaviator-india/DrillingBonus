import { formatDateUtc } from "@/lib/datetime";
import { db } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CreateAssignmentForm, AssignmentStatusButton, GenerateSuggestionsForm, SuggestionReviewButtons } from "./assignment-controls";

export default async function EmployeeProjectAssignmentsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const suggestionWhere = query ? { OR: [
    { employee: { fullName: { contains: query, mode: "insensitive" as const } } },
    { employee: { rut: { contains: query, mode: "insensitive" as const } } },
    { site: { name: { contains: query, mode: "insensitive" as const } } },
    { source: { contains: query, mode: "insensitive" as const } },
    { confidence: { contains: query, mode: "insensitive" as const } },
    { status: { contains: query, mode: "insensitive" as const } },
  ] } : undefined;
  const [employees, sites, assignments, suggestions] = await Promise.all([
    db.employee.findMany({ where: { isActive: true }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    db.site.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.employeeProjectAssignment.findMany({ include: { employee: true, site: true }, orderBy: [{ status: "asc" }, { startDate: "desc" }] }),
    db.employeeProjectSuggestion.findMany({ where: suggestionWhere, include: { employee: true, site: true }, orderBy: [{ status: "asc" }, { startDate: "desc" }], take: 500 }),
  ]);
  return <div className="space-y-8">
    <div><h1 className="text-2xl font-bold">Employee project assignments</h1><p className="text-sm text-muted-foreground">Approved assignments define the authoritative project scope for calculations. Attendance/GPS remains supporting evidence.</p></div>
    <Card><CardHeader><CardTitle>Automatic suggestions</CardTitle><CardDescription>Generate from Excel project evidence, then approve or reject each proposal. Suggestions are not used by calculations until approved.</CardDescription></CardHeader><CardContent><GenerateSuggestionsForm /><form method="get" className="my-4 flex max-w-xl gap-2"><Input name="q" defaultValue={query} placeholder="Search employee, RUT, project, source, confidence, or status" /><button type="submit" className="h-10 rounded-md border px-3 text-sm">Search</button>{query ? <a href="/employee-project-assignments" className="flex h-10 items-center px-2 text-sm text-muted-foreground hover:text-foreground">Clear</a> : null}</form><div className="mt-4 overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Suggested project</TableHead><TableHead>Period</TableHead><TableHead>Source</TableHead><TableHead>Confidence</TableHead><TableHead>Evidence</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader><TableBody>{suggestions.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No automatic suggestions yet. Run detection above.</TableCell></TableRow> : suggestions.map((s) => <TableRow key={s.id}><TableCell>{s.employee.fullName}</TableCell><TableCell>{s.site.name}</TableCell><TableCell>{formatDateUtc(s.startDate)} → {s.endDate ? formatDateUtc(s.endDate) : "Current"}</TableCell><TableCell>{s.source}</TableCell><TableCell><Badge variant={s.confidence === "high" ? "default" : "secondary"}>{s.confidence}</Badge></TableCell><TableCell className="max-w-72 truncate text-xs">{s.evidence ? JSON.stringify(s.evidence) : "—"}</TableCell><TableCell><Badge variant={s.status === "conflict" ? "destructive" : "secondary"}>{s.status}</Badge></TableCell><TableCell><SuggestionReviewButtons id={s.id} status={s.status} /></TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card>
    <Card><CardHeader><CardTitle>Approve an assignment</CardTitle><CardDescription>Assignments are effective-dated. Leave end date empty for a current assignment.</CardDescription></CardHeader><CardContent><CreateAssignmentForm employees={employees.map((e) => ({ id: e.id, name: e.fullName }))} sites={sites} /></CardContent></Card>
    <Card><CardHeader><CardTitle>Assignment history</CardTitle><CardDescription>{assignments.length} assignment record(s)</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Project/site</TableHead><TableHead>Effective period</TableHead><TableHead>Source</TableHead><TableHead>Status</TableHead><TableHead>Note</TableHead><TableHead></TableHead></TableRow></TableHeader><TableBody>{assignments.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No project assignments yet.</TableCell></TableRow> : assignments.map((a) => <TableRow key={a.id}><TableCell>{a.employee.fullName}</TableCell><TableCell>{a.site.name}</TableCell><TableCell>{formatDateUtc(a.startDate)} → {a.endDate ? formatDateUtc(a.endDate) : "Current"}</TableCell><TableCell>{a.source}</TableCell><TableCell><Badge variant={a.status === "approved" ? "default" : "secondary"}>{a.status}</Badge></TableCell><TableCell>{a.note ?? "—"}</TableCell><TableCell>{a.status !== "approved" ? <AssignmentStatusButton id={a.id} status={a.status} /> : <AssignmentStatusButton id={a.id} status={a.status} />}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
  </div>;
}
