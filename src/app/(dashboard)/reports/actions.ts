"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import {
  rebuildWorkDays,
  queryEmployeeSummary,
  queryWorkDays,
  listProyectos,
  listSiteAliases,
  assignProyectoToSite,
  type BuildResult,
} from "@/lib/matching";
import type { EmployeeSummary, WorkDayRow } from "@/lib/matching/build";
import type { ProyectoWithMachines } from "@/lib/matching/site-aliases";

export type ReportsState = { error?: string; success?: string };

export async function rebuildWorkDaysAction(
  _prev: ReportsState,
  formData: FormData,
): Promise<ReportsState & { result?: BuildResult }> {
  const session = await auth();
  if (session?.user.role !== "admin") {
    return { error: "Only admins can rebuild work days" };
  }

  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "");
  if (!from || !to) {
    return { error: "Please select both from and to dates" };
  }
  if (from > to) {
    return { error: "From date must be before To date" };
  }

  try {
    const result = await rebuildWorkDays(from, to);
    revalidatePath("/reports");
    return {
      success: `Built ${result.workDays} work day(s) (${from} to ${to})`,
      result,
    };
  } catch (err) {
    return {
      error: `Build failed: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }
}

export async function getEmployeeSummary(from: string, to: string): Promise<EmployeeSummary[]> {
  return queryEmployeeSummary({ from, to });
}

export async function getWorkDays(opts: {
  from: string;
  to: string;
  employeeId?: string;
  rigId?: string;
  hasFlags?: boolean;
}): Promise<WorkDayRow[]> {
  return queryWorkDays(opts);
}

export async function getProyectos(): Promise<ProyectoWithMachines[]> {
  return listProyectos();
}

export async function getSiteAliases() {
  return listSiteAliases();
}

export type AssignProyectoResult = {
  ok: boolean;
  message: string;
  rigsAssigned?: string[];
  unmappedMachines?: string[];
};

export async function assignProyectoAction(
  proyecto: string,
  siteId: string,
): Promise<AssignProyectoResult> {
  const session = await auth();
  if (session?.user.role !== "admin") {
    return { ok: false, message: "Only admins can assign sites" };
  }
  try {
    const res = await assignProyectoToSite(proyecto, siteId);
    const parts: string[] = [];
    if (res.rigsAssigned.length > 0) {
      parts.push(`rigs assigned: ${res.rigsAssigned.join(", ")}`);
    }
    if (res.unmappedMachines.length > 0) {
      parts.push(`unmapped: ${res.unmappedMachines.join(", ")}`);
    }
    return {
      ok: true,
      message:
        `Proyecto "${proyecto}" assigned to site. ` +
        (parts.length > 0 ? parts.join(". ") + "." : "No rigs auto-assigned."),
      rigsAssigned: res.rigsAssigned,
      unmappedMachines: res.unmappedMachines,
    };
  } catch (err) {
    return {
      ok: false,
      message: `Assignment failed: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  } finally {
    revalidatePath("/reports");
  }
}
