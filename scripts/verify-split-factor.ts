import { calculateBonuses } from "../src/lib/bonus-engine/engine";
import type { BonusEngineInput, EmployeeWork } from "../src/types/bonus";

function makeEmployee(id: string, daysWorked: number): EmployeeWork {
  return {
    employeeId: id,
    fullName: `Worker ${id}`,
    daysWorked,
    attendanceHours: daysWorked * 8,
    shifts: [
      {
        date: "2026-09-05",
        shift: "day",
        rigName: "Rig-01",
        role: "Perforista",
        meters: 100,
        hours: 8,
        drillingLevel: null,
        drillingType: "HQ",
        drillingDepth: 150,
      },
    ],
  };
}

async function main() {
  const input: BonusEngineInput = {
    period: { start: "2026-09-01", end: "2026-09-30" },
    employees: [makeEmployee("emp-1", 15)],
    rules: [
      {
        ruleId: "r-1",
        bonusTypeCode: "production_meter",
        positionFilter: ["Perforista"],
        drillingTypeFilter: [],
        priority: 1,
        parameters: {
          rateTable: {
            HQ: {
              "0-100": { Perforista: 550 },
              "100-200": { Perforista: 650 },
            },
          },
          bestRigSelection: "best_rig_month",
          rateKey: "Perforista",
          splitFactor: 2,
          attendanceProrate: { divisor: "days_in_month" },
        },
        minAttendanceDays: null,
      },
    ],
    monthlyRigTotals: { "Rig-01": 200 },
    rigTotalsByTypeAndScale: {
      "Rig-01": {
        HQ: {
          "0-100": 100, // 100 * 550 = 55,000
          "100-200": 100, // 100 * 650 = 65,000
        },
      },
    },
  };

  const res = calculateBonuses(input);
  const line = res.lines[0];
  const rawTotal = 55000 + 65000; // 120,000
  const splitRawTotal = rawTotal / 2; // 60,000
  const expectedBonus = (splitRawTotal / 30) * 15; // 30,000

  console.log("Calculated bonus:", line.calculatedBonus, "Expected:", expectedBonus);
  if (Math.round(line.calculatedBonus) !== expectedBonus) {
    throw new Error(`Mismatch! Got ${line.calculatedBonus}, expected ${expectedBonus}`);
  }

  const comp = line.components[0];
  const pr = comp.details.prorate as any;
  console.log("Prorate details:", pr);
  if (pr.splitFactor !== 2) {
    throw new Error(`Prorate splitFactor mismatch! Got ${pr.splitFactor}, expected 2`);
  }
  if (pr.rawTotal !== 120000) {
    throw new Error(`Prorate rawTotal mismatch! Got ${pr.rawTotal}, expected 120000`);
  }

  console.log("✅ splitFactor verification PASSED successfully!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
