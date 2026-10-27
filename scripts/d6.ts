import { db } from "../src/lib/db";
async function main() {
  const p = await db.rigShiftPerformance.findMany({ where: { rigId: "cmv6vroby000vn0085ui5j59k", date: { gte: new Date("2026-09-01T00:00:00Z"), lte: new Date("2026-09-30T00:00:00Z") } } });
  console.log("perf rows for 740-10:", p.length);
  for (const x of p.slice(0,8)) console.log(x.date.toISOString().slice(0,10), x.shift, "siteId="+x.siteId, "evidence="+x.siteEvidence, "meters="+x.metersDrilled, "intervals="+JSON.stringify(x.intervals));
  console.log("--- alias for 740-10 ---");
  const ra = await db.rigAlias.findMany({ where: { normalized: { in: ["74010","740-10"] } }, include: { rig: true } });
  console.log(JSON.stringify(ra.map(r=>({n:r.normalized, rig:r.rig?.name, site:r.rig?.siteId})), null, 2));
  await db.$disconnect();
}
main();
