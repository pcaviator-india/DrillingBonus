import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { buildCalculationLinesCsv } from "@/lib/export/calculation-export";
import { csvContentDisposition } from "@/lib/csv";
import { formatDateUtc } from "@/lib/datetime";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (session?.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const url = new URL(_req.url);
  const details = url.searchParams.get("details") === "1";

  const calc = await db.bonusCalculation.findUnique({
    where: { id },
    include: {
      site: true,
      ruleSet: true,
      lines: { include: { employee: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!calc) {
    return new Response("Not found", { status: 404 });
  }

  const csv = buildCalculationLinesCsv(
    {
      id: calc.id,
      siteName: calc.site.name,
      ruleSetName: calc.ruleSet.name,
      ruleSetVersion: calc.ruleSet.version,
      periodStart: calc.periodStart,
      periodEnd: calc.periodEnd,
      status: calc.status,
      totalBonus: calc.totalBonus,
      createdAt: calc.createdAt,
    },
    calc.lines.map((line) => ({
      id: line.id,
      employeeName: line.employee.fullName,
      employeeRut: line.employee.rut,
      roleUsed: line.roleUsed,
      daysWorked: line.daysWorked,
      totalMeters: line.totalMeters,
      totalHours: line.totalHours,
      calculatedBonus: line.calculatedBonus,
      breakdown: line.breakdown as { components?: unknown; shifts?: unknown } | null,
    })),
    details,
  );

  const siteSlug = calc.site.name.replace(/[^a-zA-Z0-9]+/g, "_");
  const period = `${formatDateUtc(calc.periodStart)}_to_${formatDateUtc(calc.periodEnd)}`;
  const base = details ? "calculation_detail" : "calculation";
  const disposition = csvContentDisposition(`${base}_${siteSlug}_${period}`);

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": disposition,
    },
  });
}