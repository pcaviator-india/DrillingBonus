import "dotenv/config";
import { db } from "../src/lib/db";

/** Dumps the persisted rawData of CrewAssignment rows for a name fragment —
 *  the exact parsed row that produced each role (audit trail). */
async function main() {
  const frag = (process.argv[2] ?? "ARIEL").toUpperCase();
  const emps = await db.employee.findMany({
    where: { fullName: { contains: frag, mode: "insensitive" } },
  });
  for (const e of emps) {
    const assigns = await db.crewAssignment.findMany({
      where: { employeeId: e.id },
      orderBy: { date: "asc" },
      include: { rig: { select: { name: true } } },
    });
    console.log(`\nEMP "${e.fullName}" (${e.rut}) — ${assigns.length} assignments`);
    for (const a of assigns) {
      console.log(
        `  ${a.date.toISOString().slice(0, 10)} rig=${a.rig?.name} shift=${a.shift} role=${a.roleOnShift} raw=${JSON.stringify(a.rawData)}`,
      );
    }
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
