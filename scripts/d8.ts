import { db } from "../src/lib/db";
async function main() {
  const ca = await db.crewAssignment.findMany({ where: { date: { gte: new Date("2026-09-01T00:00:00Z"), lte: new Date("2026-09-30T00:00:00Z") } }, select: { id:true, employeeId:true, rigId:true, date:true, shift:true } });
  const perf = await db.rigShiftPerformance.findMany({ where: { date: { gte: new Date("2026-09-01T00:00:00Z"), lte: new Date("2026-09-30T00:00:00Z") } }, select: { rigId:true, date:true, shift:true, siteId:true } });
  const rigs = await db.rig.findMany({ select: { id:true, name:true, siteId:true } });
  const rigById = new Map(rigs.map(r=>[r.id,r]));
  const perfBy = new Map(perf.map(p=>[`${p.rigId}|${p.date.toISOString().slice(0,10)}|${p.shift}`, p]));
  const perfAnyByRigDate = new Map<string, Set<string>>();
  for (const p of perf) { const k=`${p.rigId}|${p.date.toISOString().slice(0,10)}`; const s=perfAnyByRigDate.get(k)??new Set<string>(); s.add(p.siteId??"NULL"); perfAnyByRigDate.set(k,s); }
  const bySite = new Map<string, number>();
  let excluded = 0, included = 0, noSite = 0;
  for (const c of ca) {
    const d = c.date.toISOString().slice(0,10);
    const exact = perfBy.get(`${c.rigId}|${d}|${c.shift}`);
    const any = perfAnyByRigDate.get(`${c.rigId}|${d}`);
    const rigSite = rigById.get(c.rigId)?.siteId ?? null;
    let site: string|null = null;
    if (exact) site = exact.siteId;
    else if (any && any.size===1) site = [...any][0]==="NULL"?null:[...any][0];
    else if (any) site = [...any].filter(s=>s!=="NULL")[0] ?? null;
    if (!site) { noSite++; continue; }
    const cur = bySite.get(site) ?? 0; bySite.set(site, cur+1);
    if (rigSite === site) included++; else { excluded++; console.log(`EXCLUDED rig=${rigById.get(c.rigId)?.name} rigSite=${rigSite} shiftSite=${site} date=${d} shift=${c.shift}`); }
  }
  console.log("included(current filter would keep):", included, "| excluded but has perf-site:", excluded, "| no site resolvable:", noSite);
  await db.$disconnect();
}
main();
