import "dotenv/config";
import { db } from "../src/lib/db";

/** READ-ONLY: confirms the latest MV calc has no double Bono Metro for the
 * previously double-paid employee and reports his components. */
async function main() {
  const calc = await db.bonusCalculation.findFirst({
    orderBy: { createdAt: "desc" },
    include: { lines: { include: { employee: true } } },
  });
  if (!calc) throw new Error("No calculation found");
  type Comp = {
    bonusTypeCode: string;
    amount: number;
    details?: { shiftBreakdown?: Array<{ rate?: number }> };
  };
  let doubles = 0;
  for (const l of calc.lines) {
    const comps = (l.breakdown as { components?: Comp[] })?.components ?? [];
    const prod = comps.filter((c) => c.bonusTypeCode === "production_meter");
    if (prod.length >= 2) doubles++;
    if (!l.employee.fullName.includes("VEGA ESPINOZA")) continue;
    console.log(
      `JUAN | calc=${calc.id} bonus=${l.calculatedBonus} prodComponents=${prod.length} rates=${JSON.stringify(
        prod.map((c) => [...new Set((c.details?.shiftBreakdown ?? []).map((r) => r.rate ?? 0))]),
      )}`,
    );
  }
  console.log(`Double production_meter lines in latest calc: ${doubles} of ${calc.lines.length}`);
}

main()
  .catch((e) => {
    console.error("FAILED:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
