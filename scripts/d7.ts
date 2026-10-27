import { db } from "../src/lib/db";
async function main() {
  const p = await db.rigShiftPerformance.findMany({ where: { rigId: "cmv6vroby000vn0085ui5j59k", date: { gte: new Date("2026-09-16T00:00:00Z"), lte: new Date("2026-09-30T00:00:00Z") } }, orderBy: { date: "asc" } });
  for (const x of p) console.log(x.date.toISOString().slice(0,10), x.shift, "site="+x.siteId, "m="+x.metersDrilled);
  console.log("=== crewAssignment rig->site null check (all sites) ===");
  const rigs = await db.rig.findMany({ select: { id: true, name: true, siteId: true } });
  const nullSite = new Set(rigs.filter(r=>!r.siteId).map(r=>r.id));
  const ca = await db.crewAssignment.findMany({ where: { date: { gte: new Date("2026-09-01T00:00:00Z"), lte: new Date("2026-09-30T00:00:00Z") } }, select: { rigId: true, employeeId: true } });
  const perf = await db.rigShiftPerformance.findMany({ where: { date: { gte: new Date("2026-09-01T00:00:00Z"), lte: new Date("2026-09-30T00:00:00Z") } }, select: { rigId: true, siteId: true } });
  const perfSite = new Map<string, Set<string>>();
  for (const x of perf) { const s = perfSite.get(x.rigId) ?? new Set<string>(); s.add(x.siteId ?? "NULL"); perfSite.set(x.rigId, s); }
  const affected = new Map<string, {name:string,sites:Set<string>,n:number}>();
  for (const c of ca) {
    if (!nullSite.has(c.rigId)) continue;
    const sites = perfSite.get(c.rigId);
    if (!sites || !sites.has("NULL")) continue;
    const r = rigs.find(x=>x.id===c.rigId)!;
    const e = affected.get(c.rigId) ?? {name:r.name, sites:new Set(), n:0};
    e.sites = sites; e.n++; affected.set(c.rigId, e);
  }
  console.log("rigs with null Rig.siteId whose Sept perf rows have siteId=NULL:", affected.size);
  await db.$disconnect();
}
main();
