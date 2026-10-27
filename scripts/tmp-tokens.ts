import "dotenv/config";
import { db } from "../src/lib/db";
import { normalizeText } from "../src/lib/excel/normalize";

/** Dumps raw role-candidate sources for an employee (why group1+group2 both appear). */
async function main() {
  const nameq = (process.argv[2] ?? "ARIEL ANDRES SILVA").toUpperCase();
  const emps = await db.employee.findMany({
    where: { fullName: { contains: nameq, mode: "insensitive" } },
    include: { defaultRole: true },
  });
  for (const e of emps) {
    console.log(`EMP ${e.fullName} (${e.id}) jobPositionName=${e.jobPositionName ?? "-"} defaultRole=${e.defaultRole?.name ?? "-"}`);
    const assigns = await db.crewAssignment.findMany({
      where: { employeeId: e.id },
      orderBy: { date: "asc" },
      select: { date: true, roleOnShift: true, rig: { select: { name: true } } },
    });
    const roleCounts = new Map<string, number>();
    for (const a of assigns) roleCounts.set(a.roleOnShift ?? "(null)", (roleCounts.get(a.roleOnShift ?? "(null)") ?? 0) + 1);
    console.log(`  crew assignments: ${assigns.length}`);
    for (const [role, n] of roleCounts) console.log(`    roleOnShift="${role}" x${n}`);
    const distinctRoles = [...roleCounts.keys()].filter((r) => r !== "(null)");
    // Resolve tokens the same way run.ts does (shiftRoles only when present).
    const { buildRoleTokenResolver } = await import("../src/lib/positions/registry");
    const tokensFor = await buildRoleTokenResolver();
    const candidates = distinctRoles.length > 0 ? distinctRoles : [e.defaultRole?.name ?? ""].filter(Boolean);
    const tokens = [...new Set(candidates.flatMap((r) => tokensFor(r)))];
    console.log(`  roleCandidates: ${JSON.stringify(candidates)}`);
    console.log(`  tokens: ${JSON.stringify(tokens)}`);
    // Which PositionAlias rows back these roles?
    for (const r of candidates) {
      const alias = await db.positionAlias.findUnique({ where: { normalized: normalizeText(r) } });
      console.log(`  alias["${r}"] norm="${normalizeText(r)}" -> ${alias ? `groupId=${alias.groupId ?? "null"} displayName=${alias.displayName}` : "NOT REGISTERED"}`);
      if (alias?.groupId) {
        const g = await db.positionGroup.findUnique({ where: { id: alias.groupId } });
        console.log(`      group=${g?.key ?? "?"} (${g?.name ?? "?"})`);
      }
    }
    // Also check main position resolution
    const mainPos = await db.position.findMany({ where: { name: { contains: "Supervisor", mode: "insensitive" } } });
    for (const m of mainPos) console.log(`  mainPosition ${m.name} groupId=${m.groupId ?? "null"}`);
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
