import { syncEmployeesFromWorkera, syncAttendanceFromWorkera } from "../src/lib/workera/sync";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Running employee sync (mock Workera)...");
  const emp = await syncEmployeesFromWorkera();
  console.log("Result:", emp);

  console.log("Running attendance sync (mock Workera) for current month...");
  const now = new Date();
  const from = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const to = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-28`;
  const att = await syncAttendanceFromWorkera(from, to);
  console.log("Result:", att);

  const counts = {
    employees: await prisma.employee.count(),
    roles: await prisma.role.count(),
    sites: await prisma.site.count(),
    attendance: await prisma.attendanceRecord.count(),
  };
  console.log("DB counts:", counts);
  if (counts.employees === 0 || counts.attendance === 0) {
    throw new Error("Sync verification failed");
  }
  console.log("✅ End-to-end sync verified.");
}

main()
  .catch((e) => {
    console.error("❌", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
