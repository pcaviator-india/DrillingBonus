import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildComparisonCsv } from "@/lib/export/comparison-export";
import { csvContentDisposition } from "@/lib/csv";
import { z } from "zod";

// Schema for query parameters
const QuerySchema = z.object({
  batchIds: z.array(z.string()).optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be in YYYY-MM format").optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be in YYYY-MM-DD format").optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be in YYYY-MM-DD format").optional(),
});

export async function GET(request: Request) {
  if ((await auth())?.user.role !== "admin") return new Response("Unauthorized", { status: 401 });
  
  // Parse query parameters
  const { searchParams } = new URL(request.url);
  const batchIdsParam = searchParams.getAll("batchIds");
  const month = searchParams.get("month");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  
  const queryParams = {
    batchIds: batchIdsParam.length > 0 ? batchIdsParam : undefined,
    month: month || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  };
  
  const parsed = QuerySchema.safeParse(queryParams);
  if (!parsed.success) {
    return new Response("Invalid query parameters", { status: 400 });
  }
  
  const { batchIds, month: monthFilter, startDate: start, endDate: end } = parsed.data;
  
  // Build where clause for filtering
  const where: Record<string, unknown> = {};
  
  // Filter by batch IDs if provided
  if (batchIds && batchIds.length > 0) {
    // Parse batch IDs (format: "calculationId:planillaCalculationId"; null planilla is the string "null")
    const batchConditions = batchIds.map(batchId => {
      const [calcId, planillaId] = batchId.split(":");
      return {
        calculationId: calcId,
        planillaCalculationId: planillaId && planillaId !== "null" ? planillaId : null
      };
    });
    
    where.OR = batchConditions;
  }
  
  // Filter by calculation period — the row's own periodStart/periodEnd (indexed),
  // i.e. the date range the calculation covers, NOT the row creation date.
  if (monthFilter) {
    const [year, month] = monthFilter.split("-").map(Number);
    const startDateObj = new Date(Date.UTC(year, month - 1, 1)); // First day of month (UTC)
    const endDateObj = new Date(Date.UTC(year, month, 0)); // Last day of month (UTC)
    
    where.periodStart = {
      gte: startDateObj,
      lte: endDateObj
    };
  } else if (start || end) {
    const periodFilter: Record<string, Date> = {};
    
    if (start) {
      periodFilter.gte = new Date(`${start}T00:00:00.000Z`);
    }
    
    if (end) {
      periodFilter.lte = new Date(`${end}T00:00:00.000Z`);
    }
    
    where.periodStart = periodFilter;
  }
  
  // Select only export columns. Loading the full comparison row can fail when
  // legacy JSON fields contain values that the current Prisma/Neon client
  // cannot decode; the export does not need those fields.
  const rows = await db.calculationComparison.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      periodStart: true,
      periodEnd: true,
      calculationId: true,
      planillaCalculationId: true,
      employeeId: true,
      workeraDays: true,
      planillaDays: true,
      workeraBonus: true,
      planillaBonus: true,
      difference: true,
      reviewStatus: true,
      reviewNote: true,
      finalSource: true,
      finalDays: true,
      finalBonus: true,
      finalResolution: true,
      adjustmentNote: true,
      adjustedById: true,
      adjustedAt: true,
      calculation: { 
        select: { 
          site: { select: { name: true } }
        } 
      },
      employee: { select: { fullName: true, defaultRole: { select: { name: true } } } },
    },
  });
  
  const calculationSites = await db.bonusCalculation.findMany({ 
    select: { 
      id: true, 
      site: { select: { name: true } } 
    } 
  });
  
  const siteByCalculationId = new Map(calculationSites.map((c) => [c.id, c.site.name]));
  
  const csv = buildComparisonCsv(rows.map((r) => ({
    createdAt: r.createdAt,
    project: r.calculation.site.name,
    planillaProject: r.planillaCalculationId ? siteByCalculationId.get(r.planillaCalculationId) ?? "" : "",
    siteMismatch: Boolean(r.planillaCalculationId && siteByCalculationId.get(r.planillaCalculationId) !== r.calculation.site.name),
    employee: r.employee.fullName,
    cargo: r.employee.defaultRole?.name ?? "",
    workeraDays: r.workeraDays,
    planillaDays: r.planillaDays,
    workeraBonus: r.workeraBonus,
    planillaBonus: r.planillaBonus,
    difference: r.difference,
    reviewStatus: r.reviewStatus,
    reviewNote: r.reviewNote,
    workeraCalculationId: r.calculationId,
    planillaCalculationId: r.planillaCalculationId,
    // Add period dates to export row (calculation period, not creation date)
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    finalSource: r.finalSource,
    finalDays: r.finalDays,
    finalBonus: r.finalBonus,
    finalResolution: r.finalResolution,
    adjustmentNote: r.adjustmentNote,
    adjustedById: r.adjustedById,
    adjustedAt: r.adjustedAt,

  })));
  
  // Generate filename with filters
  let filename = "comparisons";
  if (monthFilter) {
    filename += `_${monthFilter}`;
  } else if (start || end) {
    filename += `_${start || "start"}_to_${end || "end"}`;
  }
  if (batchIds && batchIds.length > 0) {
    filename += `_batches-${batchIds.length}`;
  }
  
  return new Response(csv, { 
    headers: { 
      "Content-Type": "text/csv; charset=utf-8", 
      "Content-Disposition": csvContentDisposition(filename) 
    } 
  });
}
