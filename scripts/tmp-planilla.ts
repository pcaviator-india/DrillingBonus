import "dotenv/config";
import { db } from "../src/lib/db";
import { normalizeRut } from "../src/lib/excel/normalize";

/** Dumps planilla (DailyCrewEntry) rows + crew assignments for an employee. */
async function main() {
  const nameq = (process.argv[2] ?? "ARIEL ANDRES SILVA").toUpperCase();
  const emps = await db.employee.findMany({
    where: { fullName: { contains: nameq, mode: "insensitive" } },
  });
  for (const e of emps) {
    console.log(`EMP ${e.fullName} rut=${e.rut ?? "-"} (${e.id}) jobPosition=${e.jobPositionName ?? "-"}`);
    const rn = e.rut ? normalizeRut(e.rut) : null;
    if (rn) {
      const entries = await db.dailyCrewEntry.findMany({
        where: { rutNormalized: rn },
        orderBy: { date: "asc" },
        select: { date: true, cargoRaw: true, cargoNormalized: true, machine: true, projectName: true },
      });
      console.log(`  DailyCrewEntry rows by RUT: ${entries.length}`);
      const byCargo = new Map<string, number>();
      for (const en of entries) byCargo.set(en.cargoRaw ?? "(null)", (byCargo.get(en.cargoRaw ?? "(null)") ?? 0) + 1);
      for (const [c, n] of byCargo) console.log(`    cargo="${c}" x${n}`);
      for (const en of entries.slice(0, 40)) {
        console.log(`    ${en.date.toISOString().slice(0, 10)} cargo="${en.cargoRaw}" machine=${en.machine ?? "?"} project=${en.projectName ?? "-"}`);
      }
    }
    const assigns = await db.crewAssignment.findMany({
      where: { employeeId: e.id },
      orderBy: { date: "asc" },
      select: { date: true, shift: true, roleOnShift: true, rig: { select: { name: true } } },
    });
    console.log(`  CrewAssignment rows: ${assigns.length}`);
    for (const a of assigns) {
      console.log(`    ${a.date.toISOString().slice(0, 10)} ${a.shift} role="${a.roleOnShift}" rig=${a.rig.name}`);
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
