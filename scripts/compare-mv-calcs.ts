import "dotenv/config";
import { db } from "../src/lib/db";

/**
 * READ-ONLY: diffs the two most recent MV calculations per employee.
 * Used to prove a fix only changes the intended employee(s).
 * Usage: npx tsx scripts/compare-mv-calcs.ts [olderId] [newerId]
 */
async function main() {
  const site = (await db.site.findMany()).find((s) =>
    s.name.toLowerCase().includes("mantoverde"),
  );
  if (!site) throw new Error("MV site not found");
  const calcs = await db.bonusCalculation.findMany({
    where: { siteId: site.id },
    orderBy: { createdAt: "desc" },
    take: 2,
  });
  const [newer, older] =
    process.argv.length >= 4
      ? [
          await db.bonusCalculation.findUniqueOrThrow({ where: { id: process.argv[3] } }),
          await db.bonusCalculation.findUniqueOrThrow({ where: { id: process.argv[2] } }),
        ]
      : calcs.length >= 2
        ? calcs
        : (() => {
            throw new Error("Need two calculations to compare");
          })();
  console.log(`OLDER: ${older.id} created ${older.createdAt.toISOString()} total=${older.totalBonus}`);
  console.log(`NEWER: ${newer.id} created ${newer.createdAt.toISOString()} total=${newer.totalBonus}`);

  const [oldLines, newLines] = await Promise.all([
    db.bonusCalculationLine.findMany({ where: { calculationId: older.id } }),
    db.bonusCalculationLine.findMany({ where: { calculationId: newer.id } }),
  ]);
  const emps = await db.employee.findMany({
    where: { id: { in: [...new Set([...oldLines, ...newLines].map((l) => l.employeeId))] } },
    select: { id: true, fullName: true },
  });
  const name = new Map(emps.map((e) => [e.id, e.fullName]));

  const oldBy = new Map(oldLines.map((l) => [l.employeeId, l.calculatedBonus]));
  const newBy = new Map(newLines.map((l) => [l.employeeId, l.calculatedBonus]));
  const ids = new Set([...oldBy.keys(), ...newBy.keys()]);
  let diffs = 0;
  for (const id of ids) {
    const a = oldBy.get(id) ?? 0;
    const b = newBy.get(id) ?? 0;
    if (Math.abs(a - b) < 0.005) continue;
    diffs++;
    console.log(`  DELTA ${name.get(id) ?? id}: ${a} -> ${b} (${(b - a).toFixed(2)})`);
  }
  console.log(diffs === 0 ? "No per-employee differences." : `${diffs} employee(s) changed.`);
}

main()
  .catch((e) => {
    console.error("FAILED:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
