"use server";


export async function loadComparisonBatches() {
  const rows = await prisma.calculationComparison.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      calculation: { include: { site: true } },
      employee: { include: { defaultRole: true } },
    },
    take: 1000,
  });

  // Group into batches by calculation pair
  const batchesMap = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.calculationId}:${row.planillaCalculationId}`;
    const batch = batchesMap.get(key) ?? [];
    batch.push(row);
    batchesMap.set(key, batch);
  }

  return [...batchesMap.entries()].map(([key, batchRows]) => {
    const first = batchRows[0];
    const siteName = first?.calculation?.site?.name ?? "Unknown";
    const periodStart = first?.periodStart ? new Date(first.periodStart).toISOString().slice(0, 10) : "";
    const periodEnd = first?.periodEnd ? new Date(first.periodEnd).toISOString().slice(0, 10) : "";
    const label = `${siteName} | ${periodStart} → ${periodEnd} (${batchRows.length} rows)`;
    return {
      key,
      label,
      rows: batchRows.map((r) => ({
        createdAt: r.createdAt,
        project: r.calculation?.site?.name ?? "",
        planillaProject: r.planillaCalculationId ? (r.calculation?.site?.name ?? "") : "",
        siteMismatch: false,
        employee: r.employee?.fullName ?? "",
        cargo: r.employee?.defaultRole?.name ?? "",
        workeraDays: r.workeraDays,
        planillaDays: r.planillaDays,
        workeraBonus: r.workeraBonus,
        planillaBonus: r.planillaBonus,
        difference: r.difference,
        reviewStatus: r.reviewStatus,
        reviewNote: r.reviewNote,
        workeraCalculationId: r.calculationId,
        planillaCalculationId: r.planillaCalculationId,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        finalSource: r.finalSource,
        finalDays: r.finalDays,
        finalBonus: r.finalBonus,
        finalResolution: r.finalResolution,
        adjustmentNote: r.adjustmentNote,
        adjustedById: r.adjustedById,
        adjustedAt: r.adjustedAt,
      })),
    };
  });
}
import { db as prisma } from "@/lib/db";
import { resolveFinalRow, applyChileChicoCorrection } from "@/lib/calculations/final-resolution";

export async function saveAdjustments(
  rows: Array<{ id: string; selection: "P" | "W" | "blank"; cargo: string; note?: string }>,
  adjustedById?: string,
  chileLocoMultiplier?: number
) {
  const results = [];

  for (const row of rows) {
    const comparison = await prisma.calculationComparison.findUnique({
      where: { id: row.id },
      include: { site: true },
    });

    if (!comparison) {
      console.warn(`Comparison row ${row.id} not found, skipping`);
      continue;
    }

    const siteName = comparison.site?.name ?? "";
    const planillaBonus = comparison.planillaBonus;

    const resolveResult = resolveFinalRow(
      {
        createdAt: comparison.createdAt,
        project: "",
        planillaProject: "",
        siteMismatch: false,
        employee: "",
        cargo: row.cargo,
        workeraDays: comparison.workeraDays,
        planillaDays: comparison.planillaDays,
        workeraBonus: comparison.workeraBonus,
        planillaBonus: comparison.planillaBonus,
        difference: comparison.difference,
        reviewStatus: comparison.reviewStatus,
        reviewNote: comparison.reviewNote,
        workeraCalculationId: comparison.calculationId,
        planillaCalculationId: comparison.planillaCalculationId,
        periodStart: comparison.periodStart,
        periodEnd: comparison.periodEnd,
        finalSource: comparison.finalSource,
        finalDays: comparison.finalDays,
        finalBonus: comparison.finalBonus,
        finalResolution: comparison.finalResolution,
        adjustmentNote: comparison.adjustmentNote,
        adjustedById: comparison.adjustedById,
        adjustedAt: comparison.adjustedAt,
      },
      row.selection,
      row.cargo,
      planillaBonus
    );

    let finalBonus = resolveResult.finalBonus;
    if (resolveResult.finalResolution !== "needs_meters" && chileLocoMultiplier && chileLocoMultiplier > 1) {
      finalBonus = applyChileChicoCorrection(finalBonus, siteName, chileLocoMultiplier);
    }

    const updated = await prisma.calculationComparison.update({
      where: { id: row.id },
      data: {
        finalSource: resolveResult.finalSource,
        finalDays: resolveResult.finalDays,
        finalBonus,
        finalResolution: resolveResult.finalResolution,
        adjustmentNote: row.note ?? null,
        adjustedById: adjustedById ?? null,
        adjustedAt: new Date(),
      },
    });

    results.push(updated);
  }

  return results;
}


export async function parseComparisonFile(formData: FormData) {
  const file = formData.get("file") as File | null;
  if (!file) throw new Error("No file provided");
  const buffer = Buffer.from(await file.arrayBuffer()) as any;
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];

  const headerRow = ws.getRow(1);
  const headers = ((headerRow.values as any) ?? []).map((h: any) => String(h ?? "").trim());
  const idx = (name: string) => headers.findIndex((h: any) => String(h).toLowerCase() === name.toLowerCase());

  const batchesMap = new Map<string, any[]>();
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const vals = (row.values as any) ?? [];
    const calcId = vals[idx("Workera calculation ID")];
    if (!calcId) return;
    const selectedRaw = vals[idx("Selected")];
    const selected = selectedRaw ? String(selectedRaw).trim().toUpperCase() : "";
    const planillaId = vals[idx("Planilla calculation ID")];
    const selectedNorm = selected === "P" || selected === "W" ? selected : (selected === "BLANK" || selected === "AUTO" ? "blank" : null);
    const key = `${calcId}:${planillaId ?? ""}`;
    const batch = batchesMap.get(key) ?? [];
    batch.push({
      createdAt: vals[idx("Created")] ? new Date(vals[idx("Created")] as any) : new Date(),
      project: String(vals[idx("Workera project")] ?? ""),
      planillaProject: String(vals[idx("Planilla project")] ?? ""),
      siteMismatch: String(vals[idx("Site mismatch")] ?? "").toLowerCase() === "yes",
      employee: String(vals[idx("Employee")] ?? ""),
      cargo: String(vals[idx("Cargo")] ?? ""),
      workeraDays: Number(vals[idx("Workera days")] ?? 0),
      planillaDays: Number(vals[idx("Planilla days")] ?? 0),
      workeraBonus: Number(vals[idx("Workera bonus")] ?? 0),
      planillaBonus: Number(vals[idx("Planilla bonus por pagar")] ?? 0),
      difference: Number(vals[idx("Difference")] ?? 0),
      reviewStatus: String(vals[idx("Review status")] ?? "pending"),
      reviewNote: vals[idx("Review note")] ?? null,
      workeraCalculationId: String(calcId),
      planillaCalculationId: planillaId ? String(planillaId) : null,
      periodStart: vals[idx("Period Start")] ? new Date(vals[idx("Period Start")] as any) : new Date(),
      periodEnd: vals[idx("Period End")] ? new Date(vals[idx("Period End")] as any) : new Date(),
      finalSource: null,
      finalDays: null,
      finalBonus: null,
      finalResolution: selectedNorm,
      adjustmentNote: null,
      adjustedById: null,
      adjustedAt: null,
    });
    batchesMap.set(key, batch);
  });

  return [...batchesMap.entries()].map(([key, rows]) => {
    const first = rows[0];
    const siteName = first?.project ?? "Unknown";
    const ps = first?.periodStart ? new Date(first.periodStart).toISOString().slice(0, 10) : "";
    const pe = first?.periodEnd ? new Date(first.periodEnd).toISOString().slice(0, 10) : "";
    return {
      key,
      label: `${siteName} | ${ps} → ${pe} (${rows.length} rows)`,
      rows,
    };
  });
}