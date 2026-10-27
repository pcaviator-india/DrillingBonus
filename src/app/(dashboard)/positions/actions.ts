"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import {
  ensureGroupsSeeded,
  ensureMainPositionsSeeded,
  registerCargosFromExcel,
  registerRolesFromWorkera,
  listAliasesNeedingReview,
  createMainPosition,
  linkAliasToMain,
  unlinkAliasFromMain,
  promoteAliasToMain,
  dismissAliasReview,
  deleteMainPosition,
  renameMainPosition,
  setMainPositionGroup,
} from "@/lib/positions/registry";
import { db } from "@/lib/db";

async function requireAdmin(): Promise<boolean> {
  const session = await auth();
  return session?.user.role === "admin";
}

/** Reset the pending-review prompt on uploads once all names are classified. */
async function syncUploadPendingFlags(): Promise<void> {
  const remaining = await listAliasesNeedingReview();
  if (remaining.length === 0) {
    await db.excelUpload.updateMany({ data: { positionAliasesPending: 0 } });
  }
}

export async function reseedPositionsAction(): Promise<void> {
  if (!(await requireAdmin())) return;
  await ensureGroupsSeeded(true);
  await ensureMainPositionsSeeded(true);
  await registerCargosFromExcel();
  await registerRolesFromWorkera();
  revalidatePath("/positions");
  revalidatePath("/groups");
}

export async function createMainPositionAction(
  name: string,
  groupKey: string | null,
): Promise<void> {
  if (!(await requireAdmin())) return;
  await createMainPosition(name, groupKey);
  await syncUploadPendingFlags();
  revalidatePath("/positions");
  revalidatePath("/groups");
}

export async function linkAliasToMainAction(
  aliasId: string,
  mainPositionId: string,
): Promise<void> {
  if (!(await requireAdmin())) return;
  await linkAliasToMain(aliasId, mainPositionId);
  await syncUploadPendingFlags();
  revalidatePath("/positions");
  revalidatePath("/groups");
}

export async function unlinkAliasFromMainAction(aliasId: string): Promise<void> {
  if (!(await requireAdmin())) return;
  await unlinkAliasFromMain(aliasId);
  revalidatePath("/positions");
}

export async function promoteAliasToMainAction(aliasId: string): Promise<void> {
  if (!(await requireAdmin())) return;
  await promoteAliasToMain(aliasId);
  await syncUploadPendingFlags();
  revalidatePath("/positions");
  revalidatePath("/groups");
}

export async function dismissReviewAction(aliasId: string): Promise<void> {
  if (!(await requireAdmin())) return;
  await dismissAliasReview(aliasId);
  await syncUploadPendingFlags();
  revalidatePath("/positions");
}

export async function renameMainPositionAction(
  mainPositionId: string,
  name: string,
): Promise<void> {
  if (!(await requireAdmin())) return;
  await renameMainPosition(mainPositionId, name);
  revalidatePath("/positions");
  revalidatePath("/groups");
}

export async function deleteMainPositionAction(mainPositionId: string): Promise<void> {
  if (!(await requireAdmin())) return;
  await deleteMainPosition(mainPositionId);
  revalidatePath("/positions");
}

export async function setMainPositionGroupAction(
  mainPositionId: string,
  groupKey: string | null,
): Promise<void> {
  if (!(await requireAdmin())) return;
  await setMainPositionGroup(mainPositionId, groupKey);
  revalidatePath("/positions");
  revalidatePath("/groups");
}
export type AiMainSuggestion = {
  id: string;
  name: string;
  score: number;
  confidence: "high" | "review";
};

/**
 * AI-ranked MainPosition candidates for one unlinked cargo name.
 * Advisory only: returns suggestions; the human still clicks Link/Dismiss.
 * Returns [] silently when NVIDIA_API_KEY is not configured.
 */
export async function aiSuggestMainPositionsAction(term: string): Promise<AiMainSuggestion[]> {
  if (!(await requireAdmin())) return [];
  const clean = term.trim().slice(0, 200);
  if (!clean) return [];
  const { suggestPositionMatches } = await import("@/lib/ai/suggest");
  const suggestions = await suggestPositionMatches([clean]);
  return (suggestions[0]?.candidates ?? []).map((c) => ({
    id: c.id,
    // Strip the "cargo de perforacion " context prefix used for embedding quality.
    name: c.label.replace(/^cargo de perforacion /, ""),
    score: c.score,
    confidence: c.confidence,
  }));
}

