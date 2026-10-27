import "dotenv/config";
import { db } from "../src/lib/db";

/** Who is listed as CONDUCTOR on EDM machines Aug 19-31? Any rows for either Ariel RUT? */
async function main() {
  // 1. Conductor rows in the period on EDM machines
  const conductores = await db.dailyCrewEntry.findMany({
    where: {
      date: { gte: new Date("2026-08-19T00:00:00Z"), lte: new Date("2026-08-31T23:59:59Z") },
      cargoNormalized: { contains: "CONDUCTOR" },
    },
    orderBy: [{ date: "asc" }, { fullName: "asc" }],
    select: { date: true, rut: true, rutNormalized: true, fullName: true, cargoRaw: true, machine: true, projectName: true, uploadId: true },
  });
  console.log(`CONDUCTOR rows Aug 19-31: ${conductores.length}`);
  const byWho = new Map<string, number>();
  for (const r of conductores) {
    const k = `${r.fullName} | rut=${r.rut ?? "?"} | machine=${r.machine ?? "?"} | project=${r.projectName ?? "?"}`;
    byWho.set(k, (byWho.get(k) ?? 0) + 1);
  }
  for (const [k, n] of [...byWho].sort()) console.log(`  ${k} x${n}`);

  // 2. Anything with either Ariel's RUT (any name)
  for (const rn of ["156138061", "141561359"]) {
    const rows = await db.dailyCrewEntry.findMany({
      where: { rutNormalized: rn },
      orderBy: { date: "asc" },
      select: { date: true, rut: true, fullName: true, cargoRaw: true, machine: true, projectName: true },
      take: 60,
    });
    console.log(`\nDailyCrewEntry rutNormalized=${rn}: ${rows.length}`);
    const c2 = new Map<string, number>();
    for (const r of rows) {
      const k = `${r.fullName} | cargo=${r.cargoRaw ?? "?"} | machine=${r.machine ?? "?"} | project=${r.projectName ?? "?"}`;
      c2.set(k, (c2.get(k) ?? 0) + 1);
    }
    for (const [k, n] of c2) console.log(`  ${k} x${n}`);
  }

  // 3. All roles on EDM-47K2 / EDM 2000-7 night in Aug 19-31 window (distinct)
  const onEdm = await db.dailyCrewEntry.findMany({
    where: {
      date: { gte: new Date("2026-08-19T00:00:00Z"), lte: new Date("2026-08-31T23:59:59Z") },
      OR: [{ machine: { contains: "EDM", mode: "insensitive" } }, { machine: { contains: "47K2", mode: "insensitive" } }],
    },
    select: { fullName: true, rutNormalized: true, cargoRaw: true, machine: true },
  });
  console.log(`\nEDM rows Aug 19-31: ${onEdm.length}`);
  const distinctEdm = new Map<string, number>();
  for (const r of onEdm) {
    const k = `${r.fullName} | rut=${r.rutNormalized} | cargo=${r.cargoRaw ?? "?"} | machine=${r.machine ?? "?"}`;
    distinctEdm.set(k, (distinctEdm.get(k) ?? 0) + 1);
  }
  for (const [k, n] of [...distinctEdm].sort()) console.log(`  ${k} x${n}`);

  // 4. Which uploads contain Aug 19-31 Coipa planilla rows?
  const aug = await db.dailyCrewEntry.findMany({
    where: { date: { gte: new Date("2026-08-19T00:00:00Z"), lte: new Date("2026-08-31T23:59:59Z") } },
    select: { uploadId: true, projectName: true },
  });
  const byUpload = new Map<string, number>();
  for (const r of aug) byUpload.set(`${r.uploadId ?? "null"} | ${r.projectName ?? "?"}`, (byUpload.get(`${r.uploadId ?? "null"} | ${r.projectName ?? "?"}`) ?? 0) + 1);
  console.log(`\nAug 19-31 rows by upload/project:`);
  for (const [k, n] of byUpload) console.log(`  ${k} x${n}`);
}

main()
  .catch((e) => {
    console.error("FAILED:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
