import { db } from "@/lib/db";
import { listMainPositionsWithAliases } from "@/lib/positions/registry";
import type { GroupOption, PositionOption } from "./components/rule-form-shared";

/**
 * Server-only loaders for the option lists the structured rule forms render.
 *
 * Kept out of the components so the client bundle never imports Prisma, and
 * shared between the "create rule set" and "edit rule set" pages so both offer
 * exactly the same choices.
 */

/** Canonical cargos (MainPosition) with the bonus group they belong to. */
export async function loadPositionOptions(): Promise<PositionOption[]> {
  const mains = await listMainPositionsWithAliases();
  return mains.map((m) => ({
    name: m.name,
    groupKey: m.groupKey,
    groupName: m.groupName,
  }));
}

/** Bonus groups (group1 = supervision, group2 = drilling crew, ...). */
export async function loadGroupOptions(): Promise<GroupOption[]> {
  const groups = await db.positionGroup.findMany({ orderBy: { order: "asc" } });
  return groups.map((g) => ({ key: g.key, name: g.name }));
}
