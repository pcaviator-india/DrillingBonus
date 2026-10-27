import type {
  BonusEngineInput,
  BonusEngineResult,
  BonusLineResult,
  BonusComponentResult,
  BonusRuleConfig,
  EmployeeWork,
} from "@/types/bonus";
import {
  calculateProductionMeterBonus,
  calculateAboveThresholdBonus,
  calculateMonthlyGoalBonus,
  calculateHighAltitudeBonus,
  calculateEndOfSeasonBonus,
  calculateDirectionalBonus,
  calculateTerminationAdjustment,
  resolveTerminationMultiplier,
} from "./handlers";

/**
 * Pure bonus calculation engine with Bonus Type System.
 * All calculation logic is delegated to bonus type handlers.
 * Nothing numeric is hard-coded – all values come from configuration.
 */

const BONUS_TYPE_NAMES: Record<string, string> = {
  production_meter: "Production Meter",
  above_threshold: "Above Threshold",
  monthly_goal: "Monthly Goal",
  high_altitude: "High Altitude",
  end_of_season: "End of Season",
  directional: "Directional Drilling",
  termination_adjustment: "Termination Adjustment",
};

function getMostFrequentRole(employee: EmployeeWork): string {
  const roleCounts = new Map<string, number>();
  for (const s of employee.shifts) {
    roleCounts.set(s.role, (roleCounts.get(s.role) ?? 0) + 1);
  }
  return [...roleCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

function ruleAppliesToEmployee(
  rule: BonusRuleConfig,
  employee: EmployeeWork,
  roleUsed: string,
): boolean {
  // Full role-token set (raw role, normalized form, resolved main position,
  // bonus group key), case-insensitively — used by both filters below.
  const tokens = new Set<string>(
    [roleUsed, ...(employee.roleTokens ?? [])].map((t) => t.toLowerCase()),
  );
  if (rule.positionFilter.length > 0) {
    // Match against the token set so aliases ("bodeguero" vs "Bodeguero") and
    // group-based filters ("group1") work without enumerating every variant.
    if (!rule.positionFilter.some((p) => tokens.has(p.toLowerCase()))) {
      return false;
    }
  }
  // Exclusion filter: any token match disqualifies the employee (e.g. a rule
  // scoped to "group1" but excluding the drilling crew, who have their own
  // own-machine rules).
  if (rule.positionExclude && rule.positionExclude.length > 0) {
    if (rule.positionExclude.some((p) => tokens.has(p.toLowerCase()))) {
      return false;
    }
  }
  if (rule.minAttendanceDays !== null && rule.minAttendanceDays !== undefined) {
    if (employee.daysWorked < rule.minAttendanceDays) {
      return false;
    }
  }
  return true;
}

function calculateRuleBonus(
  rule: BonusRuleConfig,
  employee: EmployeeWork,
  roleUsed: string,
  periodEnd?: string,
  monthlyRigTotals?: Record<string, number>,
  rigTotalsByType?: Record<string, Record<string, number>>,
  rigTotalsByTypeAndScale?: Record<string, Record<string, Record<string, number>>>,
  rigDailyTotalsByTypeAndScale?: Record<string, Record<string, Record<string, Record<string, number>>>>,
  employeeBaseSalaries?: Record<string, number>,
  employeeSeasonEvaluations?: Record<string, import("@/types/bonus").SeasonEvaluationInput>,
  rigTypes?: Record<string, "DIAMANTINA" | "AIRE_REVERSO">,
): { component: BonusComponentResult; shiftDetails: BonusLineResult["breakdown"]["shifts"] } {
  // Resolve the A/B turn for a given shift from the employee's contributions.
  const turnForShift = (date: string, shift: string, rigName: string): "A" | "B" | null => {
    const match = employee.shifts.find(
      (s) => s.date === date && s.shift === shift && s.rigName === rigName,
    );
    return match?.turn ?? null;
  };
  const component: BonusComponentResult = {
    bonusTypeCode: rule.bonusTypeCode,
    bonusTypeName: BONUS_TYPE_NAMES[rule.bonusTypeCode] ?? rule.bonusTypeCode,
    amount: 0,
    details: {},
  };
  let shiftDetails: BonusLineResult["breakdown"]["shifts"] = [];

  switch (rule.bonusTypeCode) {
    case "production_meter": {
      const params = rule.parameters as import("@/types/bonus").ProductionMeterParams;
      const result = calculateProductionMeterBonus(employee, params, monthlyRigTotals, { periodEnd, rigTotalsByTypeAndScale, rigDailyTotalsByTypeAndScale, rigTypes });
      component.amount = result.totalBonus;
      component.details = {
        shiftBreakdown: result.shiftBreakdown,
        ...(result.prorate
          ? {
              prorate: result.prorate,
              splitFactor: result.prorate.splitFactor,
              divisorDays: result.prorate.divisorDays,
              divisorSource: result.prorate.divisorSource,
              rawTotal: result.prorate.rawTotal,
            }
          : {}),
      };
      shiftDetails = result.shiftBreakdown.map((sd) => ({
        date: sd.date, shift: sd.shift, rigName: sd.rigName, role: roleUsed,
        meters: sd.meters, drillingType: sd.drillingType, drillingLevel: null,
        depthScale: sd.depthScale ?? null,
        turn: turnForShift(sd.date, sd.shift, sd.rigName),
        componentBreakdown: [{
          bonusTypeCode: rule.bonusTypeCode, bonusTypeName: component.bonusTypeName,
          amount: sd.bonus, details: { rate: sd.rate, meters: sd.meters },
        }],
      }));
      break;
    }
    case "above_threshold": {
      const params = rule.parameters as import("@/types/bonus").AboveThresholdParams;
      const result = calculateAboveThresholdBonus(employee, params);
      component.amount = result.totalBonus;
      component.details = { shiftBreakdown: result.shiftBreakdown };
      shiftDetails = result.shiftBreakdown.map((sd) => ({
        date: sd.date, shift: sd.shift, rigName: sd.rigName, role: roleUsed,
        meters: sd.meters, drillingType: sd.drillingType, drillingLevel: null,
        depthScale: sd.depthScale ?? null,
        turn: turnForShift(sd.date, sd.shift, sd.rigName),
        componentBreakdown: [{
          bonusTypeCode: rule.bonusTypeCode, bonusTypeName: component.bonusTypeName,
          amount: sd.bonus, details: { threshold: sd.threshold, metersAbove: sd.metersAbove, multiplier: sd.multiplier, rate: sd.baseRate },
        }],
      }));
      break;
    }
    case "monthly_goal": {
      const params = rule.parameters as import("@/types/bonus").MonthlyGoalParams;
      const result = calculateMonthlyGoalBonus(employee, params, roleUsed, rigTotalsByType);
      component.amount = result.totalBonus;
      component.details = { goalResults: result.goalResults, qualifiedRigs: result.qualifiedRigs };
      break;
    }
    case "high_altitude": {
      const params = rule.parameters as import("@/types/bonus").HighAltitudeParams;
      const result = calculateHighAltitudeBonus(employee, params);
      component.amount = result.totalBonus;
      component.details = result.details;
      break;
    }
    case "end_of_season": {
      const params = rule.parameters as import("@/types/bonus").EndOfSeasonParams;
      if (employeeBaseSalaries?.[employee.employeeId]) {
        params.baseSalary = employeeBaseSalaries[employee.employeeId];
      }
      const evaluation = employeeSeasonEvaluations?.[employee.employeeId];
      const result = calculateEndOfSeasonBonus(employee, params, evaluation);
      component.amount = result.totalBonus;
      component.details = result.details;
      break;
    }
    case "directional": {
      const params = rule.parameters as import("@/types/bonus").DirectionalParams;
      const result = calculateDirectionalBonus(employee, params);
      component.amount = result.totalBonus;
      component.details = { shiftBreakdown: result.shiftBreakdown };
      shiftDetails = result.shiftBreakdown.map((sd) => ({
        date: sd.date, shift: sd.shift, rigName: sd.rigName, role: roleUsed,
        meters: 0, drillingType: sd.drillingType, drillingLevel: null,
        depthScale: null,
        turn: turnForShift(sd.date, sd.shift, sd.rigName),
        componentBreakdown: [{
          bonusTypeCode: rule.bonusTypeCode, bonusTypeName: component.bonusTypeName,
          amount: sd.bonus, details: { hours: sd.hours, hoursFactor: sd.hoursFactor, rate: sd.rate },
        }],
      }));
      break;
    }
    case "termination_adjustment": {
      // Handled as a gate in calculateBonuses(); here we just carry the config
      // through so the multiplier can be applied to all other components.
      const params = rule.parameters as import("@/types/bonus").TerminationParams;
      component.amount = 0;
      component.details = { reason: params.reason, terminationMultiplier: params.terminationMultiplier };
      break;
    }
    default:
      component.details = { error: `Unknown bonus type: ${rule.bonusTypeCode}` };
  }

  return { component, shiftDetails };
}

export function calculateBonuses(input: BonusEngineInput): BonusEngineResult {
  const lines: BonusLineResult[] = [];
  const sortedRules = [...input.rules].sort((a, b) => a.priority - b.priority);

  // Map season evaluations by employee id for end-of-season handling.
  const employeeSeasonEvaluations: Record<string, import("@/types/bonus").SeasonEvaluationInput> = {};
  for (const ev of input.seasonEvaluations ?? []) {
    employeeSeasonEvaluations[ev.employeeId] = ev;
  }

  for (const employee of input.employees) {
    // Role falls back to defaultRole when the employee has no shift contributions
    // (support / admin staff who qualify for MEJOR MÁQUINA best-rig bonus).
    const roleUsed = getMostFrequentRole(employee) || employee.defaultRole || "";
    const breakdown: BonusLineResult["breakdown"] = { shifts: [], attendanceGate: null };

    const hasProductionRules = sortedRules.some((r) =>
      r.bonusTypeCode !== "high_altitude" && r.bonusTypeCode !== "end_of_season" && r.bonusTypeCode !== "termination_adjustment"
    );
    // MEJOR MÁQUINA (best_rig) staff may have NO rig crew assignment even though
    // they still earn the best-rig bonus (Memo MV PRIMERO §2-3). Prefer honoring
    // a best-rig rule over skipping the employee.
    const hasBestRigRule = sortedRules.some(
      (r) => r.bonusTypeCode === "production_meter" &&
        (r.parameters as import("@/types/bonus").ProductionMeterParams | undefined)?.bestRigSelection === "best_rig_month",
    );
    const hasApplicableRule = hasBestRigRule || roleUsed
      ? sortedRules.some((r) => ruleAppliesToEmployee(r, employee, roleUsed))
      : false;
    if (employee.shifts.length === 0 && hasProductionRules && !hasApplicableRule) {
      lines.push({
        employeeId: employee.employeeId, fullName: employee.fullName, roleUsed,
        daysWorked: employee.daysWorked, totalMeters: 0, totalHours: 0,
        calculatedBonus: 0, components: [],
        breakdown: { ...breakdown, skipped: "No rig/crew assignments in period" },
      });
      continue;
    }

    const components: BonusComponentResult[] = [];
    let allShiftDetails: BonusLineResult["breakdown"]["shifts"] = [];

    // Termination adjustment gate: applies ONLY to employees who have per-employee
// termination state for this month (input.employeeTerminations). The multiplier
// (including witness orientation / equipment notification gates) is applied to
// ALL other bonus components. When an employee has no termination record, no
// adjustment applies and nothing is recorded.
let terminationMultiplier: number | null = null;
    let terminationReason: string | null = null;

    const employeeTermination = input.employeeTerminations?.[employee.employeeId];

    if (employeeTermination) {
      const result = calculateTerminationAdjustment(employee, employeeTermination);
      terminationMultiplier = resolveTerminationMultiplier(employeeTermination, false);
      terminationReason = result.explanation;
    }

    for (const rule of sortedRules) {
      if (!ruleAppliesToEmployee(rule, employee, roleUsed)) continue;
      if (rule.bonusTypeCode === "termination_adjustment") {
        continue; // gate only, contributes no direct amount
      }

      const { component, shiftDetails } = calculateRuleBonus(
        rule, employee, roleUsed, input.period.end, input.monthlyRigTotals, input.rigTotalsByType, input.rigTotalsByTypeAndScale, input.rigDailyTotalsByTypeAndScale, input.employeeBaseSalaries, employeeSeasonEvaluations, input.rigTypes,
      );
      if (component.amount > 0) components.push(component);
      allShiftDetails = [...allShiftDetails, ...shiftDetails];
    }

    // Apply the termination multiplier to all accumulated bonus components.
    let recordedMultiplier = false;
    if (terminationMultiplier !== null && terminationMultiplier !== 1) {
      for (const c of components) {
        const adjusted = c.amount * terminationMultiplier;
        c.amount = round2(adjusted);
        c.details.terminationAdjusted = true;
        c.details.terminationMultiplier = terminationMultiplier;
      }
      recordedMultiplier = true;
    } else if (terminationReason && terminationMultiplier === 1) {
      // 100% case – still document that the termination was evaluated.
      recordedMultiplier = true;
    }

    if (terminationReason && components.length > 0) {
      components.push({
        bonusTypeCode: "termination_adjustment",
        bonusTypeName: BONUS_TYPE_NAMES.termination_adjustment,
        amount: 0,
        details: {
          explanation: terminationReason,
          appliedMultiplier: terminationMultiplier ?? 1,
          adjusted: recordedMultiplier,
        },
      });
    }

    const totalMeters = employee.shifts.reduce((acc, s) => acc + s.meters, 0);
    const totalHours = employee.shifts.reduce((acc, s) => acc + (s.hours ?? 0), 0);
    const calculatedBonus = round2(components.reduce((acc, c) => acc + c.amount, 0));

    lines.push({
      employeeId: employee.employeeId, fullName: employee.fullName, roleUsed,
      daysWorked: employee.daysWorked, totalMeters: round2(totalMeters),
      totalHours: round2(totalHours), calculatedBonus, components,
      breakdown: { ...breakdown, shifts: allShiftDetails, attendanceGate: null },
    });
  }

  const totalBonus = round2(lines.reduce((acc, l) => acc + l.calculatedBonus, 0));
  return { lines, totalBonus };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
