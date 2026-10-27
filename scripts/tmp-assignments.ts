import "dotenv/config";
import { db } from "../src/lib/db";

/** Dumps every CrewAssignment for the employees matching a name fragment,
 *  including rig, shift, role and the source the assignment came from. */
async function main() {
  const frag = (process.argv[2] ?? "ARIEL").toUpperCase();
  const emps = await db.employee.findMany({
    where: { fullName: { contains: frag, mode: "insensitive" } },
    orderBy: { fullName: "asc" },
  });
  console.log(`Employees matching "${frag}": ${emps.length}`);
  for (const e of emps) {
    const assigns = await db.crewAssignment.findMany({
      where: { employeeId: e.id },
      orderBy: [{ date: "asc" }, { rigId: "asc" }],
      include: { rig: { select: { name: true } } },
    });
    console.log(
      `\nEMP "${e.fullName}" id=${e.id} rut=${e.rut ?? "-"} job=${e.jobPositionName ?? "-"} -> ${assigns.length} assignments`,
    );
    for (const a of assigns) {
      console.log(
        `  ${a.date.toISOString().slice(0, 10)} rig=${a.rig?.name ?? "-"} shift=${a.shift ?? "-"} role=${a.roleOnShift ?? "-"} source=${a.source ?? "-"}`,
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
