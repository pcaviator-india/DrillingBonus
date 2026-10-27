/**
 * Phase A validation probe — runs the AI suggester against REAL database data
 * (read-only). Safe to run anytime; its own process.
 *
 * Usage:  npx tsx scripts/ai-suggest-probe.ts
 */
import "dotenv/config";
import { db } from "../src/lib/db";
import { normalizeText } from "../src/lib/excel/normalize";
import {
  suggestRigMatches,
  suggestSiteMatches,
  suggestPositionMatches,
  AI_MATCH_SCORE_HIGH,
} from "../src/lib/ai/suggest";

function printSuggestions(
  title: string,
  rows: { term: string; candidates: { label: string; score: number; confidence: string }[] }[],
) {
  console.log(`\n=== ${title} ===`);
  if (rows.length === 0) {
    console.log("  (nothing unmapped — nothing to suggest)");
    return;
  }
  for (const r of rows) {
    const top = r.candidates[0];
    const marker = top && top.confidence === "high" ? "✅" : top ? "🟡" : "❌";
    console.log(`${marker} "${r.term}"`);
    for (const c of r.candidates) {
      console.log(`      ${c.score.toFixed(3)} [${c.confidence}] → ${c.label}`);
    }
    if (r.candidates.length === 0) console.log("      (no candidate above threshold)");
  }
}

async function main() {
  // 1. Unmapped planilla machines → Rigs
  const rigAliases = await db.rigAlias.findMany({ select: { normalized: true } });
  const mappedRigs = new Set(rigAliases.map((a) => a.normalized));
  const machines = await db.dailyCrewEntry.findMany({
    where: { machine: { not: null } },
    select: { machine: true },
    distinct: ["machine"],
  });
  const unmappedMachines = machines
    .map((m) => (m.machine ?? "").trim())
    .filter((m) => m && !mappedRigs.has(normalizeText(m)));
  printSuggestions(
    `Unmapped machines → Rigs (${unmappedMachines.length})`,
    await suggestRigMatches(unmappedMachines),
  );

  // 2. Unmapped proyectos → Sites
  const siteAliases = await db.siteAlias.findMany({ select: { normalized: true } });
  const mappedSites = new Set(siteAliases.map((a) => a.normalized));
  const proyectos = await db.dailyCrewEntry.findMany({
    where: { projectName: { not: null } },
    select: { projectName: true },
    distinct: ["projectName"],
  });
  const unmappedProyectos = proyectos
    .map((p) => (p.projectName ?? "").trim())
    .filter((p) => p && !mappedSites.has(normalizeText(p)));
  printSuggestions(
    `Unmapped proyectos → Sites (${unmappedProyectos.length})`,
    await suggestSiteMatches(unmappedProyectos),
  );

  // 3. Unassigned cargo aliases → MainPositions
  const unlinked = await db.positionAlias.findMany({
    where: { mainPositionId: null },
    select: { displayName: true },
    orderBy: { normalized: "asc" },
  });
  const cargos = unlinked.map((a) => a.displayName ?? "").filter(Boolean);
  printSuggestions(
    `Unassigned cargo aliases → MainPositions (${cargos.length})`,
    await suggestPositionMatches(cargos),
  );

  console.log(`\nLegend: ✅ = top score ≥ ${AI_MATCH_SCORE_HIGH} (likely), 🟡 = review, ❌ = none`);
}

main()
  .catch((err: unknown) => {
    console.error("❌ Probe failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
