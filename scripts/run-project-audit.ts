import "dotenv/config";
import { auditEmployeeProjects } from "../src/lib/employee-project-audit/audit";
async function main() {
  const rows = await auditEmployeeProjects("2026-08-01", "2026-08-31");
  const counts = rows.reduce<Record<string, number>>((a, r) => { a[r.status] = (a[r.status] ?? 0) + 1; return a; }, {});
  console.log(JSON.stringify({ total: rows.length, counts, issues: rows.filter((r) => r.status !== "correct") }, null, 2));
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
