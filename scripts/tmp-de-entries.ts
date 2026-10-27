import "dotenv/config";
import { db } from "../src/lib/db";
import { normalizeRut } from "../src/lib/excel/normalize";

/** Rows of alive DailyCrewEntry for the RUTs involved in the Coipa mix-up. */
async function main() {
  const ruts = ["15613806-1", "17805184-9", "8851221-9", "14156135-9"].map((r) => normalizeRut(r));
  const rows = await db.dailyCrewEntry.findMany({
    where: { rutNormalized: { in: ruts } },
    orderBy: [{ rutNormalized: "asc" }, { date: "asc" }],
    include: { upload: { select: { fileName: true, siteId: true } } },
  });
  console.log(`Alive DailyCrewEntry rows for those RUTs: ${rows.length}`);
  const byRut = new Map<string, typeof rows>();
  for (const r of rows) byRut.set(r.rutNormalized, [...(byRut.get(r.rutNormalized) ?? []), r]);
  for (const [rut, list] of byRut) {
    console.log(`\nRUT ${rut} — ${list.length} rows`);
    for (const r of list) {
      console.log(
        `  ${r.date.toISOString().slice(0, 10)} ${r.shiftDayNight} cargo=${r.cargoNormalized} name="${r.fullName}" machine=${r.machine ?? "-"} upload="${r.upload.fileName}"`,
      );
    }
  }

  // Which crew assignments does each of them have, and are they backed?
  const emps = await db.employee.findMany({
    where: { fullName: { in: ["ARIEL ANDRES SILVA RIQUELME", "ARIEL BENEDICTO LISBOA CASTRO"] } },
    select: { id: true, fullName: true },
  });
  for (const e of emps) {
    const assigns = await db.crewAssignment.findMany({
      where: { employeeId: e.id },
      orderBy: { date: "asc" },
      include: { rig: { select: { name: true } } },
    });
    console.log(`\nASSIGNMENTS ${e.fullName}: ${assigns.length}`);
    const byRole = new Map<string, string[]>();
    for (const a of assigns) byRole.set(a.roleOnShift ?? "-", [...(byRole.get(a.roleOnShift ?? "-") ?? []), a.date.toISOString().slice(0, 10)]);
    for (const [role, dates] of byRole) console.log(`  ${role}: ${dates.length} → ${dates[0]}..${dates[dates.length - 1]}`);
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
