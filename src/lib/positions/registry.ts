import { db } from "@/lib/db";
import { normalizeText, similarity, containsMatch } from "@/lib/excel/normalize";
import { POSITION_GROUPS, MAIN_POSITIONS } from "./config";

/**
 * Position group registry: keeps PositionGroup + PositionAlias tables in sync
 * with the configuration, collects cargo names from parsed Excel sheets and
 * Workera employees, and suggests matches for unmapped names.
 */

/** Ensure groups from config exist, and seed aliases for known names. Idempotent. */
export async function ensureGroupsSeeded(force = false): Promise<void> {
  for (const g of POSITION_GROUPS) {
    const group = await db.positionGroup.upsert({
      where: { key: g.key },
      create: { key: g.key, name: g.name, description: g.description, order: g.order },
      update: { name: g.name, description: g.description, order: g.order },
    });
    for (const alias of g.aliasNames) {
      const normalized = normalizeText(alias);
      await db.positionAlias.upsert({
        where: { normalized },
        create: {
          normalized,
          displayName: alias,
          groupId: group.id,
          source: "manual",
          variants: [alias],
        },
        // Do not overwrite groupId on update: manual re-assignments/unassignments
        // from the Positions page must survive re-seeding. `force` (Reseed button)
        // explicitly restores the config defaults.
        update: force ? { groupId: group.id, displayName: alias } : { displayName: alias },
      });
    }
  }
}

/** Register all cargo names found in DailyCrewEntry rows as aliases (unassigned if unknown). */
export async function registerCargosFromExcel(): Promise<number> {
  const entries = await db.dailyCrewEntry.findMany({
    select: { cargoRaw: true, cargoNormalized: true },
    distinct: ["cargoNormalized"],
  });
  const knownMains = new Set(
    MAIN_POSITIONS.flatMap((m) => [normalizeText(m.name), ...m.aliasNames.map(normalizeText)]),
  );
  let created = 0;
  for (const e of entries) {
    created += await registerOneCargoName(e.cargoRaw, e.cargoNormalized, "excel", knownMains);
  }
  return created;
}

/**
 * Register all role/cargo names coming from Workera (Attendance page roles)
 * as aliases so they appear on the Positions page for classification.
 * Workera roles live in Role.name (synced from jobPosition) and
 * Employee.jobPositionName — neither was registered before, so names like
 * "LIDER DE PREVENCION" were invisible to Positions and got no group token
 * (→ calculation 0 for group-filtered rules). Idempotent: never touches
 * existing rows except tracking new raw variants.
 */
export async function registerRolesFromWorkera(): Promise<number> {
  const knownMains = new Set(
    MAIN_POSITIONS.flatMap((m) => [normalizeText(m.name), ...m.aliasNames.map(normalizeText)]),
  );
  const [roles, jobNames] = await Promise.all([
    db.role.findMany({ select: { name: true } }),
    db.employee.findMany({
      where: { jobPositionName: { not: null } },
      select: { jobPositionName: true },
      distinct: ["jobPositionName"],
    }),
  ]);
  const seen = new Set<string>();
  let created = 0;
  const all: { raw: string | null; normalized: string }[] = [
    ...roles.map((r) => ({ raw: r.name as string | null, normalized: normalizeText(r.name) })),
    ...jobNames.map((e) => ({
      raw: e.jobPositionName as string | null,
      normalized: normalizeText(e.jobPositionName as string),
    })),
  ];
  for (const n of all) {
    if (!n.normalized || seen.has(n.normalized)) continue;
    seen.add(n.normalized);
    created += await registerOneCargoName(n.raw, n.normalized, "workera", knownMains);
  }
  return created;
}

/** Shared insert for one cargo/role name from any source (excel | workera). */
async function registerOneCargoName(
  raw: string | null,
  normalized: string | null,
  source: string,
  knownMains: Set<string>,
): Promise<number> {
  if (!normalized) return 0;
  const existing = await db.positionAlias.findUnique({ where: { normalized } });
  if (existing) {
    // track variant
    const variants = Array.isArray(existing.variants) ? (existing.variants as string[]) : [];
    if (raw && !variants.includes(raw)) {
      variants.push(raw);
      await db.positionAlias.update({
        where: { id: existing.id },
        data: { variants },
      });
    }
    return 0;
  }
  await db.positionAlias.create({
    data: {
      normalized,
      displayName: raw || normalized,
      source,
      // Names known from config seed immediately; anything else needs review
      needsReview: !knownMains.has(normalized),
      variants: raw ? [raw] : [],
    },
  });
  return 1;
}

export type AliasWithGroup = {
  id: string;
  normalized: string;
  displayName: string;
  source: string;
  variants: string[];
  groupId: string | null;
  groupName: string | null;
};

export async function listAliases(): Promise<AliasWithGroup[]> {
  const aliases = await db.positionAlias.findMany({
    include: { group: true },
    orderBy: { normalized: "asc" },
  });
  return aliases.map((a) => ({
    id: a.id,
    normalized: a.normalized,
    displayName: a.displayName,
    source: a.source,
    variants: Array.isArray(a.variants) ? (a.variants as string[]) : [],
    groupId: a.groupId,
    groupName: a.group?.name ?? null,
  }));
}

/** Suggest existing aliases similar to an unmapped name (normalized comparison). */
export function suggestMatches(
  target: string,
  aliases: AliasWithGroup[],
  minScore = 0.6,
): { alias: AliasWithGroup; score: number }[] {
  const t = normalizeText(target);
  return aliases
    .map((alias) => {
      let score = similarity(t, alias.normalized);
      if (containsMatch(t, alias.normalized)) score = Math.max(score, 0.9);
      return { alias, score };
    })
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

/** Assign an alias to a group. */
export async function assignAliasToGroup(aliasId: string, groupKey: string | null): Promise<void> {
  let groupId: string | null = null;
  if (groupKey) {
    const group = await db.positionGroup.findUnique({ where: { key: groupKey } });
    if (!group) throw new Error(`Unknown group: ${groupKey}`);
    groupId = group.id;
  }
  await db.positionAlias.update({
    where: { id: aliasId },
    data: { groupId, source: "manual" },
  });
}

/** Create a new Main Position and register its own alias row linked to itself. */
export async function createMainPosition(name: string, groupKey?: string | null): Promise<void> {
  const normalized = normalizeText(name);
  const group = groupKey ? await db.positionGroup.findUnique({ where: { key: groupKey } }) : null;
  if (groupKey && !group) throw new Error(`Unknown group: ${groupKey}`);
  const main = await db.mainPosition.upsert({
    where: { normalized },
    create: { name, normalized, groupKey: groupKey ?? null },
    update: {},
  });
  const alias = await db.positionAlias.upsert({
    where: { normalized },
    create: {
      normalized,
      displayName: name,
      mainPositionId: main.id,
      groupId: group?.id ?? null,
      source: "manual",
      needsReview: false,
      variants: [name],
    },
    update: { mainPositionId: main.id, needsReview: false },
  });
  if (group && alias.groupId === null) {
    await db.positionAlias.update({ where: { id: alias.id }, data: { groupId: group.id } });
  }
}

/** Rename a Main Position and keep its own alias row in sync. */
export async function renameMainPosition(mainPositionId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required.");
  const normalized = normalizeText(trimmed);
  const existing = await db.mainPosition.findUnique({ where: { normalized } });
  if (existing && existing.id !== mainPositionId) {
    throw new Error(`A main position with that name already exists: ${existing.name}`);
  }
  await db.mainPosition.update({
    where: { id: mainPositionId },
    data: { name: trimmed, normalized },
  });
  // The main name itself is an alias row — keep it linked and renamed.
  await db.positionAlias.upsert({
    where: { normalized },
    create: {
      normalized,
      displayName: trimmed,
      mainPositionId,
      source: "manual",
      needsReview: false,
      variants: [trimmed],
    },
    update: { displayName: trimmed, mainPositionId, needsReview: false },
  });
}

/** Link an alias to a Main Position; inherits the main's default group when unassigned. */
export async function linkAliasToMain(aliasId: string, mainPositionId: string): Promise<void> {
  const main = await db.mainPosition.findUnique({ where: { id: mainPositionId } });
  if (!main) throw new Error("Main position not found.");
  const alias = await db.positionAlias.findUnique({ where: { id: aliasId } });
  if (!alias) throw new Error("Alias not found.");
  const groupId =
    alias.groupId ??
    (main.groupKey
      ? (await db.positionGroup.findUnique({ where: { key: main.groupKey } }))?.id ?? null
      : null);
  await db.positionAlias.update({
    where: { id: aliasId },
    data: { mainPositionId, needsReview: false, groupId },
  });
}

/** Unlink an alias from its Main Position (keeps its group assignment). */
export async function unlinkAliasFromMain(aliasId: string): Promise<void> {
  await db.positionAlias.update({
    where: { id: aliasId },
    data: { mainPositionId: null, needsReview: false },
  });
}

/** Promote an existing alias row to a new Main Position (linked to itself). */
export async function promoteAliasToMain(aliasId: string): Promise<void> {
  const alias = await db.positionAlias.findUnique({
    where: { id: aliasId },
    include: { group: true },
  });
  if (!alias) throw new Error("Alias not found.");
  // Keep the current group assignment as the new main's default group so the
  // promoted position doesn't become groupless (which would zero calculations).
  const groupKey = alias.group?.key ?? null;
  await createMainPosition(alias.displayName, groupKey);
}

/** Mark an alias as reviewed without classifying it (dismiss the prompt). */
export async function dismissAliasReview(aliasId: string): Promise<void> {
  await db.positionAlias.update({ where: { id: aliasId }, data: { needsReview: false } });
}

/** Delete a Main Position; its aliases stay but become unlinked. */
export async function deleteMainPosition(mainPositionId: string): Promise<void> {
  await db.positionAlias.updateMany({ where: { mainPositionId }, data: { mainPositionId: null } });
  await db.mainPosition.delete({ where: { id: mainPositionId } });
}

/** Alias rows not linked to any Main Position (candidates for classification). */
export async function listUnlinkedAliases(): Promise<AliasWithGroup[]> {
  const aliases = await db.positionAlias.findMany({
    where: { mainPositionId: null },
    include: { group: true },
    orderBy: { normalized: "asc" },
  });
  return aliases.map((a) => ({
    id: a.id,
    normalized: a.normalized,
    displayName: a.displayName,
    source: a.source,
    variants: Array.isArray(a.variants) ? (a.variants as string[]) : [],
    groupId: a.groupId,
    groupName: a.group?.name ?? null,
  }));
}

/**
 * Change the default bonus group of a Main Position and sync all its aliases'
 * groupId so the matching module keeps resolving to the same group.
 */
export async function setMainPositionGroup(
  mainPositionId: string,
  groupKey: string | null,
): Promise<void> {
  const main = await db.mainPosition.findUnique({ where: { id: mainPositionId } });
  if (!main) throw new Error("Main position not found.");
  let groupId: string | null = null;
  if (groupKey) {
    const group = await db.positionGroup.findUnique({ where: { key: groupKey } });
    if (!group) throw new Error(`Unknown group: ${groupKey}`);
    groupId = group.id;
  }
  await db.mainPosition.update({ where: { id: mainPositionId }, data: { groupKey } });
  // The main's own alias row always follows; other aliases only if they
  // were inheriting from the main (i.e. no manual exception was stored).
  await db.$transaction(async (tx) => {
    await tx.positionAlias.updateMany({
      where: { mainPositionId },
      data: { groupId },
    });
  });
}

// ---------- Main Positions ----------

/** Ensure MainPositions from config exist and link their known aliases. Idempotent. */
export async function ensureMainPositionsSeeded(force = false): Promise<void> {
  for (const m of MAIN_POSITIONS) {
    const normalized = normalizeText(m.name);
    const existing = await db.mainPosition.findUnique({ where: { normalized } });
    const main = await db.mainPosition.upsert({
      where: { normalized },
      create: { name: m.name, normalized, groupKey: m.groupKey ?? null, order: m.order },
      // Never overwrite a manual rename on normal re-sync; only `force`
      // (Re-sync button) restores the config name. But ALWAYS backfill a
      // missing groupKey from config so mains created before the config
      // (e.g. via "promote") don't stay groupless and zero out calculations.
      update: force
        ? { name: m.name, groupKey: m.groupKey ?? null, order: m.order }
        : {
            order: m.order,
            ...(existing && !existing.groupKey && m.groupKey ? { groupKey: m.groupKey } : {}),
          },
    });
    const effectiveGroupKey = main.groupKey ?? (force ? (m.groupKey ?? null) : null);
    const groupId = effectiveGroupKey
      ? (await db.positionGroup.findUnique({ where: { key: effectiveGroupKey } }))?.id ?? null
      : null;
    // The main name itself is an alias row linked to itself — always keep it
    // linked and inherit the group when unassigned (this was missing, leaving
    // e.g. PERFORISTA itself groupless while its variants got a group).
    await db.positionAlias.upsert({
      where: { normalized },
      create: {
        normalized,
        displayName: m.name,
        mainPositionId: main.id,
        groupId,
        source: "manual",
        variants: [m.name],
      },
      update: { mainPositionId: main.id },
    });
    // Backfill group on the own-row when it is still null (non-force path).
    if (groupId) {
      const own = await db.positionAlias.findUnique({ where: { normalized } });
      if (own && !own.groupId) {
        await db.positionAlias.update({ where: { id: own.id }, data: { groupId } });
      }
    }
    // Known aliases link to this main position (and inherit its group if unassigned)
    for (const aliasName of m.aliasNames) {
      const aliasNormalized = normalizeText(aliasName);
      const alias = await db.positionAlias.findUnique({ where: { normalized: aliasNormalized } });
      if (!alias) continue;
      await db.positionAlias.update({
        where: { id: alias.id },
        data: {
          mainPositionId: main.id,
          needsReview: false,
          ...(alias.groupId === null && effectiveGroupKey
            ? {
                groupId,
              }
            : {}),
        },
      });
    }
    // Sync every already-linked alias that is still groupless to the main's
    // group (covers variants like PERFORISTA DDH / RC linked manually).
    if (groupId) {
      await db.positionAlias.updateMany({
        where: { mainPositionId: main.id, groupId: null },
        data: { groupId },
      });
    }
  }
}

export type MainPositionWithAliases = {
  id: string;
  name: string;
  normalized: string;
  groupKey: string | null;
  groupName: string | null;
  aliases: AliasWithGroup[];
};

export async function listMainPositionsWithAliases(): Promise<MainPositionWithAliases[]> {
  const mains = await db.mainPosition.findMany({
    include: {
      aliases: { include: { group: true }, orderBy: { normalized: "asc" } },
    },
    orderBy: { order: "asc" },
  });
  const groups = await db.positionGroup.findMany();
  const groupNameByKey = new Map(groups.map((g) => [g.key, g.name]));
  return mains.map((m) => ({
    id: m.id,
    name: m.name,
    normalized: m.normalized,
    groupKey: m.groupKey,
    groupName: m.groupKey ? (groupNameByKey.get(m.groupKey) ?? null) : null,
    aliases: m.aliases.map((a) => ({
      id: a.id,
      normalized: a.normalized,
      displayName: a.displayName,
      source: a.source,
      variants: Array.isArray(a.variants) ? (a.variants as string[]) : [],
      groupId: a.groupId,
      groupName: a.group?.name ?? null,
    })),
  }));
}

/**
 * Resolve a cargo/role name to its canonical main position name.
 * Looks up the PositionAlias table: if the normalized cargo matches an alias
 * that has a mainPositionId, returns the MainPosition's name.
 * Otherwise returns the original input unchanged.
 */
export async function resolveMainPosition(cargoName: string | null): Promise<string> {
  if (!cargoName) return "";
  const normalized = normalizeText(cargoName);
  if (!normalized) return cargoName;
  const alias = await db.positionAlias.findUnique({
    where: { normalized },
    include: { mainPosition: true },
  });
  if (alias?.mainPosition?.name) {
    return alias.mainPosition.name;
  }
  return cargoName;
}

export async function listAliasesNeedingReview(): Promise<AliasWithGroup[]> {
  const aliases = await db.positionAlias.findMany({
    where: { needsReview: true },
    include: { group: true },
    orderBy: { updatedAt: "desc" },
  });
  return aliases.map((a) => ({
    id: a.id,
    normalized: a.normalized,
    displayName: a.displayName,
    source: a.source,
    variants: Array.isArray(a.variants) ? (a.variants as string[]) : [],
    groupId: a.groupId,
    groupName: a.group?.name ?? null,
  }));
}

/**
 * Build a PURE token resolver for the bonus engine from the PositionAlias
 * registry. For any role/cargo name it returns every token that should match
 * a rule's positionFilter:
 *   - the raw name and its normalized form (uppercase, no accents)
 *   - the canonical main position name (e.g. "Chofer" -> "Conductor")
 *   - the bonus group key (e.g. "group1" / "group2") when the alias is assigned
 *
 * The engine stays pure: it receives the tokens as data, never touches the DB.
 */
export async function buildRoleTokenResolver(): Promise<
  (role: string | null | undefined) => string[]
> {
  const aliases = await db.positionAlias.findMany({
    include: { mainPosition: true, group: true },
  });
  const byNormalized = new Map(aliases.map((a) => [a.normalized, a]));
  return (role) => {
    if (!role) return [];
    const tokens = new Set<string>([role]);
    const normalized = normalizeText(role);
    if (normalized) tokens.add(normalized);
    const alias = byNormalized.get(normalized);
    if (alias?.mainPosition?.name) tokens.add(alias.mainPosition.name);
    // Group token: prefer the alias group, but fall back to the linked main's
    // default group so a groupless alias under a grouped Main still matches
    // group-based rules (e.g. "group2") instead of calculating 0.
    if (alias?.group?.key) tokens.add(alias.group.key);
    else if (alias?.mainPosition?.groupKey) tokens.add(alias.mainPosition.groupKey);
    return [...tokens];
  };
}
