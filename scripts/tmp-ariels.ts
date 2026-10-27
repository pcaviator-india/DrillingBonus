import "dotenv/config";
import { db } from "../src/lib/db";
import { normalizeRut } from "../src/lib/excel/normalize";

/** Dumps EVERY employee whose name contains a fragment (default "ARIEL"),
 *  with identity, planilla rows and crew assignments, plus which calculation
 *  lines they own — to tell multiple similar-named people apart. */
async function main() {
  const nameq = (process.argv[2] ?? "ARIEL").toUpperCase();
  const emps = await db.employee.findMany({
    where: { fullName: { contains: nameq, mode: "insensitive" } },
    include: { defaultRole: true },
    orderBy: { fullName: "asc" },
  });
  console.log(`Employees matching "${nameq}": ${emps.length}`);
  for (const e of emps) {
    console.log(`\nEMP "${e.fullName}" id=${e.id} rut=${e.rut ?? "-"} jobPosition=${e.jobPositionName ?? "-"} defaultRole=${e.defaultRole?.name ?? "-"} site=${e.siteId ?? "-"}`);
    const rn = e.rut ? normalizeRut(e.rut) : null;
    if (rn) {
      const entries = await db.dailyCrewEntry.findMany({
        where: { rutNormalized: rn },
        orderBy: { date: "asc" },
        select: { date: true, fullName: true, cargoRaw: true, machine: true, projectName: true },
      });
      console.log(`  DailyCrewEntry by RUT ${rn}: ${entries.length} rows`);
      const byCargo = new Map<string, number>();
      for (const en of entries) byCargo.set(en.cargoRaw ?? "(null)", (byCargo.get(en.cargoRaw ?? "(null)") ?? 0) + 1);
      for (const [c, n] of byCargo) console.log(`    cargo="${c}" x${n}`);
      const byName = new Map<string, number>();
      for (const en of entries) byName.set(en.fullName, (byName.get(en.fullName) ?? 0) + 1);
      for (const [nm, n] of byName) console.log(`    planillaName="${nm}" x${n}`);
    }
    // Planilla rows whose NAME matches but RUT may differ
    const byNameOnly = await db.dailyCrewEntry.findMany({
      where: { fullName: { contains: nameq, mode: "insensitive" } },
      orderBy: { date: "asc" },
      select: { date: true, rut: true, rutNormalized: true, fullName: true, cargoRaw: true, projectName: true },
    });
    if (byNameOnly.length > 0) {
      console.log(`  DailyCrewEntry by NAME "${nameq}": ${byNameOnly.length} rows`);
      const combos = new Map<string, number>();
      for (const en of byNameOnly) {
        const k = `${en.fullName} | rut=${en.rut ?? "-"} | cargo=${en.cargoRaw ?? "-"} | project=${en.projectName ?? "-"}`;
        combos.set(k, (combos.get(k) ?? 0) + 1);
      }
      for (const [k, n] of combos) console.log(`    ${k} x${n}`);
    }
    const assigns = await db.crewAssignment.findMany({
      where: { employeeId: e.id },
      orderBy: { date: "asc" },
      select: { date: true, shift: true, roleOnShift: true, rig: { select: { name: true } } },
    });
    const roleCounts = new Map<string, number>();
    for (const a of assigns) roleCounts.set(a.roleOnShift ?? "(null)", (roleCounts.get(a.roleOnShift ?? "(null)") ?? 0) + 1);
    console.log(`  CrewAssignments: ${assigns.length} | roles: ${[...roleCounts].map(([r, n]) => `${r}x${n}`).join(", ") || "-"}`);
    const dateRange = assigns.length ? `${assigns[0].date.toISOString().slice(0, 10)}..${assigns[assigns.length - 1].date.toISOString().slice(0, 10)}` : "-";
    console.log(`    dateRange: ${dateRange}`);
  }

  // Which of these owns lines in calculations (latest 5 for any site)?
  console.log("\n--- CALCULATION LINES (latest 10 calcs) ---");
  const calcs = await db.bonusCalculation.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { site: true, lines: { include: { employee: true } } },
  });
  for (const c of calcs) {
    for (const l of c.lines) {
      if (!l.employee.fullName.toUpperCase().includes(nameq)) continue;
      const comps = (l.breakdown as { components?: Array<{ bonusTypeCode?: string; amount?: number }> } | null)?.components ?? [];
      const prods = comps.filter((c2) => c2.bonusTypeCode === "production_meter");
      console.log(
        `  calc ${c.id} (${c.site.name} ${c.periodStart.toISOString().slice(0, 10)}..${c.periodEnd.toISOString().slice(0, 10)}) "${l.employee.fullName}" id=${l.employeeId} roleUsed="${l.roleUsed}" total=${l.calculatedBonus} prodComps=${prods.length} amounts=[${prods.map((p) => p.amount).join(", ")}]`,
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
