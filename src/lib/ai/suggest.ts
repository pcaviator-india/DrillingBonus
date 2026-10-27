import { db } from "@/lib/db";
import { aiEmbed } from "./client";
import { isAiEnabled } from "./config";

/**
 * Phase A — AI matching suggester (advisory, read-only).
 *
 * Ranks unmapped names (planilla machines, proyectos, Workera/Excel cargos)
 * against existing canonical entities using embedding cosine similarity —
 * complementing, not replacing, the string-similarity logic in
 * src/lib/excel/normalize and src/lib/positions/registry.
 *
 * HARD RULE: this module never writes aliases. It only returns ranked
 * candidates; a human approves in the matching UI, which then calls the
 * existing assign* functions in src/lib/matching.
 */

/** Below LOW a suggestion is hidden (noise); at/above HIGH it is pre-selected. */
export const AI_MATCH_SCORE_LOW = 0.55;
export const AI_MATCH_SCORE_HIGH = 0.85;

export type AiMatchCandidate<TId> = {
  id: TId;
  label: string;
  /** Cosine similarity 0..1 */
  score: number;
  confidence: "high" | "review";
};

export type AiMatchSuggestion<TId> = {
  /** The unmapped raw term as seen in the source data */
  term: string;
  candidates: AiMatchCandidate<TId>[];
};

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Core ranker: one embedding call for queries + one for candidates, then
 * pure cosine math. Labels carry context ("maquina perforadora 740-7",
 * "cargo de perforacion Perforista") so the model disambiguates domains.
 */
export async function rankTerms<TId>(
  terms: { term: string; context?: string }[],
  candidates: { id: TId; label: string; context?: string }[],
  topK = 3,
): Promise<AiMatchSuggestion<TId>[]> {
  if (terms.length === 0 || candidates.length === 0) return [];
  if (!isAiEnabled()) return [];

  const termInputs = terms.map((t) => (t.context ? `${t.context}: ${t.term}` : t.term));
  const candInputs = candidates.map((c) => (c.context ? `${c.label} (${c.context})` : c.label));

  const termVectors = await aiEmbed({ texts: termInputs });
  const candVectors = await aiEmbed({ texts: candInputs });

  const cands = candidates.map((c, i) => ({
    ...c,
    vector: candVectors[i] ?? [],
  }));

  return terms.map((t, i) => {
    const tv = termVectors[i] ?? [];
    const ranked = cands
      .map((c) => ({ id: c.id, label: c.label, score: cosine(tv, c.vector) }))
      .filter((c) => c.score >= AI_MATCH_SCORE_LOW)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((c) => ({
        ...c,
        confidence: c.score >= AI_MATCH_SCORE_HIGH ? ("high" as const) : ("review" as const),
      }));
    return { term: t.term, candidates: ranked };
  });
}

/** Suggest Rig matches for unmapped planilla machine names. */
export async function suggestRigMatches(
  machines: string[],
  topK = 3,
): Promise<AiMatchSuggestion<string>[]> {
  const rigs = await db.rig.findMany({
    where: { isActive: true },
    include: { site: { select: { name: true } }, rigAliases: { select: { displayName: true } } },
  });
  const candidates = rigs.map((r) => ({
    id: r.id,
    label: `maquina perforadora ${r.name}`,
    context: [
      r.code ? `codigo ${r.code}` : null,
      r.site?.name ? `proyecto ${r.site.name}` : null,
      r.rigAliases.length > 0
        ? `otros nombres: ${r.rigAliases.map((a) => a.displayName).join(", ")}`
        : null,
    ]
      .filter(Boolean)
      .join("; "),
  }));
  return rankTerms<string>(
    machines.map((m) => ({ term: m, context: "maquina planilla" })),
    candidates,
    topK,
  );
}

/** Suggest Site matches for unmapped planilla PROYECTO strings. */
export async function suggestSiteMatches(
  proyectos: string[],
  topK = 3,
): Promise<AiMatchSuggestion<string>[]> {
  const sites = await db.site.findMany({
    where: { isActive: true },
    select: { id: true, name: true, code: true, siteAliases: { select: { variants: true } } },
  });
  const candidates = sites.map((s) => ({
    id: s.id,
    label: `proyecto ${s.name}`,
    context: [
      s.code ? `codigo ${s.code}` : null,
      s.siteAliases.length > 0
        ? `otros nombres: ${s.siteAliases
            .flatMap((a) => (Array.isArray(a.variants) ? (a.variants as string[]) : []))
            .join(", ")}`
        : null,
    ]
      .filter(Boolean)
      .join("; "),
  }));
  return rankTerms<string>(
    proyectos.map((p) => ({ term: p, context: "proyecto planilla" })),
    candidates,
    topK,
  );
}

/** Suggest MainPosition (canonical cargo) matches for unassigned cargo aliases. */
export async function suggestPositionMatches(
  cargos: string[],
  topK = 3,
): Promise<AiMatchSuggestion<string>[]> {
  const mains = await db.mainPosition.findMany({
    select: {
      id: true,
      name: true,
      groupKey: true,
      aliases: { select: { displayName: true } },
    },
  });
  const candidates = mains.map((m) => ({
    id: m.id,
    label: `cargo de perforacion ${m.name}`,
    context:
      m.aliases.length > 0
        ? `otros nombres: ${m.aliases.map((a) => a.displayName).join(", ")}`
        : undefined,
  }));
  return rankTerms<string>(
    cargos.map((c) => ({ term: c, context: "cargo" })),
    candidates,
    topK,
  );
}
