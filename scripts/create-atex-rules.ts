import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Shared rate tables (Coipa-style memo tables 1-4)
const drillerRates = {
  PQ: { "0-500": { Perforista: 1000 }, "500-1000": { Perforista: 1400 } },
  H1: { "0-500": { Perforista: 750 }, "500-1000": { Perforista: 900 } },
  H2: { "0-500": { Perforista: 1200 }, "500-1000": { Perforista: 1600 } },
  H3: { "1000-1500": { Perforista: 1900 }, "1500-2000": { Perforista: 1900 } },
  NAVI: { "2000-2500": { Perforista: 1900 } },
};
const helperRates = {
  PQ: { "0-500": { Ayudante: 500 }, "500-1000": { Ayudante: 700 } },
  H1: { "0-500": { Ayudante: 500 }, "500-1000": { Ayudante: 700 } },
  H2: { "0-500": { Ayudante: 900 }, "500-1000": { Ayudante: 1200 } },
  H3: { "1000-1500": { Ayudante: 1500 }, "1500-2000": { Ayudante: 1500 } },
  NAVI: { "2000-2500": { Ayudante: 1500 } },
};
const aboveThresholdRates = {
  DDH: { "0-500": { Perforista: 750, Ayudante: 500 }, "500-1000": { Perforista: 900, Ayudante: 700 } },
  RC: { "0-500": { Perforista: 1000, Ayudante: 500 }, "500-1000": { Perforista: 1400, Ayudante: 700 } },
};

async function main() {
  console.log("Creating bonus rule set for ATEX...\n");

  const atex = await prisma.site.findFirst({ where: { name: { contains: "Atex" } } });
  if (!atex) {
    console.error("Site matching 'Atex' not found. Create the site first, then re-run this script.");
    return;
  }
  console.log(`Found site: ${atex.name} (${atex.id})`);

  const bonusTypes = await prisma.bonusType.findMany();
  const btMap = new Map(bonusTypes.map((bt) => [bt.code, bt.id]));
  const getId = (code: string) => {
    const id = btMap.get(code);
    if (!id) throw new Error(`Bonus type '${code}' not found`);
    return id;
  };

  const ids = {
    production_meter: getId("production_meter"),
    above_threshold: getId("above_threshold"),
    monthly_goal: getId("monthly_goal"),
    end_of_season: getId("end_of_season"),
    directional: getId("directional"),
  };

  await prisma.bonusRuleSet.deleteMany({ where: { siteId: atex.id } });

  await prisma.bonusRuleSet.create({
    data: {
      siteId: atex.id,
      name: "ATEX - Program Extension 2025-2026",
      version: 1,
      effectiveFrom: new Date("2025-09-15T00:00:00Z"),
      isActive: true,
      rules: { create: buildRules(getId) },
    },
  });

  console.log("  ATEX rules created successfully!");
}

function buildRules(getId: (code: string) => string) {
  return [
    {
      bonusTypeId: getId("production_meter"),
      positionFilter: ["Perforista", "Driller"],
      drillingTypeFilter: [],
      priority: 1,
      parameters: { rateTable: drillerRates, bestRigSelection: "employee_rig" },
      notes:
        "Production Meters Drillers: total production of the rig where the driller worked during the month (shifts onsite) x effective days onsite",
    },
    {
      bonusTypeId: getId("production_meter"),
      positionFilter: ["Ayudante", "Helper", "Soporte", "Support"],
      drillingTypeFilter: [],
      priority: 1,
      parameters: { rateTable: helperRates, bestRigSelection: "employee_rig" },
      notes: "Production Meters Helpers: rig meters x effective days onsite",
    },
    {
      bonusTypeId: getId("production_meter"),
      positionFilter: ["Supervisor", "Jefe de Faena", "Supervisor HSEC", "HESQ"],
      drillingTypeFilter: [],
      priority: 1,
      parameters: {
        rateTable: {
          DDH: { "0-600": { Supervisor: 300, "Jefe de Faena": 300, "Supervisor HSEC": 300, HESQ: 300 } },
        },
        bestRigSelection: "best_rig_month",
      },
      notes:
        "Production Meters Support: best rig of the month / 30 days x effective days onsite (flat DEPTH SCALE $300)",
    },
    {
      bonusTypeId: getId("above_threshold"),
      positionFilter: ["Perforista", "Driller", "Ayudante", "Helper"],
      drillingTypeFilter: [],
      priority: 2,
      parameters: { thresholds: { DDH: 22, RC: 50 }, multiplier: 1.5, baseRateTable: aboveThresholdRates },
      notes: "Production Above 22 and 50 meters per shift - 1.5x on meters above threshold",
    },
    {
      bonusTypeId: getId("monthly_goal"),
      positionFilter: ["Perforista", "Driller", "Ayudante", "Helper"],
      drillingTypeFilter: [],
      priority: 3,
      parameters: { goals: { DDH: 1000, RC: 2500 }, amounts: { Perforista: 250000, Ayudante: 125000 } },
      notes: "Production Above Month Goal: rig exceeds 1000m DDH / 2500m RC in month -> 250.000 / 125.000",
    },
    {
      bonusTypeId: getId("directional"),
      positionFilter: ["Perforista", "Driller"],
      drillingTypeFilter: [],
      priority: 2,
      parameters: {
        hoursFactor: 22 / 10.5,
        rateTable: { "0-500": 1000, "500-1000": 1400, "1000-1500": 1900, "1500-2000": 1900, "2000-2500": 1900 },
      },
      notes:
        "Directional: total directional drilling hours x (22/10.5) conversion factor x rate of hole depth/diameter",
    },
    {
      bonusTypeId: getId("end_of_season"),
      positionFilter: ["Perforista", "Driller", "Ayudante", "Helper"],
      drillingTypeFilter: [],
      priority: 1,
      parameters: { salaryMultiplier: 3, totalDays: 258, baseSalary: 1000000 },
      notes:
        "End of Season: 3 base salaries pro-rated over 258 days (15/09/2025-31/05/2026) by employee days onsite",
    },
  ];
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
