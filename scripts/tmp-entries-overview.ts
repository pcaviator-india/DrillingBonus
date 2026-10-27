import "dotenv/config";
import { db } from "../src/lib/db";

/** Global picture: how many DailyCrewEntry rows exist, per project, and where
 *  "Silva" appears; plus whether the referenced entry ids still exist. */
async function main() {
  const total = await db.dailyCrewEntry.count();
  console.log(`DailyCrewEntry total: ${total}`);
  const byProject = await db.dailyCrewEntry.groupBy({
    by: ["projectName", "shiftDayNight"],
    _count: { _all: true },
  });
  for (const g of byProject) {
    console.log(`  project=${g.projectName ?? "(null)"} shift=${g.shiftDayNight} count=${g._count._all}`);
  }

  const silvas = await db.dailyCrewEntry.findMany({
    where: { fullName: { contains: "silva", mode: "insensitive" } },
    orderBy: [{ date: "asc" }],
    take: 60,
  });
  console.log(`\nDailyCrewEntry rows with "silva": ${silvas.length} (showing up to 60)`);
  for (const e of silvas) {
    console.log(
      `  id=${e.id} sheet=${e.sheetName} date=${e.date.toISOString().slice(0, 10)} rut="${e.rut}" name="${e.fullName}" cargo="${e.cargoRaw}" machine=${e.machine} shift=${e.shiftDayNight} project=${e.projectName ?? "-"}`,
    );
  }

  // Do the referenced entries still exist?
  const refs = await db.crewAssignment.findMany({ select: { rawData: true, employeeId: true } });
  const ids = refs.map((r) => (r.rawData as { dailyCrewEntryId?: string } | null)?.dailyCrewEntryId).filter((v): v is string => Boolean(v));
  const unique = [...new Set(ids)];
  const found = await db.dailyCrewEntry.findMany({ where: { id: { in: unique } }, select: { id: true } });
  console.log(`\nCrewAssignment rows: ${refs.length}; distinct referenced entryIds: ${unique.length}; still existing: ${found.length}`);
}

main()
  .catch((e) => {
    console.error("FAILED:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
