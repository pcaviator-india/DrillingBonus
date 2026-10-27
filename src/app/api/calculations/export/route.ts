import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { buildCalculationsSummariesCsv } from "@/lib/export/calculation-export";
import { csvContentDisposition } from "@/lib/csv";

export async function GET() {
  const session = await auth();
  if (session?.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const calcs = await db.bonusCalculation.findMany({
    orderBy: { createdAt: "desc" },
    include: { site: true, ruleSet: true },
  });

  const csv = buildCalculationsSummariesCsv(
    calcs.map((c) => ({
      id: c.id,
      siteName: c.site.name,
      ruleSetName: c.ruleSet.name,
      ruleSetVersion: c.ruleSet.version,
      periodStart: c.periodStart,
      periodEnd: c.periodEnd,
      status: c.status,
      totalBonus: c.totalBonus,
      createdAt: c.createdAt,
    })),
  );

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": csvContentDisposition("all_calculations"),
    },
  });
}