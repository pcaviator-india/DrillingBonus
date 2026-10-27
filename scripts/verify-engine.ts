import { appendFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { calculateBonuses } from "../src/lib/bonus-engine/engine";
import type { BonusEngineInput } from "../src/types/bonus";
import { syncCorePlanData } from "../src/lib/coreplan/sync";
import { runCalculation } from "../src/lib/calculations/run";

const OUT = "verify-engine-result.txt";
writeFileSync(OUT, "");
function log(...args: unknown[]) {
  const line = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  process.stdout.write(line + "\n");
  appendFileSync(OUT, line + "\n");
}

const prisma = new PrismaClient();

// ---------- 1. Pure engine unit test (no DB) ----------
function engineUnitTest() {
  const input: BonusEngineInput = {
    period: { start: "2026-08-01", end: "2026-08-31" },
    employees: [
      {
        employeeId: "e1",
        fullName: "Driller A",
        daysWorked: 20,
        attendanceHours: 160,
        shifts: [
          { date: "2026-08-03", shift: "day", rigName: "Rig 01", role: "Driller", meters: 100, hours: 8, drillingLevel: "hard", drillingType: "HQ" },
          { date: "2026-08-04", shift: "day", rigName: "Rig 01", role: "Driller", meters: 50, hours: 8, drillingLevel: "soft", drillingType: "HQ" },
        ],
      },
      {
        employeeId: "e2",
        fullName: "Helper B (below gate)",
        daysWorked: 3,
        attendanceHours: 24,
        shifts: [
          { date: "2026-08-05", shift: "day", rigName: "Rig 02", role: "Helper", meters: 30, hours: 6, drillingLevel: null, drillingType: "HQ" },
        ],
      },
      {
        employeeId: "e3",
        fullName: "Driller C (above threshold)",
        daysWorked: 15,
        attendanceHours: 120,
        shifts: [
          { date: "2026-08-05", shift: "night", rigName: "Rig 02", role: "Driller", meters: 100, hours: 8, drillingLevel: null, drillingType: "DDH" },
        ],
      },
    ],
    rules: [
      {
        ruleId: "rule1",
        bonusTypeCode: "production_meter",
        positionFilter: [],
        drillingTypeFilter: [],
        priority: 1,
        parameters: {
          rateTable: {
            HQ: {
              "0-500": { Driller: 750, Helper: 500 },
            },
          },
          bestRigSelection: "employee_rig",
        },
        minAttendanceDays: 10,
      },
      {
        ruleId: "rule2",
        bonusTypeCode: "above_threshold",
        positionFilter: [],
        drillingTypeFilter: [],
        priority: 2,
        parameters: {
          thresholds: { DDH: 22, RC: 50 },
          multiplier: 1.5,
          baseRateTable: {
            DDH: {
              "0-500": { Driller: 300, Helper: 200 },
            },
          },
        },
        minAttendanceDays: null,
      },
    ],
  };

  const res = calculateBonuses(input);
  log("--- Pure engine unit test ---");
  for (const l of res.lines) {
    log(l.fullName, "| role", l.roleUsed, "| meters", l.totalMeters, "| bonus", l.calculatedBonus, JSON.stringify(l.components), l.breakdown.skipped ?? "");
  }
  log("Total:", res.totalBonus);

  // Expected: e1 = 100*750 + 50*750 = 75000 + 37500 = 112500 (production meter only)
  const e1 = res.lines.find((l) => l.employeeId === "e1")!;
  if (e1.calculatedBonus !== 112500) throw new Error(`FAILED: expected 112500, got ${e1.calculatedBonus}`);
  // e2: rule-level attendance gate (minAttendanceDays 10 > 3 days) zeroes the
  // bonus; the line stays visible with 0 instead of being hidden (audit trail).
  const e2 = res.lines.find((l) => l.employeeId === "e2")!;
  if (e2.calculatedBonus !== 0) throw new Error(`Expected e2 bonus 0 (attendance gate 3 < 10), got ${e2.calculatedBonus}`);
  if (e2.components.length !== 0) throw new Error(`Expected e2 no components, got ${e2.components.length}`);
  // e3: shift type DDH is not in rule1's H1 rateTable -> production pays 0 (and
  // zero-amount components are not recorded); above_threshold pays
  // (100 - 22) * 300 * 1.5 = 35100.
  const e3 = res.lines.find((l) => l.employeeId === "e3")!;
  if (e3.calculatedBonus !== 35100) throw new Error(`Expected e3 bonus 35100, got ${e3.calculatedBonus}`);
  if (!e3.components.some((c) => c.bonusTypeCode === "above_threshold")) throw new Error("Expected above_threshold component for e3");
  log("PASS: engine unit test");
}


// ---------- 2. End-to-end DB test ----------
async function endToEndTest() {
  log("\n--- End-to-end DB test ---");
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const periodEnd = `${year}-${String(month).padStart(2, "0")}-28`;

  const res = await syncCorePlanData(periodStart, periodEnd);
  log("CorePlan sync:", res);

  const site = await prisma.site.findFirst({ where: { code: "SITE-01" } });
  if (!site) throw new Error("SITE-01 not found - run Workera sync first");

  // Find bonus types
  const prodMeterType = await prisma.bonusType.findUnique({ where: { code: "production_meter" } });
  if (!prodMeterType) throw new Error("production_meter bonus type not found - run seed first");

  const old = await prisma.bonusRuleSet.findFirst({
    where: { siteId: site.id, name: "E2E Test Rules" },
    include: { calculations: true },
  });
  if (old) {
    for (const c of old.calculations) {
      await prisma.bonusCalculationLine.deleteMany({ where: { calculationId: c.id } });
      await prisma.bonusCalculation.delete({ where: { id: c.id } });
    }
    await prisma.bonusRule.deleteMany({ where: { ruleSetId: old.id } });
    await prisma.bonusRuleSet.delete({ where: { id: old.id } });
  }
  const ruleSet = await prisma.bonusRuleSet.create({
    data: {
      siteId: site.id,
      name: "E2E Test Rules",
      effectiveFrom: new Date(`${periodStart}T00:00:00Z`),
      rules: {
        create: [
          {
            bonusTypeId: prodMeterType.id,
            positionFilter: ["Driller", "Helper"],
            drillingTypeFilter: [],
            priority: 1,
            parameters: {
              rateTable: {
                HQ: { "0-500": { Driller: 750, Helper: 500 } },
                DDH: { "0-600": { Driller: 300, Helper: 200 } },
              },
              bestRigSelection: "employee_rig",
            },
            minAttendanceDays: 10,
          },
        ],
      },
    },
  });
  log("Rule set created:", ruleSet.id);

  const result = await runCalculation(site.id, ruleSet.id, periodStart, periodEnd, undefined);
  log("Calculation result:", result);

  const calc = await prisma.bonusCalculation.findUniqueOrThrow({
    where: { id: result.calculationId },
    include: { lines: { include: { employee: true } } },
  });
  log(`Lines (${calc.lines.length}):`);
  for (const l of calc.lines) {
    const bd = l.breakdown as { skipped?: string } | null;
    log(`  ${l.employee.fullName} | role=${l.roleUsed} | days=${l.daysWorked} | meters=${l.totalMeters} | bonus=${l.calculatedBonus}${bd?.skipped ? ` | SKIPPED: ${bd.skipped}` : ""}`);
  }

  if (!calc.inputSnapshot) throw new Error("Input snapshot missing (audit requirement!)");
  if (calc.lines.length === 0) throw new Error("No calculation lines");
  const drillers = calc.lines.filter((l) => l.roleUsed === "Driller" && l.calculatedBonus > 0);
  if (drillers.length === 0) throw new Error("Expected at least one Driller with bonus");
  log("PASS: end-to-end test");
}

async function main() {
  engineUnitTest();
  await endToEndTest();
}

main()
  .catch((e: unknown) => {
    log("FAIL:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

