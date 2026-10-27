import "dotenv/config";
import { db } from "../src/lib/db";
import { normalizeRut, normalizeText } from "../src/lib/excel/normalize";

/** Which DateRows did the pipeline parse for these RUTs/names? Shows the cargo
 *  the file claimed, the name written next to the RUT, and the resolved employee. */
async function main() {
  const ruts = (process.argv.slice(2).length ? process.argv.slice(2) : ["15613806-1", "14156135-9"]).map((r) => normalizeRut(r));
  const emps = await db.employee.findMany({ select: { id: true, fullName: true, rut: true, jobPositionName: true } });
  const byRut = new Map(emps.filter((e) => e.rut).map((e) => [normalizeRut(e.rut as string), e]));

  for (const rn of ruts) {
    const emp = byRut.get(rn);
    console.log(`\n=== RUT ${rn} -> employee: ${emp ? `${emp.fullName} (job=${emp.jobPositionName ?? "-"})` : "(none)"} ===`);
    const rows = await db.dailyCrewEntry.findMany({
      where: { rutNormalized: rn },
      orderBy: { date: "asc" },
    });
    console.log(`  DailyCrewEntry rows: ${rows.length}`);
    const tally = new Map<string, number>();
    for (const r of rows) {
      const k = `cargo="${r.cargoNormalized}" machine="${r.machine}" shift=${r.shiftDayNight} file=${r.uploadId.slice(0, 6)} name="${r.fullNameRaw ?? "-"}"`;
      tally.set(k, (tally.get(k) ?? 0) + 1);
    }
    for (const [k, n] of [...tally.entries()].sort()) console.log(`    ${n}x ${k}`);
    const sample = rows.slice(0, 3);
    for (const r of sample) {
      console.log(`    e.g. ${r.date.toISOString().slice(0, 10)} name="${r.fullNameRaw}" cargo="${r.cargoNormalized}" nameNorm="${r.nameNormalized}" mach="${r.machine}"->${r.rigId ? "mapped" : "UNMAPPED"} empId=${r.employeeId ?? "-"}`);
    }
    // Does the name written in the file belong to ANOTHER employee?
    const names = new Set(rows.map((r) => normalizeText(r.fullNameRaw ?? "")));
    for (const n of names) {
      if (!n) continue;
      const other = emps.find((e) => normalizeText(e.fullName) === n);
      console.log(`    file name "${n}" -> employee record: ${other ? `"${other.fullName}" rut=${other.rut}` : "(not in registry)"}`);
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
