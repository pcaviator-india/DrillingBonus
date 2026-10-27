import { db } from "@/lib/db";
import { normalizeText, rigKeyOf } from "@/lib/excel/normalize";

/**
 * Rig alias registry: maps machine names written in the planilla
 * (e.g. "EDM 2000-7") to the canonical rigs of the interval report
 * (e.g. "740-7"). Same pattern as the cargo PositionAlias registry.
 */

/** Ensure every rig from the interval report has an alias under its own name. */
export async function ensureRigAliasesSeeded(): Promise<void> {
  const rigs = await db.rig.findMany({ select: { id: true, name: true, code: true } });
  for (const rig of rigs) {
    const baseName = (rig.code ?? "").startsWith("rig:")
      ? (rig.code ?? "").slice(4)
      : rig.name;
    for (const variant of [baseName, rig.name]) {
      const normalized = normalizeText(variant);
      if (!normalized) continue;
      const existing = await db.rigAlias.findUnique({ where: { normalized } });
      if (existing) continue;
      await db.rigAlias.create({
        data: { normalized, displayName: variant, rigId: rig.id, source: "excel", variants: [variant] },
      });
    }
  }
}

export type RigAliasRow = {
  id: string;
  normalized: string;
  displayName: string;
  rigId: string;
  rigName: string;
  source: string;
  variants: string[];
};

export async function listRigAliases(): Promise<RigAliasRow[]> {
  const aliases = await db.rigAlias.findMany({ include: { rig: true }, orderBy: { normalized: "asc" } });
  return aliases.map((a) => ({
    id: a.id,
    normalized: a.normalized,
    displayName: a.displayName,
    rigId: a.rigId,
    rigName: a.rig.name,
    source: a.source,
    variants: Array.isArray(a.variants) ? (a.variants as string[]) : [],
  }));
}

/**
 * Machine names found in planilla entries that don't resolve to any rig alias yet.
 * These are what the admin needs to map.
 */
export async function listUnmappedMachines(): Promise<{ machine: string; entries: number }[]> {
  const aliases = await db.rigAlias.findMany({ select: { normalized: true } });
  const mapped = new Set(aliases.map((a) => rigKeyOf(a.normalized)));
  const entries = await db.dailyCrewEntry.findMany({
    where: { machine: { not: null } },
    select: { machine: true },
    distinct: ["machine"],
  });
  const counts = await db.dailyCrewEntry.groupBy({
    by: ["machine"],
    where: { machine: { not: null } },
    _count: { _all: true },
  });
  const countByMachine = new Map(counts.map((c) => [c.machine ?? "", c._count._all]));
  return entries
    .map((e) => (e.machine ?? "").trim())
    .filter((m) => m && !mapped.has(rigKeyOf(m)))
    .map((m) => ({ machine: m, entries: countByMachine.get(m) ?? 0 }))
    .sort((a, b) => b.entries - a.entries);
}

/** Assign a machine name to a rig (creates or updates the alias). */
export async function assignMachineToRig(machine: string, rigId: string): Promise<void> {
  const trimmed = machine.trim();
  const normalized = normalizeText(trimmed);
  if (!normalized) throw new Error("Machine alias is required");
  const rig = await db.rig.findUnique({ where: { id: rigId }, select: { id: true } });
  if (!rig) throw new Error("Rig not found");
  const existing = await db.rigAlias.findUnique({ where: { normalized } });
  if (existing && existing.rigId !== rigId) {
    throw new Error(`Machine alias is already assigned to another rig`);
  }
  const variants = Array.isArray(existing?.variants) ? (existing.variants as string[]) : [];
  if (!variants.includes(trimmed)) variants.push(trimmed);
  await db.rigAlias.upsert({
    where: { normalized },
    create: { normalized, displayName: trimmed, rigId, source: "manual", variants },
    update: { rigId, source: "manual", variants },
  });
}

/** Delete an alias (e.g. wrong mapping). */
export async function deleteRigAlias(aliasId: string): Promise<void> {
  await db.rigAlias.delete({ where: { id: aliasId } });
}

/** Resolve a machine name to a rigId, or null when unmapped. */
export async function resolveRigByMachine(machine: string | null): Promise<string | null> {
  if (!machine) return null;
  const normalized = normalizeText(machine);
  const alias = await db.rigAlias.findUnique({ where: { normalized } });
  if (alias) return alias.rigId;
  const aliases = await db.rigAlias.findMany({ select: { normalized: true, rigId: true } });
  return aliases.find((a) => rigKeyOf(a.normalized) === rigKeyOf(machine))?.rigId ?? null;
}
