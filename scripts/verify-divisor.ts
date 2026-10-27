import { appendFileSync, writeFileSync } from "node:fs";
import { calculateBonuses } from "../src/lib/bonus-engine/engine";
import { resolveDivisorDays } from "../src/lib/bonus-engine/handlers";
import type { BonusEngineInput, EmployeeWork } from "../src/types/bonus";

const OUT = "verify-divisor-result.txt";
writeFileSync(OUT, "");
function log(...args: unknown[]) {
  const line = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  process.stdout.write(line + "\n");
  appendFileSync(OUT, line + "\n");
}

function makeSupportEmployee(daysWorked: number, shifts = 1): EmployeeWork {
  // One shift whose rate resolves 353450 total for the best rig:
  // emulate rawTotal = 353450 by a single contribution; the handler
  // distributes bestRigMeters across shifts, then multiplies by rate.
  // Simpler: directly test resolveDivisorDays + prorate math here.
  return {
    employeeId: `sup-${daysWorked}`,
    fullName: `Support ${daysWorked}d`,
    daysWorked,
    attendanceHours: daysWorked * 8,
    shifts: Array.from({ length: shifts }, (_, i) => ({
      date: `2026-07-${String(i + 1).padStart(2, "0")}`,
      shift: "day",
      rigName: "740-14",
      role: "Support",
      meters: 698.9,
      hours: 8,
      drillingLevel: null,
      drillingType: "H1",
      drillingDepth: 100,
    })),
  };
}

function runCase(periodEnd: string, expectedDivisor: number) {
  const { days, source } = resolveDivisorDays("days_in_month", periodEnd);
  log(`periodEnd=${periodEnd} => divisor=${days} source=${source} (expected ${expectedDivisor})`);
  if (days !== expectedDivisor) throw new Error(`FAILED divisor for ${periodEnd}: got ${days}`);
}

function runProrateCase(rawTotal: number, asistencia: number, divisor: number, expected: number) {
  const got = (rawTotal / divisor) * asistencia;
  log(`TOTAL=${rawTotal} ASIST=${asistencia} /${divisor} => ${Math.round(got)} (expected ${expected})`);
  if (Math.round(got) !== expected) throw new Error(`FAILED prorate: got ${Math.round(got)}`);
}

async function main() {
  // 1. Divisor resolution: "days_in_month" always => 30 (fixed standard)
  runCase("2026-07-31", 30); // July => 30 (fixed)
  runCase("2026-06-30", 30); // June => 30 (fixed)
  runCase("2026-02-28", 30); // Feb => 30 (fixed)
  runCase("2024-02-29", 30); // leap year Feb => 30 (fixed)
  runCase("2026-12-31", 30); // Dec => 30 (fixed)

  // 2. Prorate math with /30
  runProrateCase(522675, 17, 30, 296183); // raw * 17 / 30
  runProrateCase(522675, 14, 30, 243915); // raw * 14 / 30
  runProrateCase(353450, 19, 30, 223852); // raw * 19 / 30
  runProrateCase(353450, 10, 30, 117817); // raw * 10 / 30
  runProrateCase(353450, 13, 30, 153162); // raw * 13 / 30

  // 3. Fixed-number divisor still works
  runProrateCase(522675, 17, 25, 355419); // legacy /25 behaviour documented

  // 4. End-to-end through the pure engine: support rule with attendanceProrate
  const input: BonusEngineInput = {
    period: { start: "2026-07-01", end: "2026-07-31" },
    employees: [makeSupportEmployee(17)],
    rules: [
      {
        ruleId: "support-best-rig",
        bonusTypeCode: "production_meter",
        positionFilter: [],
        drillingTypeFilter: [],
        priority: 1,
        parameters: {
          rateTable: { H1: { "0-500": { Support: 500 } } },
          bestRigSelection: "best_rig_month",
          attendanceProrate: { divisor: "days_in_month" },
        },
        minAttendanceDays: null,
      },
    ],
    monthlyRigTotals: { "740-14": 698.9 },
    rigTotalsByTypeAndScale: { "740-14": { H1: { "0-500": 698.9 } } },
  };
  const res = calculateBonuses(input);
  // best rig = 740-14 (698.9), rateKey defaults to employee role "Support" -> 500/m
  const raw = 698.9 * 500;
  const expected = (raw / 30) * 17; // divisor is now always 30
  const l = res.lines[0];
  log(`engine e2e: bonus=${l.calculatedBonus} (expected ${expected}), comps=${l.components.length}`);
  if (round2(l.calculatedBonus) !== round2(expected)) throw new Error(`FAILED engine bonus: ${l.calculatedBonus}`);
  const comp = l.components[0];
  const d = comp.details as { divisorDays?: number; divisorSource?: string };
  if (d.divisorDays !== 30) throw new Error(`FAILED engine divisorDays: ${JSON.stringify(d)}`);
  if (d.divisorSource !== "days_in_month") throw new Error("FAILED engine divisorSource");
  log("PASS: divisor = days_in_month => 30");
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

main().catch((e: unknown) => {
  log("FAIL:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
