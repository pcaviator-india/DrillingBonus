import "dotenv/config";
import { db } from "../src/lib/db";

/**
 * Prints the registered RUT of each name given on the command line (comma or
 * pipe separated), so a planilla row group can be checked against the registry.
 * Usage: npx tsx scripts/tmp-names-to-rut.ts "Ulinson Diaz Cortes" "Leonel Campusano"
 */
async function main() {
  const names = process.argv.slice(2);
  const employees = await db.employee.findMany({
    select: { fullName: true, rut: true, jobPositionName: true, siteId: true },
  });
  const norm = (v: string) => v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  for (const n of names) {
    const key = norm(n);
    const hits = employees.filter((e) => norm(e.fullName).includes(key) || key.includes(norm(e.fullName)));
    console.log(
      `"${n}" -> ${hits.length ? hits.map((h) => `${h.fullName} | RUT ${h.rut} | ${h.jobPositionName ?? "-"}`).join("  //  ") : "(not registered)"}`,
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
