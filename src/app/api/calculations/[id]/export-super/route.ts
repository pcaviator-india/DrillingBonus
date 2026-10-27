import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import {
  buildCalculationSuperDetailWorkbook,
  type EngineInputSnapshot,
  type SuperDetailLine,
} from "@/lib/export/calculation-super-detail";
import { formatDateUtc } from "@/lib/datetime";

/**
 * Super detailed export (Excel): one sheet per employee with per-day,
 * per-tramo arithmetic, plus summary and rate-table sheets.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (session?.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
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

  const snapshot = calc.inputSnapshot as { input?: EngineInputSnapshot } | null;
  const engineInput = snapshot?.input ?? null;

  const lines: SuperDetailLine[] = calc.lines.map((line) => ({
    employeeId: line.employeeId,
    employeeName: line.employee.fullName,
    employeeRut: line.employee.rut,
    roleUsed: line.roleUsed,
    daysWorked: line.daysWorked,
    totalMeters: line.totalMeters,
    totalHours: line.totalHours,
    calculatedBonus: line.calculatedBonus,
    breakdown: (line.breakdown ?? null) as SuperDetailLine["breakdown"],
  }));

  const buffer = await buildCalculationSuperDetailWorkbook(
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
    lines,
    engineInput,
  );

  const siteSlug = calc.site.name.replace(/[^a-zA-Z0-9]+/g, "_");
  const period = `${formatDateUtc(calc.periodStart)}_to_${formatDateUtc(calc.periodEnd)}`;
  const base = `calculation_super_detail_${siteSlug}_${period}`.replace(/[^a-zA-Z0-9_-]+/g, "_");

  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}.xlsx"`,
    },
  });
}