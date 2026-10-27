import "dotenv/config";
import { db } from "../src/lib/db";

/**
 * Scope scan: for the latest calculation of a site, lists every line carrying
 * MORE THAN ONE production_meter component (i.e. paid several position-family
 * rules for the same month) and shows which rules produced them.
 */
async function main() {
  const siteName = process.argv[2] ?? "Coipa";
  const site = await db.site.findFirst({ where: { name: { contains: siteName, mode: "insensitive" } } });
  if (!site) throw new Error(`site ${siteName} not found`);

  const calc = await db.bonusCalculation.findFirst({
    where: { siteId: site.id },
    orderBy: { createdAt: "desc" },
    include: { lines: { include: { employee: { select: { fullName: true, rut: true, jobPositionName: true } } } }, ruleSet: { include: { rules: { include: { bonusType: true } } } } },
  });
  if (!calc) throw new Error("no calculation for site");

  const ruleById = new Map(calc.ruleSet.rules.map((r) => [r.id, r]));
  console.log(
    `SITE ${site.name} | CALC ${calc.id} ${calc.periodStart.toISOString().slice(0, 10)}..${calc.periodEnd.toISOString().slice(0, 10)} | lines=${calc.lines.length}`,
  );

  type Comp = { bonusTypeCode?: string; amount?: number; ruleId?: string; details?: Record<string, unknown> };
  let multi = 0;
  let multiTotal = 0;
  let singleTotal = 0;
  for (const line of [...calc.lines].sort((a, b) => b.calculatedBonus - a.calculatedBonus)) {
    const comps = ((line.breakdown as { components?: Comp } | null)?.components ?? []);
    const prod = comps.filter((c) => c.bonusTypeCode === "production_meter");
    if (prod.length > 1) {
      multi++;
      multiTotal += line.calculatedBonus;
      console.log(
        `\n  ${line.employee.fullName} (${line.employee.rut}) job=${line.employee.jobPositionName ?? "-"} roleUsed=${line.roleUsed} days=${line.daysWorked} TOTAL=${line.calculatedBonus.toFixed(0)}`,
      );
      for (const c of prod) {
        const params = (ruleById.get(c.ruleId ?? "")?.parameters ?? {}) as Record<string, unknown>;
        console.log(
          `      -> amount=${(c.amount ?? 0).toFixed(2)} rateKey=${String(params.rateKey ?? "-")} bestRig=${String(params.bestRigSelection ?? "-")} rule=${c.ruleId?.slice(0, 8)} notes="${(ruleById.get(c.ruleId ?? "")?.notes ?? "").slice(0, 60)}"`,
        );
      }
    } else {
      singleTotal += line.calculatedBonus;
    }
  }
  console.log(`\nLines with >1 production_meter component: ${multi} (sum of their totals ${multiTotal.toFixed(0)})`);
  console.log(`Lines with exactly 1 production component: ${calc.lines.length - multi} (sum ${singleTotal.toFixed(0)})`);
}

main()
  .catch((e) => {
    console.error("FAILED:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
