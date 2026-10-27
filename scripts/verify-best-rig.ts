import "dotenv/config";
import { calculateProductionMeterBonus } from "../src/lib/bonus-engine/handlers/production-meter";
import type { EmployeeWork } from "../src/types/bonus";

function emp(): EmployeeWork {
  return { employeeId: "e1", fullName: "Support", daysWorked: 30, attendanceHours: 0, defaultRole: "Support", shifts: [] };
}

const params = {
  rateTable: { BEST_RIG: { MONTHLY: { Support: 200 } } },
  bestRigSelection: "best_rig_month" as const,
  rateKey: "Support",
  bestRigRule: { arThresholdMeters: 2500 },
};

const totals1 = { "1200-1": 3000, "740-7": 3500 }; // AR above gate -> AR wins despite lower DDH? here DDH higher
const rigTypes = { "1200-1": "AIRE_REVERSO" as const, "740-7": "DIAMANTINA" as const };
const r1 = calculateProductionMeterBonus(emp(), params, totals1, { rigTypes });
console.log("case1 AR 3000>2500 ->", r1.shiftBreakdown[0]?.rigName, r1.shiftBreakdown[0]?.meters);
if (r1.shiftBreakdown[0]?.rigName !== "1200-1") throw new Error("case1 failed");

const totals2 = { "1200-1": 2000, "740-7": 1500 }; // AR below gate -> DDH wins? DDH lower here, still DDH wins per rule
const r2 = calculateProductionMeterBonus(emp(), params, totals2, { rigTypes });
console.log("case2 AR 2000<=2500 ->", r2.shiftBreakdown[0]?.rigName);
if (r2.shiftBreakdown[0]?.rigName !== "740-7") throw new Error("case2 failed");

const totals3 = { "1200-1": 2500, "740-7": 100 }; // exactly 2500 -> NOT strictly greater -> DDH wins
const r3 = calculateProductionMeterBonus(emp(), params, totals3, { rigTypes });
console.log("case3 AR ==2500 ->", r3.shiftBreakdown[0]?.rigName);
if (r3.shiftBreakdown[0]?.rigName !== "740-7") throw new Error("case3 failed");

// legacy: no bestRigRule -> plain max wins
const legacy = calculateProductionMeterBonus(emp(), { ...params, bestRigRule: undefined }, totals2, { rigTypes });
console.log("legacy no rule ->", legacy.shiftBreakdown[0]?.rigName);
if (legacy.shiftBreakdown[0]?.rigName !== "1200-1") throw new Error("legacy failed");

console.log("PASS: best-rig AR gate verified");
