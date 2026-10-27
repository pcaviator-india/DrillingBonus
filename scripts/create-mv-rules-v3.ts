/**
 * Creates ALL 6 rules of the fresh Mantoverde rule set, keyed with the
 * corrected drilling types (HQ, NQ, PQ, RC — no H1–H5) and the memo scales:
 *   - PQ has ONLY 0-500 / 500-1000 (memo Tabla 1/2 columns "PQ").
 *   - RC (Tabla 3) is a single scale 0-600; the 0-500/500-1000 rows are kept
 *     too because the rig-interval report emits those band keys.
 *   - H1/N1 = HQ column, H2/N2 = NQ column; H3/N3–H5/N5 = shared deeper
 *     tramos (1.900 / 1.500) of HQ and NQ.
 *   - NAVI/Devico is "Según Tramo" (Tabla 4, directional) — not priced here.
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

const bothRow = (perf: number, ayud: number) => ({ ...perfRow(perf), ...ayudRow(ayud) });

// Tabla 1 — Perforistas
const TABLE1 = {
  PQ: {
    "0-500": perfRow(1000),
    "500-1000": perfRow(1400),
  },
  HQ: {
    "0-500": perfRow(750),
    "500-1000": perfRow(900),
    "1000-1500": perfRow(1900),
    "1500-2000": perfRow(1900),
    "2000-2500": perfRow(1900),
  },
  NQ: {
    "0-500": perfRow(1200),
    "500-1000": perfRow(1600),
    "1000-1500": perfRow(1900),
    "1500-2000": perfRow(1900),
    "2000-2500": perfRow(1900),
  },
  RC: {
    "0-600": perfRow(300),
    "0-500": perfRow(300),
    "500-1000": perfRow(300),
  },
};

// Tabla 2 — Ayudantes
const TABLE2 = {
  PQ: {
    "0-500": ayudRow(1000),
    "500-1000": ayudRow(1000),
  },
  HQ: {
    "0-500": ayudRow(500),
    "500-1000": ayudRow(700),
    "1000-1500": ayudRow(1500),
    "1500-2000": ayudRow(1500),
    "2000-2500": ayudRow(1500),
  },
  NQ: {
    "0-500": ayudRow(900),
    "500-1000": ayudRow(1200),
    "1000-1500": ayudRow(1500),
    "1500-2000": ayudRow(1500),
    "2000-2500": ayudRow(1500),
  },
  RC: {
    "0-600": ayudRow(200),
    "0-500": ayudRow(200),
    "500-1000": ayudRow(200),
  },
};

// SEGUNDO — above-threshold base rates (the production rate in force).
const ABOVE_BASE_RATES = {
  PQ: {
    "0-500": bothRow(1000, 500),
    "500-1000": bothRow(1400, 700),
  },
  HQ: {
    "0-500": bothRow(750, 500),
    "500-1000": bothRow(900, 700),
  },
  NQ: {
    "0-500": bothRow(1200, 900),
    "500-1000": bothRow(1600, 1200),
  },
  RC: {
    "0-600": bothRow(300, 200),
    "0-500": bothRow(300, 200),
    "500-1000": bothRow(300, 200),
  },
};

// Rules 5/6 scope to the BONUS GROUPS from the Positions registry. The drilling
// crew is excluded because crew members have their own own-machine rules (1/2).
// Exclusions match the same token set (raw role, normalized, main position,
// group key) case-insensitively.
const GROUP1_FILTER = ["group1"]; // Group 1 – Supervision & Staff
const GROUP2_FILTER = ["group2"]; // Group 2 – Drilling Crew
const CREW_EXCLUDE = [
  // Perforistas (group1 members with their own Rule 1)
  "Perforista",
  "PERFORISTA BU",
  "PERFORISTA DDH",
  "PERFORISTA RC",
  "Driller",
  // Ayudantes / instructor (group2 members with their own Rule 2)
  "Ayudante",
  "Ayudante Perforista",
  "Ayudante de Perforista",
  "Ayudante de Perforista (Rigger)",
  "PERFORISTA (INSTRUCTOR)",
  "Instructor de Operaciones",
];
const PERFORISTA_FILTER = ["Perforista", "PERFORISTA (INSTRUCTOR)", "Driller"];
const AYUDANTE_FILTER = [
  "Ayudante Perforista",
  "Ayudante de Perforista",
  "Ayudante",
  "Helper",
  "Perforista Training",
];

async function main() {
  const site = (await prisma.site.findMany({ orderBy: { name: "asc" } })).find((s) =>
    s.name.toLowerCase().includes("mantoverde"),
  );
  if (!site) throw new Error("Mantoverde site not found");

  const prod = await prisma.bonusType.findUnique({ where: { code: "production_meter" } });
  const above = await prisma.bonusType.findUnique({ where: { code: "above_threshold" } });
  const goal = await prisma.bonusType.findUnique({ where: { code: "monthly_goal" } });
  if (!prod || !above || !goal) throw new Error("Missing bonus types — run seed first");

  // Replace the rules of the active MV rule set.
  const ruleSet = await prisma.bonusRuleSet.findFirst({
    where: { siteId: site.id, isActive: true },
  });
  if (!ruleSet) throw new Error("Active MV rule set not found — run create-mv-rule1.ts first");
  await prisma.bonusRule.deleteMany({ where: { ruleSetId: ruleSet.id } });
  const rules = [
    {
      bonusTypeId: prod.id,
      positionFilter: PERFORISTA_FILTER,
      drillingTypeFilter: [],
      priority: 1,
      parameters: { rateTable: TABLE1, bestRigSelection: "employee_rig", rateKey: "Perforista" } as object,
      notes:
        "Rule 1 — Bono Metro PERFORISTAS (PRIMERO §1): producción día+noche de la máquina por día en faena, Tarifa Perforistas (Tabla 1). PQ sólo 0-500/500-1000; RC una escala 0-600.",
    },
    {
      bonusTypeId: prod.id,
      positionFilter: AYUDANTE_FILTER,
      drillingTypeFilter: [],
      priority: 1,
      parameters: { rateTable: TABLE2, bestRigSelection: "employee_rig", rateKey: "Ayudante" } as object,
      notes:
        "Rule 2 — Bono Metro AYUDANTES (PRIMERO §1): Tabla 2, misma base día+noche por día en faena.",
    },
    {
      bonusTypeId: above.id,
      positionFilter: [...PERFORISTA_FILTER, ...AYUDANTE_FILTER],
      drillingTypeFilter: [],
      priority: 2,
      parameters: {
        thresholds: { PQ: 22, HQ: 22, NQ: 22, DDH: 22, RC: 50 },
        multiplier: 1.5,
        baseRateTable: ABOVE_BASE_RATES,
        incrementOnly: false,
      } as object,
      notes:
        "Rule 3 — Bono Extra (SEGUNDO): >22 m/turno Diamantina, >50 m/turno Aire Reverso; metros excedidos a tarifa × 1.5 (completo).",
    },
    {
      bonusTypeId: goal.id,
      positionFilter: [...PERFORISTA_FILTER, ...AYUDANTE_FILTER],
      drillingTypeFilter: [],
      priority: 3,
      parameters: {
        goals: { DIAMANTINA: 1000, RC: 2500 },
        amounts: {
          Perforista: 250000,
          "Ayudante Perforista": 125000,
          "Ayudante de Perforista": 125000,
        },
      } as object,
      notes:
        "Rule 4 — Bono meta (TERCERO): máquina >1.000 m Diamantina / >2.500 m RC (día+noche). Perforista 250.000, Ayudante 125.000.",
    },
    {
      bonusTypeId: prod.id,
      positionFilter: GROUP1_FILTER,
      positionExclude: CREW_EXCLUDE,
      drillingTypeFilter: [],
      priority: 1,
      parameters: {
        rateTable: TABLE1,
        bestRigSelection: "best_rig_month",
        attendanceProrate: { divisor: "days_in_month" },
        rateKey: "Perforista",
        bestRigRule: { arThresholdMeters: 2500 },
      } as object,
      notes:
        "Rule 5 — (PRIMERO §2) Group 1 Supervision & Staff: MEJOR MÁQUINA del mes, Tabla 1 (rateKey Perforista), prorrateado (total/30) × días trabajados. Gate RC 2.500 m. Excluye perforistas (Rule 1).",
    },
    {
      bonusTypeId: prod.id,
      positionFilter: GROUP2_FILTER,
      positionExclude: CREW_EXCLUDE,
      drillingTypeFilter: [],
      priority: 1,
      parameters: {
        rateTable: TABLE2,
        bestRigSelection: "best_rig_month",
        attendanceProrate: { divisor: "days_in_month" },
        rateKey: "Ayudante",
        bestRigRule: { arThresholdMeters: 2500 },
      } as object,
      notes:
        "Rule 6 — (PRIMERO §3) Group 2 Drilling Crew: MEJOR MÁQUINA del mes, Tabla 2 (rateKey Ayudante), prorrateado (total/30) × días trabajados. Gate RC 2.500 m. Excluye ayudantes (Rule 2).",
    },
  ];

  for (const r of rules) {
    await prisma.bonusRule.create({ data: { ...r, ruleSetId: ruleSet.id } });
  }

  const check = await prisma.bonusRuleSet.findFirst({
    where: { id: ruleSet.id },
    include: { rules: { include: { bonusType: true }, orderBy: { createdAt: "asc" } } },
  });
  console.log(`Rule set ${check?.id} now has ${check?.rules.length} rules:`);
  for (const r of check?.rules ?? []) {
    console.log(` - [${r.bonusType.code}] pri=${r.priority} filter=${r.positionFilter.length} pos | ${r.notes?.slice(0, 80)}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
