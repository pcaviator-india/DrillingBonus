import { db } from "@/lib/db";
import { normalizeText } from "@/lib/excel/normalize";

/**
 * Site alias registry: maps the planilla "PROYECTO" text (e.g. "MantoVerde")
 * to the canonical Site in our DB (e.g. "Proyecto Mandoverde").
 *
 * When the admin assigns a PROYECTO -> Site, we also seed the Site's rigs:
 * every rig whose name/code matches a machine seen under that proyecto is
 * assigned to the Site. Ambiguous names are left for manual assignment so we
 * never guess the wrong rig.
 */

export type ProyectoWithMachines = {
  proyecto: string;
  normalized: string;
  /** distinct machine/rig names that appeared in sheets of this proyecto */
  machines: string[];
  entries: number;
};

/** Discover distinct (proyecto, machines, entries) from the parsed planilla data. */
export async function listProyectos(): Promise<ProyectoWithMachines[]> {
  const entries = await db.dailyCrewEntry.findMany({
    where: {
      OR: [{ projectName: { not: null } }, { machine: { not: null } }],
    },
    select: { projectName: true, machine: true },
  });

  const map = new Map<string, { proyecto: string; machines: Set<string>; entries: number }>();
  for (const e of entries) {
    const raw = (e.projectName ?? "").trim();
    if (!raw) continue;
    const normalized = normalizeText(raw);
    let rec = map.get(normalized);
    if (!rec) {
      rec = { proyecto: raw, machines: new Set(), entries: 0 };
      map.set(normalized, rec);
    }
    rec.entries++;
    if (e.machine) rec.machines.add(e.machine.trim());
  }
  return Array.from(map.entries())
    .map(([normalized, r]) => ({
      proyecto: r.proyecto,
      normalized,
      machines: Array.from(r.machines).sort(),
      entries: r.entries,
    }))
    .sort((a, b) => b.entries - a.entries);
}

export type SiteAliasRow = {
  id: string;
  normalized: string;
  displayName: string;
  siteId: string;
  siteName: string;
  source: string;
  variants: string[];
};

export async function listSiteAliases(): Promise<SiteAliasRow[]> {
  const aliases = await db.siteAlias.findMany({
    include: { site: true },
    orderBy: { normalized: "asc" },
  });
  return aliases.map((a) => ({
    id: a.id,
    normalized: a.normalized,
    displayName:
      Array.isArray(a.variants) && (a.variants as string[]).length > 0
        ? (a.variants as string[])[0]
        : a.normalized,
    siteId: a.siteId,
    siteName: a.site?.name ?? "",
    source: a.source,
    variants: Array.isArray(a.variants) ? (a.variants as string[]) : [],
  }));
}

export type AssignSiteResult = {
  siteId: string;
  aliasCreated: boolean;
  rigsAssigned: string[];
  unmappedMachines: string[];
};

/**
 * Assign a planilla PROYECTO to a Site.
 * - Creates/updates the SiteAlias (so every raw proyecto text resolves to the Site).
 * - Attempts to assign the Site's rigs: any existing Rig whose name/code matches
 *   a machine seen under the proyecto is assigned to the Site (no guessing).
 * - Returns the rigs auto-assigned and the machines we could not resolve.
 */
export async function assignProyectoToSite(
  proyecto: string,
  siteId: string,
): Promise<AssignSiteResult> {
  const raw = proyecto.trim();
  const normalized = normalizeText(raw);
  const existing = await db.siteAlias.findUnique({ where: { normalized } });

  let aliasCreated = false;
  const variants = existing
    ? [...(Array.isArray(existing.variants) ? (existing.variants as string[]) : [])]
    : [];
  if (!variants.includes(raw)) variants.push(raw);

  if (existing) {
    await db.siteAlias.update({
      where: { id: existing.id },
      data: { siteId, source: "manual", variants },
    });
  } else {
    await db.siteAlias.create({
      data: { normalized, siteId, source: "manual", variants: [raw] },
    });
    aliasCreated = true;
  }

  // Seed this Site's rigs: assign any existing Rig whose name/code matches a machine.
  const proyectos = await listProyectos();
  const rec = proyectos.find((p) => p.normalized === normalized);
  const rigsAssigned: string[] = [];
  const unmappedMachines: string[] = [];

  if (rec) {
    const allRigs = await db.rig.findMany({ select: { id: true, name: true, code: true } });
    for (const machine of rec.machines) {
      const normalizedM = normalizeText(machine);
      const match = allRigs.find(
        (r) =>
          normalizeText(r.name) === normalizedM ||
          (r.code != null && normalizeText(r.code) === normalizedM),
      );
      if (match) {
        await db.rig.update({ where: { id: match.id }, data: { siteId } });
        if (!rigsAssigned.includes(match.name)) rigsAssigned.push(match.name);
      } else {
        unmappedMachines.push(machine);
      }
    }
  }

  return { siteId, aliasCreated, rigsAssigned, unmappedMachines };
}

export async function deleteSiteAlias(aliasId: string): Promise<void> {
  await db.siteAlias.delete({ where: { id: aliasId } });
}