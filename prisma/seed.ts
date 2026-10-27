import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

const ROLES = ["Supervisor", "Driller", "Driver", "Helper"];

/**
 * Seed bonus types - these are the reusable building blocks for bonus calculations.
 * Each bonus type defines a calculation pattern that can be configured per site.
 */
const BONUS_TYPES = [
  {
    code: "production_meter",
    name: "Production Meter Bonus",
    description: "Per-meter rate based on drilling type, depth scale, and position. Primary bonus type used across all sites.",
    parameterSchema: {
      type: "object",
      properties: {
        rateTable: { type: "object", description: "rateTable[drillingType][depthScale][position] = rate per meter" },
                bestRigSelection: { type: "string", enum: ["employee_rig_month", "best_rig_month", "employee_rig"] },
        maxMetersPerShift: { type: "number", description: "Optional cap on meters per shift" },
        bestRigRule: {
          type: "object",
          description: "MEJOR MAQUINA selection: top AIRE_REVERSO rig wins when its rig monthly total is strictly greater than arThresholdMeters, else top DIAMANTINA rig",
          properties: { arThresholdMeters: { type: "number", description: "AR monthly meters gate (e.g. 2500)" } },
        },
      },
      required: ["rateTable", "bestRigSelection"],
    },
    requiresProductionData: true,
    displayOrder: 1,
  },
  {
    code: "above_threshold",
    name: "Above Threshold Bonus",
    description: "Bonus for meters exceeding daily threshold per shift (e.g., >22m DDH, >50m RC). Paid at a multiplier of the base rate.",
    parameterSchema: {
      type: "object",
      properties: {
        thresholds: { type: "object", description: "thresholds[drillingType] = meters threshold" },
        multiplier: { type: "number", description: "Bonus multiplier (e.g., 1.5 for 50% bonus)" },
        baseRateTable: { type: "object", description: "Same structure as production meter rateTable" },
      },
      required: ["thresholds", "multiplier", "baseRateTable"],
    },
    requiresProductionData: true,
    displayOrder: 2,
  },
  {
    code: "monthly_goal",
    name: "Monthly Goal Bonus",
    description: "Flat bonus when rig exceeds monthly production goals. Only driller and helper on that rig receive it.",
    parameterSchema: {
      type: "object",
      properties: {
        goals: { type: "object", description: "goals[drillingType] = goal meters" },
        amounts: { type: "object", description: "amounts[position] = bonus amount" },
      },
      required: ["goals", "amounts"],
    },
    requiresProductionData: true,
    displayOrder: 3,
  },
  {
    code: "high_altitude",
    name: "High Altitude Bonus",
    description: "Flat monthly bonus, pro-rated by days onsite by default; optional full payment when daysWorked >= 1 (e.g., $250,000/month at Coipa).",
    parameterSchema: {
      type: "object",
      properties: {
        monthlyAmount: { type: "number", description: "Full month bonus amount" },
        daysInMonth: { type: "number", description: "Days in month for pro-rating (default 30)" },
        payMode: { type: "string", description: "prorated (default) or full (daysWorked >= 1 gets full amount)" },
      },
      required: ["monthlyAmount"],
    },
    requiresProductionData: false,
    displayOrder: 4,
  },
  {
    code: "end_of_season",
    name: "End of Season Bonus",
    description: "Base salary multiplier pro-rated by contract days (e.g., 1 salary at Fenix, 3 at ATEX).",
    parameterSchema: {
      type: "object",
      properties: {
        salaryMultiplier: { type: "number", description: "Number of salaries to pay" },
        totalDays: { type: "number", description: "Total days in the season" },
        baseSalary: { type: "number", description: "Employee base salary (overridable per employee)" },
      },
      required: ["salaryMultiplier", "totalDays", "baseSalary"],
    },
    requiresProductionData: false,
    displayOrder: 5,
  },
  {
    code: "directional",
    name: "Directional Drilling Bonus",
    description: "Bonus for directional drilling: hours × factor × rate by depth/diameter.",
    parameterSchema: {
      type: "object",
      properties: {
        rateTable: { type: "object", description: "rateTable[drillingType][depthScale] = rate" },
        hoursFactor: { type: "number", description: "Hours conversion factor (e.g., 22/10.5 = 2.1)" },
      },
      required: ["rateTable", "hoursFactor"],
    },
    requiresProductionData: true,
    displayOrder: 6,
  },
  {
    code: "termination_adjustment",
    name: "Termination Adjustment",
    description: "Gate that multiplies all other bonuses for the month in which the employment relationship ends, per the termination rules in every memo.",
    parameterSchema: {
      type: "object",
      properties: {
        terminationMultiplier: { type: "number", description: "Multiplier for other bonuses: 0 = forfeit, 1 = full (0-1)" },
        reason: { type: "string", description: "Termination reason: renuncia_sin_aviso, renuncia_con_aviso, art161, fin_contrato, art160" },
        witnessOrientationOk: { type: "boolean", description: "Whether witness orientation was completed correctly" },
        equipmentNotificationOk: { type: "boolean", description: "Whether defective equipment was notified in time" },
      },
      required: ["terminationMultiplier", "reason"],
    },
    requiresProductionData: false,
    displayOrder: 7,
  },
];

async function main() {
  // Seed roles
  for (const name of ROLES) {
    await prisma.role.upsert({
      where: { name },
      create: { name },
      update: {},
    });
  }
  console.log(`✅ Roles ensured: ${ROLES.join(", ")}`);

  // Seed bonus types
  for (const bt of BONUS_TYPES) {
    await prisma.bonusType.upsert({
      where: { code: bt.code },
      create: bt,
      update: { name: bt.name, description: bt.description, parameterSchema: bt.parameterSchema, displayOrder: bt.displayOrder },
    });
  }
  console.log(`✅ Bonus types ensured: ${BONUS_TYPES.map((b) => b.code).join(", ")}`);

  // Seed admin user
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "admin123";
  await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: "Admin",
      role: "admin",
      passwordHash: await hashPassword(password),
    },
    update: {},
  });
  console.log(`✅ Admin user ensured: ${email} (password: ${password})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
