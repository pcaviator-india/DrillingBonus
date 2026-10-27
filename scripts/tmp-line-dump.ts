import "dotenv/config";
import { db } from "../src/lib/db";

/** Full dump of a calculation line (components, details, snapshot tokens). */
async function main() {
  const nameq = (process.argv[2] ?? "ARIEL ANDRES SILVA").toUpperCase();
  const siteName = process.argv[3] ?? "Coipa";
  const site = await db.site.findFirst({ where: { name: { contains: siteName, mode: "insensitive" } } });
  if (!site) throw new Error("site not found");
  const calc = await db.bonusCalculation.findFirst({
    where: { siteId: site.id },
    orderBy: { createdAt: "desc" },
    include: { lines: { include: { employee: true } } },
  });
  if (!calc) throw new Error("no calc");
  const line = calc.lines.find((l) => l.employee.fullName.toUpperCase().includes(nameq));
  if (!line) throw new Error(`no line for ${nameq}`);
  console.log(`LINE ${line.employee.fullName} (${line.employee.rut}) job=${line.employee.jobPositionName}`);
  console.log(`roleUsed=${line.roleUsed} daysWorked=${line.daysWorked} total=${line.calculatedBonus}`);
  console.log(`breakdown keys: ${Object.keys((line.breakdown ?? {}) as object).join(", ")}`);
  console.log(JSON.stringify(line.breakdown, null, 1));

  const snap = calc.inputSnapshot as { input?: { employees?: Array<Record<string, unknown>> } } | null;
  const emp = (snap?.input?.employees ?? []).find((e) => e.employeeId === line.employeeId);
  console.log(`\nSNAPSHOT employee entry: ${JSON.stringify(emp, null, 1)}`);
}

main()
  .catch((e) => {
    console.error("FAILED:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
