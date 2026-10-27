import "dotenv/config";
import { ensureGroupsSeeded, listAliases, suggestMatches, registerCargosFromExcel, ensureMainPositionsSeeded, listMainPositionsWithAliases, listAliasesNeedingReview } from "../src/lib/positions/registry";
import { db } from "../src/lib/db";

async function main() {
  await ensureGroupsSeeded();
  await ensureMainPositionsSeeded();
  const newCount = await registerCargosFromExcel();
  console.log("new cargo aliases registered:", newCount);

  const aliases = await listAliases();
  const assigned = aliases.filter((a) => a.groupId);
  const unassigned = aliases.filter((a) => !a.groupId);
  console.log(`total: ${aliases.length} assigned: ${assigned.length} unassigned: ${unassigned.length}`);
  for (const a of aliases) {
    const suffix = a.groupId ? "" : ` (similar: ${suggestMatches(a.normalized, assigned).map((s) => `${s.alias.displayName} ${(s.score * 100).toFixed(0)}%`).join(", ")})`;
    console.log(`- ${a.normalized} => ${a.groupName ?? "UNASSIGNED"}${suffix}`);
  }

  console.log("\nMain positions:");
  for (const m of await listMainPositionsWithAliases()) {
    console.log(`- ${m.name} [${m.groupName ?? "no group"}] aliases: ${m.aliases.map((a) => a.displayName).join(", ") || "none"}`);
  }

  console.log("\nNeeds review:", (await listAliasesNeedingReview()).map((a) => a.displayName).join(", ") || "none");

  await db.$disconnect();
}

main();

