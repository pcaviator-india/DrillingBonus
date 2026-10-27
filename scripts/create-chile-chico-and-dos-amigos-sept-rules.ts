/**
 * Creates the September 2026 bonus rule sets for:
 *  1. Proyecto Chile Chico (Memo Septiembre 2026 - version 2, preserving old version 1 rules)
 *  2. Dos Amigos (Memo Septiembre 2026 - version 1)
 *
 * Regime:
 *   - Evaluated on MEJOR MÁQUINA (best rig of the month).
 *   - Both day + night production divided by 2 (splitFactor: 2).
 *   - Prorated by effective attendance: ((rawTotal / 2) / 30) * daysWorked.
 *   - Rate tables: 12 depth bands (0-100, 100-200, ..., 1100-1200).
 *   - Table 1: Supervisors, Drillers (Perforistas), HSEC (rateKey: "Perforista").
 *   - Table 2: Helpers (Ayudantes), Support, Admin, Others (rateKey: "Ayudante").
 *   - Additional bonuses (CLP 2M crew excellence bonus and mechanical availability)
 *     are explicitly omitted per instructions.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const perfRow = (rate: number) => ({ Perforista: rate, Driller: rate });
const ayudRow = (rate: number) => ({
  Ayudante: rate,
  Helper: rate,
  "Ayudante Perforista": rate,
  "Ayudante de Perforista": rate,
});

// Rates for Table 1 (Supervisors / Drillers / HSEC)
const TRAMOS_HQ_G1: Record<string, number> = {
  "0-100": 550,
  "100-200": 650,
  "200-300": 750,
  "300-400": 850,
  "400-500": 950,
  "500-600": 1050,
  "600-700": 1150,
  "700-800": 1250,
  "800-900": 1350,
  "900-1000": 1450,
  "1000-1100": 1550,
  "1100-1200": 1650,
  "100-1200": 1650, // Typo guard from PDF memo
};

const TRAMOS_NQ_G1: Record<string, number> = {
  "0-100": 450,
  "100-200": 550,
  "200-300": 650,
  "300-400": 750,
  "400-500": 850,
  "500-600": 950,
  "600-700": 1050,
  "700-800": 1150,
  "800-900": 1250,
  "900-1000": 1350,
  "1000-1100": 1450,
  "1100-1200": 1550,
  "100-1200": 1550,
};

// Rates for Table 2 (Helpers / Support / Others)
const TRAMOS_HQ_G2: Record<string, number> = {
  "0-100": 350,
  "100-200": 450,
  "200-300": 550,
  "300-400": 650,
  "400-500": 750,
  "500-600": 850,
  "600-700": 950,
  "700-800": 1050,
  "800-900": 1150,
  "900-1000": 1250,
  "1000-1100": 1350,
  "1100-1200": 1450,
  "100-1200": 1450,
};

const TRAMOS_NQ_G2: Record<string, number> = {
  "0-100": 300,
  "100-200": 400,
  "200-300": 500,
  "300-400": 600,
  "400-500": 700,
  "500-600": 800,
  "600-700": 900,
  "700-800": 1000,
  "800-900": 1100,
  "900-1000": 1200,
  "1000-1100": 1300,
  "1100-1200": 1400,
  "100-1200": 1400,
};

const mapScales = (tramos: Record<string, number>, rowFn: (r: number) => Record<string, number>) =>
  Object.fromEntries(Object.entries(tramos).map(([scale, rate]) => [scale, rowFn(rate)]));

// Table 1 (Group 1): HQ & NQ as defined in memo, plus fallbacks for other diameters
const TABLE1: Record<string, Record<string, Record<string, number>>> = {
  HQ: mapScales(TRAMOS_HQ_G1, perfRow),
  NQ: mapScales(TRAMOS_NQ_G1, perfRow),
  PQ: mapScales(TRAMOS_HQ_G1, perfRow),
  DDH: mapScales(TRAMOS_HQ_G1, perfRow),
  NAVI: mapScales(TRAMOS_HQ_G1, perfRow),
};

// Table 2 (Group 2): HQ & NQ as defined in memo, plus fallbacks for other diameters
const TABLE2: Record<string, Record<string, Record<string, number>>> = {
  HQ: mapScales(TRAMOS_HQ_G2, ayudRow),
  NQ: mapScales(TRAMOS_NQ_G2, ayudRow),
  PQ: mapScales(TRAMOS_HQ_G2, ayudRow),
  DDH: mapScales(TRAMOS_HQ_G2, ayudRow),
  NAVI: mapScales(TRAMOS_HQ_G2, ayudRow),
};

const TRAMO_ALIASES: Record<string, string> = {
  "100-1200": "1100-1200",
};

const GROUP1_FILTER = ["group1", "Perforista", "Driller", "Supervisor", "Jefe de Faena", "HSEC", "HESQ"];
const GROUP2_FILTER = ["group2", "Ayudante", "Helper", "Ayudante Perforista", "Ayudante de Perforista"];

async function createRulesForSite(siteId: string, siteName: string, ruleSetName: string, version: number) {
  const prod = (await prisma.bonusType.findUnique({ where: { code: "production_meter" } }))?.id;
  const termination = (await prisma.bonusType.findUnique({ where: { code: "termination_adjustment" } }))?.id;
  if (!prod || !termination) throw new Error("Missing bonus types — seed first");

  // Check if a rule set with this name already exists for this site
  const existing = await prisma.bonusRuleSet.findFirst({
    where: { siteId, name: ruleSetName },
  });

  let ruleSet;
  if (existing) {
    ruleSet = existing;
    await prisma.bonusRule.deleteMany({ where: { ruleSetId: ruleSet.id } });
    console.log(`Updating existing rule set ${ruleSet.id} for ${siteName}`);
  } else {
    ruleSet = await prisma.bonusRuleSet.create({
      data: {
        siteId,
        name: ruleSetName,
        version,
        effectiveFrom: new Date("2026-09-01T00:00:00Z"),
        isActive: true,
      },
    });
    console.log(`Created new rule set ${ruleSet.id} (${ruleSetName}) for ${siteName}`);
  }

  const rules = [
    {
      bonusTypeId: prod,
      positionFilter: GROUP1_FILTER,
      positionExclude: [],
      drillingTypeFilter: [],
      priority: 1,
      parameters: {
        rateTable: TABLE1,
        bestRigSelection: "best_rig_month",
        rateKey: "Perforista",
        splitFactor: 2,
        attendanceProrate: { divisor: "days_in_month" },
        depthScaleAliases: TRAMO_ALIASES,
      } as object,
      notes:
        "Rule 1 — Group 1 (Supervisors / Drillers / HSEC): MEJOR MÁQUINA del mes, tarifas Tabla 1 (Perforista), producción dividida en 2 (splitFactor: 2), prorrateado (total ÷ 2 ÷ 30) × días trabajados.",
    },
    {
      bonusTypeId: prod,
      positionFilter: GROUP2_FILTER,
      positionExclude: [],
      drillingTypeFilter: [],
      priority: 1,
      parameters: {
        rateTable: TABLE2,
        bestRigSelection: "best_rig_month",
        rateKey: "Ayudante",
        splitFactor: 2,
        attendanceProrate: { divisor: "days_in_month" },
        depthScaleAliases: TRAMO_ALIASES,
      } as object,
      notes:
        "Rule 2 — Group 2 (Helpers / Support / Admin / Others): MEJOR MÁQUINA del mes, tarifas Tabla 2 (Ayudante), producción dividida en 2 (splitFactor: 2), prorrateado (total ÷ 2 ÷ 30) × días trabajados.",
    },
    {
      bonusTypeId: termination,
      positionFilter: [],
      drillingTypeFilter: [],
      priority: 3,
      parameters: {
        reason: `${siteName}: aplicar según causal de término registrada para el trabajador (SEGUNDO)`,
        terminationMultiplier: 1,
      } as object,
      notes: "Rule 3 — Condiciones de pago de bonos en caso de término de contrato (SEGUNDO).",
    },
  ];

  for (const r of rules) {
    await prisma.bonusRule.create({ data: { ...r, ruleSetId: ruleSet.id } });
  }

  const count = await prisma.bonusRule.count({ where: { ruleSetId: ruleSet.id } });
  console.log(`Rule set ${ruleSet.id} (${siteName}) configured with ${count} rules.`);
}

async function main() {
  console.log("=== Creating September 2026 Rules for Chile Chico and Dos Amigos ===\n");

  // 1. Chile Chico
  const chileChico = await prisma.site.findFirst({
    where: { name: { contains: "Chile Chico" } },
  });
  if (!chileChico) throw new Error("Site Chile Chico not found");

  // Set effectiveTo on the old July rule set so it is preserved for July/August
  const oldRuleSet = await prisma.bonusRuleSet.findFirst({
    where: { siteId: chileChico.id, name: { contains: "Julio" } },
  });
  if (oldRuleSet) {
    await prisma.bonusRuleSet.update({
      where: { id: oldRuleSet.id },
      data: {
        effectiveTo: new Date("2026-08-31T23:59:59.999Z"),
      },
    });
    console.log(`Preserved old rule set ${oldRuleSet.name} (effectiveTo: 2026-08-31)`);
  }

  const latestCC = await prisma.bonusRuleSet.findFirst({
    where: { siteId: chileChico.id },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const newCCVersion = (latestCC?.version ?? 1) + 1;

  await createRulesForSite(
    chileChico.id,
    chileChico.name,
    "Chile Chico - Bono Producción (Memo Septiembre 2026)",
    newCCVersion,
  );

  // 2. Dos Amigos
  let dosAmigos = await prisma.site.findFirst({
    where: { name: { contains: "Dos Amigos" } },
  });
  if (!dosAmigos) {
    console.log("Site Dos Amigos not found, creating it...");
    dosAmigos = await prisma.site.create({
      data: {
        name: "Proyecto Dos Amigos",
        code: "08",
        isActive: true,
      },
    });
  }

  const latestDA = await prisma.bonusRuleSet.findFirst({
    where: { siteId: dosAmigos.id },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const newDAVersion = (latestDA?.version ?? 0) + 1;

  await createRulesForSite(
    dosAmigos.id,
    dosAmigos.name,
    "Dos Amigos - Bono Producción (Memo Septiembre 2026)",
    newDAVersion,
  );

  console.log("\n=== Done! Both sites successfully configured. ===");
}

main()
  .catch((e) => {
    console.error("Error creating rules:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
