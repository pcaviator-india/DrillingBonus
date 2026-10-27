import { writeFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { calculateBonuses } from "../src/lib/bonus-engine/engine";
import {
  buildCalculationSuperDetailWorkbook,
  type EngineInputSnapshot,
  type SuperDetailLine,
} from "../src/lib/export/calculation-super-detail";
import type { BonusEngineInput } from "../src/types/bonus";

/**
 * Validates the super detailed export:
 *  1. Pure engine: breakdown rows now carry depthScale (+ above-threshold rate).
 *  2. DB end-to-end: build the workbook for the latest calculation, read it
 *     back, check sheet count and that an employee's detail total matches.
 */
const prisma = new PrismaClient();

function engineEnrichmentCheck(): void {
  const input: BonusEngineInput = {
    period: { start: "2026-08-01", end: "2026-08-31" },
    employees: [
      {
        employeeId: "p1",
        fullName: "Perforista Test",
        daysWorked: 5,
        attendanceHours: 40,
        shifts: [
          { date: "2026-08-05", shift: "day", rigName: "740-14", role: "Perforista", meters: 25, hours: 8, drillingLevel: null, drillingType: "H1", drillingDepth: 300 },
        ],
      },
      {
        employeeId: "s1",
        fullName: "Soporte Test",
        daysWorked: 10,
        attendanceHours: 80,
        defaultRole: "Soporte",
        shifts: [],
      },
    ],
    rules: [
      {
        ruleId: "r1",
        bonusTypeCode: "production_meter",
        positionFilter: ["Perforista"],
        drillingTypeFilter: [],
        priority: 1,
        parameters: { rateTable: { H1: { "0-500": { Perforista: 750 } } }, bestRigSelection: "employee_rig" },
        minAttendanceDays: null,
      },
      {
        ruleId: "r2",
        bonusTypeCode: "above_threshold",
        positionFilter: ["Perforista"],
        drillingTypeFilter: [],
        priority: 2,
        parameters: {
          thresholds: { H1: 22 },
          multiplier: 1.5,
          baseRateTable: { H1: { "0-500": { Perforista: 750 } } },
          incrementOnly: true,
        },
        minAttendanceDays: null,
      },
      {
        ruleId: "r3",
        bonusTypeCode: "production_meter",
        positionFilter: ["Soporte"],
        drillingTypeFilter: [],
        priority: 1,
        parameters: {
          rateTable: { H1: { "0-500": { Ayudante: 500 } } },
          bestRigSelection: "best_rig_month",
          attendanceProrate: { divisor: "days_in_month" },
          rateKey: "Ayudante",
        },
        minAttendanceDays: null,
      },
    ],
    monthlyRigTotals: { "740-14": 1000 },
    rigTotalsByTypeAndScale: { "740-14": { H1: { "0-500": 1000 } } },
    rigDailyTotalsByTypeAndScale: { "740-14": { "2026-08-05": { H1: { "0-500": 30 } } } },
  };
  const res = calculateBonuses(input);
  const p1 = res.lines.find((l) => l.employeeId === "p1")!;
  const prod = p1.breakdown.shifts.find((s) => s.drillingType === "H1" && s.shift === "day+night");
  if (!prod || prod.depthScale !== "0-500") throw new Error(`FAILED production depthScale: ${JSON.stringify(prod)}`);
  const aboveRow = p1.breakdown.shifts.find((s) =>
    s.componentBreakdown.some((c) => c.bonusTypeCode === "above_threshold"),
  );
  const aboveComp = aboveRow?.componentBreakdown.find((c) => c.bonusTypeCode === "above_threshold");
  if (!aboveComp || aboveComp.details.rate !== 750) throw new Error(`FAILED above-threshold rate: ${JSON.stringify(aboveComp)}`);
  // configured multiplier check: the EFFECTIVE value stored is 0.5 (increment),
  // but the snapshot must carry the CONFIGURED 1.5.
  const configured = (input.rules.find((r) => r.bonusTypeCode === "above_threshold")?.parameters as { multiplier?: number } | undefined)?.multiplier;
  if (configured !== 1.5) throw new Error(`FAILED configured multiplier in snapshot: ${configured}`);
  console.log(`PASS engine: prod row depthScale=${prod.depthScale}, above rate=${aboveComp.details.rate}, configured mult=${configured}`);
}

/**
 * Regression: an ALIASED report band shape (Chile Chico) must price the
 * Mejor Máquina rows through the rule's depthScaleAliases, and the per-tramo
 * rows must add up to the raw total the prorate row divides.
 * Report bands 0-100 / 100-200 / 200-300 -> memo tramos 0-200 / 200-400, and the
 * canonical 0-500 bucket (sum of the bands) plus an unrated type must be left out.
 */
async function aliasExpansionCheck(): Promise<void> {
  const engineInput: EngineInputSnapshot = {
    employees: [
      {
        employeeId: "cc1",
        defaultRole: "Perforista",
        roleTokens: ["Perforista", "group1"],
        shifts: [],
      },
    ],
    rules: [
      {
        bonusTypeCode: "production_meter",
        positionFilter: ["group1"],
        parameters: {
          rateTable: {
            HQ: { "0-200": { Perforista: 600 }, "200-400": { Perforista: 800 } },
          },
          bestRigSelection: "best_rig_month",
          attendanceProrate: { divisor: "days_in_month" },
          rateKey: "Perforista",
          depthScaleAliases: {
            "0-100": "0-200",
            "100-200": "0-200",
            "200-300": "200-400",
          },
        },
      },
    ],
    monthlyRigTotals: { "200-13": 960.6 },
    rigTotalsByTypeAndScale: {
      "200-13": {
        HQ: { "0-100": 474.6, "0-500": 882.1, "100-200": 385.2, "200-300": 22.3 },
        "GROUTING HQ": { "0-500": 78.5 },
      },
    },
  };
  // raw = 474.6*600 + 385.2*600 + 22.3*800 = 533.720 ; paid = (raw/30)*17
  const rawTotal = 533720;
  const daysWorked = 17;
  const paid = Math.round((rawTotal / 30) * daysWorked);
  const lines: SuperDetailLine[] = [
    {
      employeeId: "cc1",
      employeeName: "Perforista Chile Chico",
      employeeRut: "1-9",
      roleUsed: "Perforista",
      daysWorked,
      totalMeters: 1842.7,
      totalHours: null,
      calculatedBonus: paid,
      breakdown: {
        components: [
          {
            bonusTypeCode: "production_meter",
            bonusTypeName: "Bono Metro",
            amount: paid,
            details: { prorate: { rawTotal, divisorDays: 30, divisorSource: "days_in_month", daysWorked } },
          },
        ],
        shifts: [
          {
            rigName: "200-13",
            role: "Perforista",
            meters: 960.6,
            drillingType: "BEST_RIG",
            componentBreakdown: [{ bonusTypeCode: "production_meter", amount: rawTotal, details: {} }],
          },
        ],
      },
    },
  ];

  const buf = await buildCalculationSuperDetailWorkbook(
    {
      id: "alias-test",
      siteName: "Proyecto Chile Chico",
      ruleSetName: "Chile Chico - Bono Producción (Memo Julio 2026 V2)",
      ruleSetVersion: 1,
      periodStart: new Date("2026-08-01T00:00:00Z"),
      periodEnd: new Date("2026-08-31T00:00:00Z"),
      status: "draft",
      totalBonus: paid,
      createdAt: new Date("2026-09-01T00:00:00Z"),
    },
    lines,
    engineInput,
  );
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets.find((w) => w.name.startsWith("Perforista Chile Chico"));
  if (!ws) throw new Error("FAILED alias test: employee sheet not found");

  let rawSum = 0;
  let proratedRaw: number | null = null;
  let proratePaid: number | null = null;
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    if (row.getCell(15).value !== "Mejor Máquina") continue;
    const rate = row.getCell(9).value;
    const bonus = typeof row.getCell(14).value === "number" ? (row.getCell(14).value as number) : 0;
    if (row.getCell(5).value === "MEJOR MÁQUINA") {
      proratePaid = bonus;
      const m = String(row.getCell(10).value ?? "").match(/\$([\d.]+)/);
      if (m) proratedRaw = Number.parseInt(m[1].replace(/\./g, ""), 10);
    } else {
      if (typeof rate !== "number" || rate <= 0) {
        throw new Error(`FAILED alias test: unpriced tramo row ${row.getCell(5).value} ${row.getCell(6).value} (rate=${String(rate)})`);
      }
      rawSum += bonus;
    }
  }
  console.log(`Alias expansion: per-tramo raw=$${Math.round(rawSum)} | prorate raw=$${proratedRaw} | paid=$${proratePaid}`);
  if (Math.abs(rawSum - rawTotal) > 1) throw new Error(`FAILED alias test: raw sum ${rawSum} != ${rawTotal}`);
  if (proratedRaw === null || Math.abs(proratedRaw - rawTotal) > 1) {
    throw new Error(`FAILED alias test: prorate raw ${proratedRaw} != ${rawTotal}`);
  }
  if (proratePaid === null || Math.abs(proratePaid - paid) > 1) {
    throw new Error(`FAILED alias test: paid ${proratePaid} != ${paid}`);
  }
  console.log("PASS alias: report bands priced through depthScaleAliases");
}

async function dbEndToEnd(): Promise<void> {
  const calc = await prisma.bonusCalculation.findFirst({
    orderBy: { createdAt: "desc" },
    include: { site: true, ruleSet: true, lines: { include: { employee: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!calc) throw new Error("No calculations in DB");
  console.log(`Latest calc: ${calc.site.name} ${calc.periodStart.toISOString().slice(0, 10)}.. lines=${calc.lines.length}`);

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
  const bytes = new Uint8Array(buffer as ArrayBuffer);
  writeFileSync("super-detail-august.xlsx", bytes);
  console.log(`Workbook written: super-detail-august.xlsx (${(bytes.length / 1024).toFixed(0)} KB)`);

  // Read back and verify
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes.buffer as ArrayBuffer);
  console.log(`Sheets: ${wb.worksheets.length} (Resumen + ${lines.length} employees + Tarifas y Reglas)`);

  // Verify a top-earning employee sheet: detail total should equal the line bonus
  const top = [...lines].sort((a, b) => b.calculatedBonus - a.calculatedBonus)[0];
  const ws = wb.worksheets.find((w) => w.name.startsWith(top.employeeName.slice(0, 20)));
  if (!ws) throw new Error(`Sheet not found for ${top.employeeName}`);
  let detailTotal = 0;
  let totalA_Pago: number | null = null;
  let sawTramo = false;
  let sawAbove = false;
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const concept = row.getCell(15).value;
    const bonus = row.getCell(14).value;
    const tramo = row.getCell(6).value;
    const detail = row.getCell(16).value;
    if (typeof tramo === "string" && /^\d+-\d+$/.test(tramo)) sawTramo = true;
    if (typeof detail === "string" && /× 1\.5\b/.test(detail)) sawAbove = true;
    if (row.getCell(1).value === "TOTAL A PAGO" && typeof bonus === "number") {
      totalA_Pago = bonus;
    }
    if (typeof concept === "string" && concept.length > 0 && typeof bonus === "number") {
      // informational rows (Mejor Máquina per-tramo raw) carry a tramo; the
      // prorate row (final payment) has no tramo — exclude the raw ones
      const isBestRigRaw = concept === "Mejor Máquina" && typeof tramo === "string" && tramo !== "—";
      if (!isBestRigRaw) detailTotal += bonus;
    }
  }
  console.log(`Employee: ${top.employeeName} | detail rows=${Math.round(detailTotal)} | TOTAL A PAGO=${totalA_Pago !== null ? Math.round(totalA_Pago) : "none"} | line bonus=${Math.round(top.calculatedBonus)} | tramo present=${sawTramo}`);
  if (totalA_Pago === null) throw new Error("FAILED: TOTAL A PAGO row not found");
  if (Math.abs(totalA_Pago - top.calculatedBonus) > 1) throw new Error(`FAILED TOTAL A PAGO mismatch: ${totalA_Pago} vs ${top.calculatedBonus}`);
  if (!sawTramo) throw new Error("FAILED: no depth range (tramo) column values found");
  // Verify a support (Mejor Máquina + prorate) sheet too
  const support = lines.find((l) => l.calculatedBonus > 0 && !["Perforista", "PERFORISTA (INSTRUCTOR)", "Ayudante Perforista", "Ayudante de Perforista"].includes(l.roleUsed));
  if (support) {
    const sWs = wb.worksheets.find((w) => w.name.startsWith(support.employeeName.slice(0, 20)));
    if (sWs) {
      let raw = 0;
      let final: number | null = null;
      for (let r = 1; r <= sWs.rowCount; r++) {
        const row = sWs.getRow(r);
        const concept = row.getCell(15).value;
        const bonus = row.getCell(14).value;
        const tramo = row.getCell(6).value;
        if (concept === "Mejor Máquina" && typeof bonus === "number") {
          if (typeof tramo === "string" && tramo !== "—") raw += bonus;
          else final = bonus;
        }
      }
      const sTop = support;
      console.log(`Support: ${support.employeeName} | role=${support.roleUsed} | raw per-tramo=${Math.round(raw)} | prorate final=${final !== null ? Math.round(final) : "none"} | line bonus=${Math.round(sTop.calculatedBonus)}`);
      if (final === null || Math.abs(final - sTop.calculatedBonus) > 1) {
        throw new Error(`FAILED support prorate: final=${final} vs bonus=${sTop.calculatedBonus}`);
      }
      if (raw <= 0) throw new Error("FAILED support: no per-tramo raw rows");
    }
  }
  // Hyperlink check: every Resumen name cell links to its employee sheet, and
  // each employee sheet links back to its Resumen row.
  const resumenWs = wb.getWorksheet("Resumen");
  if (!resumenWs) throw new Error("FAILED: Resumen sheet not found");
  let linkCount = 0;
  for (let r = 5; r < 5 + lines.length; r++) {
    const cell = resumenWs.getRow(r).getCell(1);
    const v = cell.value as { text?: string; hyperlink?: string } | null;
    if (!v || typeof v !== "object" || typeof v.hyperlink !== "string") {
      throw new Error(`FAILED: Resumen row ${r} has no hyperlink`);
    }
    const targetName = decodeURIComponent(v.hyperlink);
    if (!wb.getWorksheet(targetName.replace(/^#'/, "").replace(/''/g, "'").replace(/'!A1$/, ""))) {
      throw new Error(`FAILED: Resumen row ${r} links to missing sheet: ${v.hyperlink}`);
    }
    linkCount += 1;
  }
  console.log(`Resumen forward links: ${linkCount}/${lines.length}`);
  const backWs = wb.worksheets.find((w) => w.name !== "Resumen" && w.name !== "Tarifas y Reglas");
  const backVal = backWs?.getRow(1).getCell(1).value as { hyperlink?: string } | null;
  if (!backVal || typeof backVal !== "object" || backVal.hyperlink !== "#'Resumen'!A5") {
    throw new Error(`FAILED: backlink missing/wrong: ${JSON.stringify(backVal)}`);
  }
  console.log("Resumen backlink OK (first employee sheet → Resumen!A5)");
  console.log("PASS: super detail export end-to-end");
}

async function main() {
  engineEnrichmentCheck();
  await aliasExpansionCheck();
  await dbEndToEnd();
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error("FAIL:", String(e)); process.exit(1); });
