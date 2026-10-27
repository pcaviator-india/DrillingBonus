"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { assignMachineToRig } from "@/lib/matching";

export type ReconciliationActionState = { error?: string; success?: string };

const mapMachineSchema = z.object({
  machine: z.string().min(1).max(200),
  rigId: z.string().min(1),
});

/**
 * Maps a planilla MAQUINA value to a canonical rig (creates/updates the
 * RigAlias). This is the configuration fix for the "unmapped machine" rows on
 * the drilling reconciliation page — once mapped, the rig/day/shift can be
 * compared. Uses the existing matching registry, no new matching code.
 */
export async function mapMachineToRigAction(input: {
  machine: string;
  rigId: string;
}): Promise<ReconciliationActionState> {
  const session = await auth();
  if (!session?.user) {
    return { error: "You must be signed in" };
  }
  if (session.user.role !== "admin" && session.user.role !== "supervisor") {
    return { error: "Only admins and supervisors can map machines to rigs" };
  }

  const parsed = mapMachineSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await assignMachineToRig(parsed.data.machine, parsed.data.rigId);
  } catch (err) {
    return { error: `Mapping failed: ${err instanceof Error ? err.message : "unknown error"}` };
  }

  revalidatePath("/reconciliation/drilling");
  return { success: `"${parsed.data.machine}" mapped to the selected rig` };
}
export type AiRigSuggestion = {
  rigId: string;
  label: string;
  score: number;
  confidence: "high" | "review";
};

/**
 * AI-ranked rig candidates for one unmapped MAQUINA value.
 * Advisory only: returns suggestions; mapping itself still goes through
 * mapMachineToRigAction. Returns [] when NVIDIA_API_KEY is not configured.
 */
export async function aiSuggestRigMatchesAction(machine: string): Promise<AiRigSuggestion[]> {
  const session = await auth();
  if (session?.user.role !== "admin" && session?.user.role !== "supervisor") return [];
  const clean = machine.trim().slice(0, 200);
  if (!clean) return [];
  const { suggestRigMatches } = await import("@/lib/ai/suggest");
  const suggestions = await suggestRigMatches([clean]);
  return (suggestions[0]?.candidates ?? []).map((c) => ({
    rigId: c.id,
    label: c.label.replace(/^maquina perforadora /, ""),
    score: c.score,
    confidence: c.confidence,
  }));
}

