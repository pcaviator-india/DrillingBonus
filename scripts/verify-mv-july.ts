import { appendFileSync, writeFileSync } from "node:fs";
import { calculateBonuses } from "../src/lib/bonus-engine/engine";
import type { BonusEngineInput } from "../src/types/bonus";

/**
 * Replicates Proyecto Mantoverde July 2026 cases from
 * "Cálculo Bono Produccion Recon Drilling - Julio REV TA-TB EH_.xlsx"
 * against the PURE engine, validating each bonus type's mechanism.
 * Rate tables mirror the July PERFOR./AYUD./BONO EXTRA/NO OP/SUP-PREV sheets.
 */
const OUT = "verify-mv-july-result.txt";
writeFileSync(OUT, "");
function log(...args: unknown[]) {
  const line = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  process.stdout.write(line + "\n");
  appendFileSync(OUT, line + "\n");
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const MV_RATES = {
  // PERFOR.: DDH 0-500=750, 501-1000=900 ; RC 0-600=300
  DDH: { "0-500": { Perforista: 750, Ayudante: 500 }, "500-1000": { Perforista: 900, Ayudante: 700 } },
  RC: { "0-500": { Perforista: 300, Ayudante: 200 } },
};

async function main() {
  // ---------- A. PERFORISTA production_meter (employee_rig) FALLBACK ----------
  // No rigDailyTotalsByTypeAndScale provided -> uses own shift only.
  // CASTRO ALVOS 740-7 = 298.3m DDH 0-500 -> 298.3*750 = 223725
  {
    const input: BonusEngineInput = {
      period: { start: "2026-07-01", end: "2026-07-31" },
      employees: [
        {
          employeeId: "17624527-1",
          fullName: "CASTRO AVALOS NELSON ANDRES",
          daysWorked: 15, attendanceHours: 120,
          shifts: [
            { date: "2026-07-05", shift: "day", rigName: "740-7", role: "Perforista", meters: 150, hours: 8, drillingLevel: null, drillingType: "DDH", drillingDepth: 150 },
            { date: "2026-07-06", shift: "day", rigName: "740-7", role: "Perforista", meters: 148.3, hours: 8, drillingLevel: null, drillingType: "DDH", drillingDepth: 298 },
          ],
        },
      ],
      rules: [
        {
          ruleId: "mv-prod-perf",
          bonusTypeCode: "production_meter",
          positionFilter: ["Perforista", "Driller"],
          drillingTypeFilter: [], priority: 1,
          parameters: { rateTable: MV_RATES, bestRigSelection: "employee_rig" },
          minAttendanceDays: null,
        },
      ],
    };
    const res = calculateBonuses(input);
    const l = res.lines[0];
    log(`A. Perforista fallback 298.3m DDH -> ${l.calculatedBonus} (expected 223725)`);
    if (round2(l.calculatedBonus) !== 223725) throw new Error(`A FAILED: ${l.calculatedBonus}`);
  }

  // ---------- A2. Bono Metro day+night (PRIMERO §1) ----------
  // Employee worked DAY shift on 07-05 and 07-06. Machine 24h production
  // includes the NIGHT turn too. Bono base = machine daily (day+night) both dates.
  {
    const input: BonusEngineInput = {
      period: { start: "2026-07-01", end: "2026-07-31" },
      employees: [
        {
          employeeId: "perf1",
          fullName: "Perforista Día",
          daysWorked: 15, attendanceHours: 120,
          shifts: [
            { date: "2026-07-05", shift: "day", rigName: "740-7", role: "Perforista", meters: 150, hours: 8, drillingLevel: null, drillingType: "DDH", drillingDepth: 150 },
            { date: "2026-07-06", shift: "day", rigName: "740-7", role: "Perforista", meters: 148.3, hours: 8, drillingLevel: null, drillingType: "DDH", drillingDepth: 298 },
          ],
        },
      ],
      rules: [
        {
          ruleId: "mv-prod-perf",
          bonusTypeCode: "production_meter",
          positionFilter: ["Perforista", "Driller"],
          drillingTypeFilter: [], priority: 1,
          parameters: { rateTable: MV_RATES, bestRigSelection: "employee_rig" },
          minAttendanceDays: null,
        },
      ],
      rigDailyTotalsByTypeAndScale: {
        "740-7": {
          "2026-07-05": { DDH: { "0-500": 300 } }, // day 150 + night 150
          "2026-07-06": { DDH: { "0-500": 298.3 } }, // day 148.3 + night 150
        },
      },
    };
    const res = calculateBonuses(input);
    const l = res.lines[0];
    const expected = (300 + 298.3) * 750; // 448725
    log(`A2. Bono Metro day+night -> ${l.calculatedBonus} (expected ${expected})`);
    log(`    breakdown shifts=${JSON.stringify(l.breakdown.shifts.map((s) => ({date: s.date, shift: s.shift, meters: s.meters})))}`);
    if (round2(l.calculatedBonus) !== round2(expected)) throw new Error(`A2 FAILED: ${l.calculatedBonus}`);
  }

  // ---------- B. above_threshold incrementOnly (BONO EXTRA) ----------
  // A >22m day: metersAbove * baseRate * (1.5-1). e.g. 40.1m -> (40.1-22)*750*0.5 = 6787.5
  {
    const input: BonusEngineInput = {
      period: { start: "2026-07-01", end: "2026-07-31" },
      employees: [
        {
          employeeId: "e1", fullName: "Perforista Day",
          daysWorked: 10, attendanceHours: 80,
          shifts: [{ date: "2026-07-10", shift: "day", rigName: "740-14", role: "Perforista", meters: 40.1, hours: 8, drillingLevel: null, drillingType: "DDH", drillingDepth: 300 }],
        },
      ],
      rules: [
        {
          ruleId: "mv-extra",
          bonusTypeCode: "above_threshold",
          positionFilter: ["Perforista", "Ayudante"],
          drillingTypeFilter: [], priority: 2,
          parameters: { thresholds: { DDH: 22, RC: 50 }, multiplier: 1.5, baseRateTable: MV_RATES, incrementOnly: true },
          minAttendanceDays: null,
        },
      ],
    };
    const res = calculateBonuses(input);
    const l = res.lines[0];
    const x = (40.1 - 22) * 750 * 0.5;
    log(`B. Above-threshold incrementOnly 40.1m -> ${l.calculatedBonus} (expected ${x})`);
    if (round2(l.calculatedBonus) !== round2(x)) throw new Error(`B FAILED: ${l.calculatedBonus}`);
  }

  // ---------- C. monthly_goal per-machine (BONO SOBRE 1000M) ----------
  // July rig totals: 740-7=466.5, 740-14=698.9 (DDH), 1200-01=1192 (RC).
  // None exceed 1000 DDH / 2500 RC -> payout 0.
  {
    const input: BonusEngineInput = {
      period: { start: "2026-07-01", end: "2026-07-31" },
      employees: [
        {
          employeeId: "e1", fullName: "Perforista",
          daysWorked: 10, attendanceHours: 80,
          shifts: [{ date: "2026-07-10", shift: "day", rigName: "740-14", role: "Perforista", meters: 40, hours: 8, drillingLevel: null, drillingType: "DDH", drillingDepth: 400 }],
        },
      ],
      rules: [
        {
          ruleId: "mv-goal",
          bonusTypeCode: "monthly_goal",
          positionFilter: ["Perforista", "Ayudante"],
          drillingTypeFilter: [], priority: 3,
          parameters: { goals: { DDH: 1000, RC: 2500 }, amounts: { Perforista: 250000, Ayudante: 125000 } },
          minAttendanceDays: null,
        },
      ],
      rigTotalsByType: { "740-7": { DDH: 466.5 }, "740-14": { DDH: 698.9 }, "1200-01": { RC: 1192 } },
    };
    const res = calculateBonuses(input);
    const l = res.lines[0];
    log(`C. Monthly goal July (466.5/698.9/1192) -> ${l.calculatedBonus} (expected 0)`);
    if (round2(l.calculatedBonus) !== 0) throw new Error(`C FAILED: ${l.calculatedBonus}`);
  }

  // ---------- D. best_rig_month support (MEJOR MÁQUINA) per-tramo /31 ----------
  // July: best rig of the month by total meters = 1200-01 (1192m RC).
  // Soporte/admin -> Tabla 2 RC (200/m). raw = 1192*200 = 238400.
  {
    const TABLE2_RC = { RC: { "0-500": { Soporte: 200, Ayudante: 200 } } };
    const input: BonusEngineInput = {
      period: { start: "2026-07-01", end: "2026-07-31" },
      employees: [
        { employeeId: "sup1", fullName: "Support 19d", daysWorked: 19, attendanceHours: 152, shifts: [{ date: "2026-07-05", shift: "day", rigName: "none", role: "Soporte", meters: 10, hours: 8, drillingLevel: null, drillingType: null, drillingDepth: null }] },
        { employeeId: "sup2", fullName: "Support 10d (no shift)", daysWorked: 10, attendanceHours: 80, defaultRole: "Soporte", shifts: [] },
      ],
      rules: [
        {
          ruleId: "mv-support",
          bonusTypeCode: "production_meter",
          positionFilter: ["Soporte", "Support"],
          drillingTypeFilter: [], priority: 1,
          parameters: { rateTable: TABLE2_RC, bestRigSelection: "best_rig_month", attendanceProrate: { divisor: "days_in_month" } },
          minAttendanceDays: null,
        },
      ],
      monthlyRigTotals: { "740-14": 698.9, "740-7": 466.5, "1200-01": 1192 },
      rigTotalsByTypeAndScale: {
        "740-14": { DDH: { "0-500": 698.9 } },
        "740-7": { DDH: { "0-500": 466.5 } },
        "1200-01": { RC: { "0-500": 1192 } },
      },
    };
    const res = calculateBonuses(input);
    const raw = 1192 * 200;
    const e19 = (raw / 31) * 19;
    const e10 = (raw / 31) * 10;
    log(`D. best rig by meters = 1200-01 (1192m RC); raw=${raw}; sup1 -> ${res.lines[0].calculatedBonus} (exp ${round2(e19)}), sup2(no shift, defaultRole) -> ${res.lines[1].calculatedBonus} (exp ${round2(e10)})  | skipped=${res.lines[1].breakdown.skipped ?? "no"}`);
    if (round2(res.lines[0].calculatedBonus) !== round2(e19)) throw new Error(`D sup1 FAILED: ${res.lines[0].calculatedBonus}`);
    if (round2(res.lines[1].calculatedBonus) !== round2(e10)) throw new Error(`D sup2 FAILED: ${res.lines[1].calculatedBonus}`);
  }

  // ---------- E. Jefe/Supervisor best_rig uses Tabla 1 (Perforista) ----------
  {
    const TABLE1 = {
      DDH: { "0-500": { Perforista: 750 } },
      RC: { "0-500": { Perforista: 300 } },
    };
    const input: BonusEngineInput = {
      period: { start: "2026-07-01", end: "2026-07-31" },
      employees: [
        { employeeId: "jef1", fullName: "Jefe 17d", daysWorked: 17, attendanceHours: 136, defaultRole: "Jefe de Faena", shifts: [] },
      ],
      rules: [
        {
          ruleId: "mv-jefe",
          bonusTypeCode: "production_meter",
          positionFilter: ["Jefe de Faena"],
          drillingTypeFilter: [], priority: 1,
          parameters: { rateTable: TABLE1, bestRigSelection: "best_rig_month", attendanceProrate: { divisor: "days_in_month" }, rateKey: "Perforista" },
          minAttendanceDays: null,
        },
      ],
      monthlyRigTotals: { "740-14": 698.9, "740-7": 466.5, "1200-01": 1192 },
      rigTotalsByTypeAndScale: {
        "740-14": { DDH: { "0-500": 698.9 } },
        "740-7": { DDH: { "0-500": 466.5 } },
        "1200-01": { RC: { "0-500": 1192 } },
      },
    };
    const res = calculateBonuses(input);
    // best rig by meters = 1200-01 (1192 RC); Tabla 1 RC = 300/m
    const raw = 1192 * 300;
    const e = (raw / 31) * 17;
    log(`E. Jefe best_rig Tabla1 RC -> ${res.lines[0].calculatedBonus} (exp ${round2(e)}) | skipped=${res.lines[0].breakdown.skipped ?? "no"}`);
    if (round2(res.lines[0].calculatedBonus) !== round2(e)) throw new Error(`E FAILED: ${res.lines[0].calculatedBonus}`);
  }

  log("\nPASS: MV July engine mechanics verified");
}

main().catch((e: unknown) => { log("FAIL:", e instanceof Error ? e.message : String(e)); process.exit(1); });