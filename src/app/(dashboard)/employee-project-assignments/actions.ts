"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeRut, normalizeText } from "@/lib/excel/normalize";

export type AssignmentActionState = { error?: string; success?: string };

export async function generateProjectSuggestionsAction(
  _prev: AssignmentActionState,
  formData: FormData,
): Promise<AssignmentActionState> {
  const session = await auth();
  if (session?.user.role !== "admin") return { error: "Only admins can generate project suggestions" };
  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return { error: "Invalid date range" };
  const start = new Date(`${from}T00:00:00Z`); const end = new Date(`${to}T23:59:59Z`);
  const [employees, aliases, uploads, entries] = await Promise.all([
    db.employee.findMany({ select: { id: true, rut: true } }),
    db.siteAlias.findMany({ select: { normalized: true, siteId: true } }),
    db.excelUpload.findMany({ where: { siteId: { not: null } }, select: { id: true, siteId: true } }),
    db.dailyCrewEntry.findMany({ where: { date: { gte: start, lte: end } }, select: { rutNormalized: true, projectName: true, uploadId: true, date: true } }),
  ]);
  const siteByAlias = new Map(aliases.map((a) => [a.normalized, a.siteId]));
  const siteByUpload = new Map(uploads.map((u) => [u.id, u.siteId as string]));
  const employeeByRut = new Map(employees.filter((e) => e.rut).map((e) => [normalizeRut(e.rut!).toUpperCase(), e.id]));
  const groups = new Map<string, { employeeId: string; siteId: string; rows: number; projects: Set<string> }>();
  for (const row of entries) {
    const employeeId = employeeByRut.get(normalizeRut(row.rutNormalized ?? "").toUpperCase()); if (!employeeId) continue;
    const normalized = row.projectName ? normalizeText(row.projectName) : "";
    const siteId = (normalized ? siteByAlias.get(normalized) : null) ?? siteByUpload.get(row.uploadId ?? "");
    if (!siteId) continue;
    const key = `${employeeId}|${siteId}`; const current = groups.get(key) ?? { employeeId, siteId, rows: 0, projects: new Set<string>() };
    current.rows++; current.projects.add(normalized); groups.set(key, current);
  }
  for (const group of groups.values()) {
    const conflict = group.projects.size > 1;
    await db.employeeProjectSuggestion.upsert({
      where: { id: `${group.employeeId}-${group.siteId}-${from}-${to}` },
      create: { id: `${group.employeeId}-${group.siteId}-${from}-${to}`, employeeId: group.employeeId, siteId: group.siteId, startDate: start, endDate: end, source: "excel", status: conflict ? "conflict" : "proposed", confidence: group.rows >= 5 ? "high" : "medium", evidence: { rows: group.rows, projects: [...group.projects] } },
      update: { evidence: { rows: group.rows, projects: [...group.projects] } as object },
    });
  }
  revalidatePath("/employee-project-assignments");
  return { success: `Generated ${groups.size} project suggestion(s) from Excel evidence` };
}

export async function reviewProjectSuggestionAction(
  _prev: AssignmentActionState,
  formData: FormData,
): Promise<AssignmentActionState> {
  const session = await auth();
  if (session?.user.role !== "admin") return { error: "Only admins can review suggestions" };
  const id = String(formData.get("id") ?? ""); const status = String(formData.get("status") ?? "");
  if (!id || !["approved", "rejected", "proposed"].includes(status)) return { error: "Invalid suggestion" };
  const suggestion = await db.employeeProjectSuggestion.findUnique({ where: { id } });
  if (!suggestion) return { error: "Suggestion not found" };
  await db.employeeProjectSuggestion.update({ where: { id }, data: { status, reviewedById: session.user.id, reviewedAt: new Date() } });
  if (status === "approved") {
    await db.employeeProjectAssignment.upsert({ where: { id: `suggestion-${id}` }, create: { id: `suggestion-${id}`, employeeId: suggestion.employeeId, siteId: suggestion.siteId, startDate: suggestion.startDate, endDate: suggestion.endDate, source: suggestion.source, status: "approved", assignedById: session.user.id, reviewedAt: new Date(), note: "Approved from automatic project suggestion" }, update: { status: "approved", endDate: suggestion.endDate, assignedById: session.user.id, reviewedAt: new Date() } });
  }
  revalidatePath("/employee-project-assignments");
  return { success: `Suggestion marked ${status}` };
}
const createSchema = z.object({
  employeeId: z.string().min(1),
  siteId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  note: z.string().max(500).optional(),
});


export async function createProjectAssignmentAction(
  _prev: AssignmentActionState,
  formData: FormData,
): Promise<AssignmentActionState> {
  const session = await auth();
  if (session?.user.role !== "admin") return { error: "Only admins can manage project assignments" };
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid assignment data" };
  if (parsed.data.endDate && parsed.data.endDate < parsed.data.startDate) return { error: "End date must be after start date" };
  try {
    await db.employeeProjectAssignment.create({ data: {
      employeeId: parsed.data.employeeId, siteId: parsed.data.siteId,
      startDate: new Date(`${parsed.data.startDate}T00:00:00Z`),
      endDate: parsed.data.endDate ? new Date(`${parsed.data.endDate}T00:00:00Z`) : null,
      source: "manual", status: "approved", note: parsed.data.note || null,
      assignedById: session.user.id, reviewedAt: new Date(),
    }});
    revalidatePath("/employee-project-assignments");
    return { success: "Project assignment approved" };
  } catch (e) { return { error: e instanceof Error ? e.message : "Could not save assignment" }; }
}

const statusSchema = z.object({ id: z.string().min(1), status: z.enum(["approved", "rejected", "proposed"]) });

export async function updateProjectAssignmentStatusAction(
  _prev: AssignmentActionState,
  formData: FormData,
): Promise<AssignmentActionState> {
  const session = await auth();
  if (session?.user.role !== "admin") return { error: "Only admins can manage project assignments" };
  const parsed = statusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid assignment" };
  await db.employeeProjectAssignment.update({ where: { id: parsed.data.id }, data: {
    status: parsed.data.status, assignedById: session.user.id, reviewedAt: new Date(),
  }});
  revalidatePath("/employee-project-assignments");
  return { success: `Assignment marked ${parsed.data.status}` };
}
