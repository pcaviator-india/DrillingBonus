import "dotenv/config";
import { db } from "../src/lib/db";

/** Dumps the FULL breakdown JSON of one employee's latest Coipa line. */
async function main() {
  const name = (process.argv[2] ?? "ARIEL ANDRES SILVA").toUpperCase();
  const site = await db.site.findFirst({ where: { name: { contains: "Coipa", mode: "insensitive" } } });
  const rs = await db.bonusRuleSet.findFirst({ where: { siteId: site!.id, isActive: true }, include: { rules: { include: { bonusType: true } } } });
  const calc = await db.bonusCalculation.findFirst({
    where: { siteId: site!.id, ruleSetId: rs!.id },
    orderBy: { createdAt: "desc" },
    include: { lines: { include: { employee: true } } },
  });
  const line = calc!.lines.find((l) => l.employee.fullName.toUpperCase().includes(name))!;
  console.log(`LINE ${line.employee.fullName} roleUsed=${line.roleUsed} total=${line.calculatedBonus}`);
  console.log(JSON.stringify(line.breakdown, null, 2));
  console.log(`\nRULES (${rs!.rules.length}):`);
  for (const r of rs!.rules) {
    console.log(`  [${r.bonusType.code}] pri=${r.priority} filter=${JSON.stringify(r.positionFilter)} excludeLen=${(r.positionExclude ?? []).length}`);
    if (r.bonusType.code === "production_meter") {
      const p = r.parameters as Record<string, unknown>;
      console.log(`     bestRig=${String(p.bestRigSelection)} rateKey=${String(p.rateKey)} prorate=${JSON.stringify(p.attendanceProrate ?? null)}`);
      const table = p.rateTable as Record<string, Record<string, Record<string, number>>> | undefined;
      if (table) {
        for (const [type, bands] of Object.entries(table)) {
          console.log(`     ${type}: ${Object.entries(bands).map(([band, rates]) => `${band}=${JSON.stringify(rates)}`).join(" ")}`);
        }
      }
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
