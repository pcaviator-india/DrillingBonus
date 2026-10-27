import "dotenv/config";
import { db } from "../src/lib/db";

/** Reads the DailyCrewEntry source rows behind Ariel's crew assignments. */
async function main() {
  const assigns = await db.crewAssignment.findMany({
    where: { employeeId: "cmthqifo10046n0b45kcf5k3x" },
    orderBy: { date: "asc" },
  });
  const ids = assigns
    .map((a) => (a.rawData as { dailyCrewEntryId?: string } | null)?.dailyCrewEntryId)
    .filter((x): x is string => Boolean(x));
  const rows = await db.dailyCrewEntry.findMany({
    where: { id: { in: ids } },
    orderBy: { date: "asc" },
    select: {
      id: true, date: true, rut: true, rutNormalized: true, fullName: true,
      cargoRaw: true, machine: true, projectName: true, turnoAB: true, uploadId: true,
    },
  });
  console.log(`Source planilla rows: ${rows.length}`);
  const combos = new Map<string, number>();
  for (const r of rows) {
    const k = `${r.fullName} | rut=${r.rut ?? "?"} | cargo=${r.cargoRaw ?? "?"} | machine=${r.machine ?? "?"} | project=${r.projectName ?? "?"}`;
    combos.set(k, (combos.get(k) ?? 0) + 1);
  }
  for (const [k, n] of combos) console.log(`  ${k}  x${n}`);
  console.log("\nPer-row:");
  for (const r of rows) {
    console.log(`  ${r.date.toISOString().slice(0, 10)} name="${r.fullName}" rut=${r.rut ?? "?"} cargo="${r.cargoRaw}" machine=${r.machine} turnoAB=${r.turnoAB ?? "-"} upload=${r.uploadId}`);
  }
  // Which upload?
  const upIds = [...new Set(rows.map((r) => r.uploadId).filter((x): x is string => Boolean(x)))];
  for (const u of upIds) {
    const up = await db.excelUpload.findUnique({ where: { id: u }, select: { fileName: true, sheetName: true, projectName: true } });
    console.log(`\nUpload ${u}: file="${up?.fileName}" sheet="${up?.sheetName}" project="${up?.projectName}"`);
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
