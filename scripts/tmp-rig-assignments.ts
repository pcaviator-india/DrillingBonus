import "dotenv/config";
import { db } from "../src/lib/db";

/** Every CrewAssignment on a rig, with employee name + RUT + role, per date. */
async function main() {
  const rigName = process.argv[2] ?? "EDM-47K2";
  const rig = await db.rig.findFirst({ where: { name: rigName } });
  if (!rig) throw new Error(`rig ${rigName} not found`);
  const rows = await db.crewAssignment.findMany({
    where: { rigId: rig.id },
    orderBy: [{ date: "asc" }, { shift: "asc" }],
    include: { employee: { select: { fullName: true, rut: true, jobPositionName: true } } },
  });
  console.log(`Rig ${rigName} (${rig.id}) assignments: ${rows.length}`);
  const roleTally = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.employee.fullName} | role=${r.roleOnShift ?? "-"} | shift=${r.shift ?? "-"}`;
    roleTally.set(key, (roleTally.get(key) ?? 0) + 1);
  }
  for (const [k, n] of [...roleTally.entries()].sort()) console.log(`  ${n}x  ${k}`);
  console.log("\nBy date:");
  for (const r of rows) {
    console.log(
      `  ${r.date.toISOString().slice(0, 10)} ${r.shift} role=${r.roleOnShift} emp="${r.employee.fullName}" rut=${r.employee.rut}`,
    );
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
