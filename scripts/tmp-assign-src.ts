import "dotenv/config";
import { db } from "../src/lib/db";

/** Inspects CrewAssignment source/rawData for the two Ariels + planilla rows on EDM-47K2. */
async function main() {
  const sup = await db.employee.findUnique({ where: { id: "cmthqifo10046n0b45kcf5k3x" } });
  const cho = await db.employee.findUnique({ where: { id: "cmthqifi60043n0b4usmxs2qf" } });
  console.log(`SUPERVISOR: ${sup?.fullName} rut=${sup?.rut} site=${sup?.siteId}`);
  console.log(`CHOFER:     ${cho?.fullName} rut=${cho?.rut} site=${cho?.siteId}`);
  const siteNames = await db.site.findMany({ select: { id: true, name: true } });
  for (const s of siteNames) console.log(`  site ${s.id} = ${s.name}`);

  for (const e of [sup, cho]) {
    if (!e) continue;
    const assigns = await db.crewAssignment.findMany({
      where: { employeeId: e.id },
      orderBy: { date: "asc" },
    });
    console.log(`\n${e.fullName}: ${assigns.length} assignments`);
    const bySource = new Map<string, number>();
    for (const a of assigns) bySource.set(`${a.source}`, (bySource.get(`${a.source}`) ?? 0) + 1);
    console.log(`  by source: ${[...bySource].map(([s, n]) => `${s}x${n}`).join(", ")}`);
    for (const a of assigns.slice(0, 30)) {
      console.log(`  ${a.date.toISOString().slice(0, 10)} ${a.shift} role="${a.roleOnShift}" rig=${a.rigId} source=${a.source} raw=${JSON.stringify(a.rawData).slice(0, 200)}`);
    }
  }

  // Planilla rows on EDM-47K2 around Aug 19-31 (who was the real Conductor?)
  const rig = await db.rig.findFirst({ where: { name: "EDM-47K2" } });
  console.log(`\nRig EDM-47K2: ${rig?.id ?? "not found"}`);
  const entries = await db.dailyCrewEntry.findMany({
    where: {
      date: { gte: new Date("2026-08-19T00:00:00Z"), lte: new Date("2026-08-31T23:59:59Z") },
      OR: [{ machine: { contains: "EDM", mode: "insensitive" } }, { machine: { contains: "47K2", mode: "insensitive" } }],
    },
    orderBy: [{ date: "asc" }, { fullName: "asc" }],
    select: { date: true, rut: true, rutNormalized: true, fullName: true, cargoRaw: true, machine: true, projectName: true, turnoAB: true },
  });
  console.log(`Planilla rows EDM-47K2 (Aug 19-31): ${entries.length}`);
  const seen = new Set<string>();
  for (const en of entries) {
    const k = `${en.date.toISOString().slice(0, 10)}|${en.rut}|${en.fullName}|${en.cargoRaw}|${en.machine}|${en.projectName}`;
    if (seen.has(k)) continue;
    seen.add(k);
    console.log(`  ${en.date.toISOString().slice(0, 10)} rut=${en.rut ?? "?"} name="${en.fullName}" cargo="${en.cargoRaw}" machine=${en.machine} project=${en.projectName} turnoAB=${en.turnoAB ?? "-"}`);
  }
}

main()
  .catch((e) => {
    console.error("FAILED:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
