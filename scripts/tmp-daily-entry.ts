import "dotenv/config";
import { db } from "../src/lib/db";

/** Dumps DailyCrewEntry rows for a date window + name fragment, showing every
 *  parsed field so we can see how a planilla row was mapped. */
async function main() {
  const frag = (process.argv[2] ?? "SILVA").toUpperCase();
  const from = process.argv[3] ?? "2026-08-19";
  const to = process.argv[4] ?? "2026-08-21";
  const rows = await db.dailyCrewEntry.findMany({
    where: {
      date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
      fullName: { contains: frag, mode: "insensitive" },
    },
    orderBy: [{ date: "asc" }, { sheetName: "asc" }, { orderNumber: "asc" }],
  });
  console.log(`DailyCrewEntry matches for "${frag}" ${from}..${to}: ${rows.length}`);
  for (const r of rows) {
    console.log(JSON.stringify(r, null, 1));
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
