import { db } from "@/lib/db";
import { normalizeText, rigKeyOf } from "@/lib/excel/normalize";

/**
 * Rig-site evidence: cross-checks RigShiftPerformance.siteId (stamped from the
 * upload) against independent planilla evidence — DailyCrewEntry rows of the
 * same rig (via machine→rig alias) and date carry a projectName whose
 * SiteAlias resolves to a Site. If that resolves to a DIFFERENT site, the rig
 * probably moved and the performance row is flagged for human review.
 *
 * This module never rewrites siteId — flagging is always advisory.
 */

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Majority planilla site per (rigId|date), built from crew entries in range. */
async function planillaSiteVotes(from: Date, to: Date): Promise<Map<string, Map<string, number>>> {
  const [aliases, siteAliases, entries] = await Promise.all([
    db.rigAlias.findMany({ select: { normalized: true, rigId: true } }),
    db.siteAlias.findMany({ select: { normalized: true, siteId: true } }),
    db.dailyCrewEntry.groupBy({
      by: ["date", "machine", "projectName"],
      where: {
        date: { gte: from, lte: to },
        machine: { not: null },
        projectName: { not: null },
      },
      _count: { _all: true },
    }),
  ]);
  const rigByMachine = new Map(aliases.map((a) => [rigKeyOf(a.normalized), a.rigId]));
  const siteByProject = new Map(siteAliases.map((a) => [a.normalized, a.siteId]));
  const votes = new Map<string, Map<string, number>>();
  for (const e of entries) {
    const rigId = rigByMachine.get(rigKeyOf((e.machine ?? "").trim()));
    const siteId = siteByProject.get(normalizeText((e.projectName ?? "").trim()));
    if (!rigId || !siteId) continue;
    const key = `${rigId}|${fmtDate(e.date)}`;
    const perSite = votes.get(key) ?? new Map<string, number>();
    perSite.set(siteId, (perSite.get(siteId) ?? 0) + e._count._all);
    votes.set(key, perSite);
  }
  return votes;
}
/**
 * Evaluate performances in [from, to] that have a stamped site: compare with
 * planilla crew evidence for the same (rig, date). Sets siteConflict=true on
 * rows whose planilla site disagrees, false on rows that agree; rows with no
 * planilla evidence keep their current flag. Returns the conflict count.
 */
export async function flagPerformanceSiteConflicts(from: Date, to: Date): Promise<number> {
  const [votes, perfs] = await Promise.all([
    planillaSiteVotes(from, to),
    db.rigShiftPerformance.findMany({
      where: { date: { gte: from, lte: to }, siteId: { not: null } },
      select: { id: true, rigId: true, date: true, siteId: true },
    }),
  ]);

  const conflictIds: string[] = [];
  const clearIds: string[] = [];
  for (const p of perfs) {
    const [planillaSiteId] = majority(votes.get(`${p.rigId}|${fmtDate(p.date)}`));
    if (!planillaSiteId) continue; // no planilla evidence — leave flag as-is
    if (planillaSiteId !== p.siteId) conflictIds.push(p.id);
    else clearIds.push(p.id);
  }

  if (conflictIds.length > 0) {
    await db.rigShiftPerformance.updateMany({
      where: { id: { in: conflictIds } },
      data: { siteConflict: true },
    });
  }
  if (clearIds.length > 0) {
    await db.rigShiftPerformance.updateMany({
      where: { id: { in: clearIds } },
      data: { siteConflict: false },
    });
  }
  return conflictIds.length;
}

export type SiteConflictReport = {
  rigId: string;
  rigName: string;
  date: string;
  shift: string;
  stampedSiteName: string | null;
  planillaSiteName: string | null;
  evidenceRows: number;
};

/** Human-readable list of current conflicts (scripts + future admin UI). */
export async function listPerformanceSiteConflicts(
  from?: Date,
  to?: Date,
): Promise<SiteConflictReport[]> {
  const rows = await db.rigShiftPerformance.findMany({
    where: {
      siteConflict: true,
      ...(from && to ? { date: { gte: from, lte: to } } : {}),
    },
    include: { rig: { select: { name: true } }, site: { select: { name: true } } },
    orderBy: [{ date: "asc" }, { rig: { name: "asc" } }],
  });
  if (rows.length === 0) return [];

  const first = rows[0]!.date;
  const last = rows[rows.length - 1]!.date;
  const [votes, sites] = await Promise.all([
    planillaSiteVotes(first, last),
    db.site.findMany({ select: { id: true, name: true } }),
  ]);
  const siteNameById = new Map(sites.map((s) => [s.id, s.name]));

  return rows.map((r) => {
    const [planillaSiteId, evidenceRows] = majority(votes.get(`${r.rigId}|${fmtDate(r.date)}`));
    return {
      rigId: r.rigId,
      rigName: r.rig.name,
      date: fmtDate(r.date),
      shift: r.shift,
      stampedSiteName: r.site?.name ?? null,
      planillaSiteName: planillaSiteId ? (siteNameById.get(planillaSiteId) ?? null) : null,
      evidenceRows,
    };
  });
}


function majority(perSite: Map<string, number> | undefined): [string | null, number] {
  if (!perSite) return [null, 0];
  const top = [...perSite.entries()].sort((a, b) => b[1] - a[1])[0];
  return top ? [top[0], top[1]] : [null, 0];
}
