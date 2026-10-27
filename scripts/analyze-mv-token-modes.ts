import "dotenv/config";
import { db } from "../src/lib/db";
import { buildRoleTokenResolver } from "../src/lib/positions/registry";

/**
 * READ-ONLY impact analysis for fixing the double position-rule match
 * (same day/meters paid @750 + @500). Compares THREE role-token modes
 * against every employee in the latest MV calculation:
 *
 *  A. CURRENT  — union of all shift roles + Workera defaultRole (run.ts today)
 *  B. FALLBACK — union of shift roles; defaultRole only when NO shift roles
 *  C. PRIMARY  — only the most frequent shift role (engine's roleUsed);
 *                defaultRole only when NO shift roles
 *
 * For each mode: which of the 6 active rules apply, plus diffs vs current
 * showing exactly who would gain/lose a rule if the mode changes.
 */

async function main() {
  const sites = await db.site.findMany();
  const site = sites.find((s) => s.name.toLowerCase().includes("mantoverde"));
  if (!site) throw new Error("MV site not found");
  const ruleSet = await db.bonusRuleSet.findFirst({
    where: { siteId: site.id, isActive: true },
    include: { rules: { include: { bonusType: true } } },
  });
  if (!ruleSet) throw new Error("No active MV rule set");
  const calc = await db.bonusCalculation.findFirst({
    where: { siteId: site.id, ruleSetId: ruleSet.id },
    orderBy: { createdAt: "desc" },
    include: { lines: true },
  });
  if (!calc) throw new Error("No calculation found");

  const rules = ruleSet.rules.map((r) => ({
    id: r.id,
    code: r.bonusType.code,
    filter: r.positionFilter ?? [],
    exclude: r.positionExclude ?? [],
    notes: (r.notes ?? "").slice(0, 40),
  }));

  const applies = (rule: (typeof rules)[number], tokens: Set<string>): boolean => {
    if (rule.filter.length > 0 && !rule.filter.some((p) => tokens.has(p.toLowerCase()))) return false;
    if (rule.exclude.some((p) => tokens.has(p.toLowerCase()))) return false;
    return true;
  };

  const lineIds = calc.lines.map((l) => l.employeeId);
  const assignments = await db.crewAssignment.findMany({
    where: { employeeId: { in: lineIds }, date: { gte: calc.periodStart, lte: calc.periodEnd } },
    select: { employeeId: true, roleOnShift: true },
  });
  const emps = await db.employee.findMany({
    where: { id: { in: lineIds } },
    select: { id: true, fullName: true, defaultRole: { select: { name: true } } },
  });
  const empById = new Map(emps.map((e) => [e.id, e]));

  const shiftRolesBy = new Map<string, string[]>();
  const freqBy = new Map<string, Map<string, number>>();
  for (const a of assignments) {
    const e = empById.get(a.employeeId);
    const role = a.roleOnShift ?? e?.defaultRole?.name ?? "Unknown";
    const list = shiftRolesBy.get(a.employeeId) ?? [];
    if (!list.includes(role)) list.push(role);
    shiftRolesBy.set(a.employeeId, list);
    const freq = freqBy.get(a.employeeId) ?? new Map<string, number>();
    freq.set(role, (freq.get(role) ?? 0) + 1);
    freqBy.set(a.employeeId, freq);
  }

  const resolve = await buildRoleTokenResolver();
  const tokenSet = (roles: string[]): Set<string> =>
    new Set(roles.flatMap((r) => resolve(r)).map((t) => t.toLowerCase()));

  const modes: Record<string, (id: string) => string[]> = {
    A_current: (id) => {
      const shift = shiftRolesBy.get(id) ?? [];
      const def = empById.get(id)?.defaultRole?.name;
      return [...shift, ...(def ? [def] : [])];
    },
    B_fallback: (id) => {
      const shift = shiftRolesBy.get(id) ?? [];
      if (shift.length > 0) return shift;
      const def = empById.get(id)?.defaultRole?.name;
      return def ? [def] : [];
    },
    C_primary: (id) => {
      const freq = freqBy.get(id);
      if (freq && freq.size > 0) {
        let best = "";
        let bestN = -1;
        for (const [role, n] of freq) {
          if (n > bestN) {
            best = role;
            bestN = n;
          }
        }
        return [best];
      }
      const def = empById.get(id)?.defaultRole?.name;
      return def ? [def] : [];
    },
  };

  const results: Record<string, Map<string, { applicable: string[]; doubleProd: boolean }>> = {
    A_current: new Map(),
    B_fallback: new Map(),
    C_primary: new Map(),
  };

  for (const line of calc.lines) {
    const id = line.employeeId;
    for (const [mode, pick] of Object.entries(modes)) {
      const tokens = tokenSet(pick(id));
      const applicable = rules.filter((r) => applies(r, tokens)).map((r) => r.id);
      const prodCount = rules.filter((r) => r.code === "production_meter" && applicable.includes(r.id)).length;
      results[mode].set(id, { applicable, doubleProd: prodCount >= 2 });
    }
  }

  console.log(`Employees analyzed: ${calc.lines.length}`);
  for (const [mode, res] of Object.entries(results)) {
    const doubles = [...res.values()].filter((r) => r.doubleProd).length;
    console.log(`  mode ${mode}: double production_meter = ${doubles}`);
  }

  for (const mode of ["B_fallback", "C_primary"]) {
    console.log(`\n=== DIFF current(A) -> ${mode} ===`);
    let changes = 0;
    for (const line of calc.lines) {
      const a = results.A_current.get(line.employeeId)!;
      const b = results[mode].get(line.employeeId)!;
      const lost = a.applicable.filter((x) => !b.applicable.includes(x));
      const gained = b.applicable.filter((x) => !a.applicable.includes(x));
      if (lost.length === 0 && gained.length === 0) continue;
      changes++;
      const e = empById.get(line.employeeId);
      const lostN = lost.map((id) => rules.find((r) => r.id === id)?.notes).join(" / ");
      const gainedN = gained.map((id) => rules.find((r) => r.id === id)?.notes).join(" / ");
      console.log(
        `  ${e?.fullName ?? line.employeeId} [defaultRole=${e?.defaultRole?.name ?? "-"}; shiftRoles=[${(shiftRolesBy.get(line.employeeId) ?? []).join(", ")}]]` +
          (lostN ? `\n     LOST:  ${lostN}` : "") +
          (gainedN ? `\n     GAIN:  ${gainedN}` : ""),
      );
    }
    if (changes === 0) console.log("  (no applicability changes)");
  }

  console.log("\n=== Current doubles (should match the reported bug) ===");
  for (const line of calc.lines) {
    const a = results.A_current.get(line.employeeId)!;
    if (!a.doubleProd) continue;
    const e = empById.get(line.employeeId);
    console.log(
      `  ${e?.fullName ?? line.employeeId} | defaultRole=${e?.defaultRole?.name ?? "-"} | shiftRoles=[${(shiftRolesBy.get(line.employeeId) ?? []).join(", ")}]`,
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

