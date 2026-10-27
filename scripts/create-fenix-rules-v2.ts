/**
 * Creates the Proyecto Fenix Gold bonus rule set — Memo Final Fenix 200526.
 * Keyed with the corrected drilling types (HQ, NQ, PQ, RC — no H1–H5):
 *   - PQ has ONLY 0-500 / 500-1000.
 *   - H1/N1 = HQ column, H2/N2 = NQ column; H3/N3–H5/N5 = shared deeper
 *     tramos (1.900 / 1.500) of HQ and NQ.
 *   - RC (Tabla 3) single scale 0-600 (Perforistas 300, Soporte 200);
 *     0-500/500-1000 rows kept so the engine's normalized bands resolve.
 *   - NAVI/Devico is "Según Tramo" (Tabla 4) — not priced here.
 *
 * Rules (memo structure):
 *   1-2  Crew (PRIMERO §1): own machine day+night, Tabla 1 / Tabla 2.
 *   3    SEGUNDO: above threshold 22 m/turno DDH, 50 m/turno RC, ×1.5.
 *   4    CUARTO: monthly goal >1.500 m DIAMANTINA / >3.000 m RC — crew ONLY
 *        ("no aplica para personal de soporte"): Perforista 250.000, Ayudante 125.000.
 *   5    TERCERO: End of Season — 1 sueldo base, 50% asistencia + 50% excelencia.
 *   6-7  PRIMERO §2/§3: Group 1 / Group 2 — best rig of the month, prorated
 *        (raw / 30) × días trabajados, RC 2.500 m gate; crew excluded (rules 1-2).
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

const PERFORISTA_FILTER = ["Perforista", "PERFORISTA (INSTRUCTOR)", "Driller"];
const AYUDANTE_FILTER = [
  "Ayudante Perforista",
  "Ayudante de Perforista",
  "Ayudante",
  "Helper",
  "Perforista Training",
];
const CREW_FILTER = [...PERFORISTA_FILTER, ...AYUDANTE_FILTER];

// Rules 6/7 scope to the BONUS GROUPS from the Positions registry; crew excluded
// because crew members have their own own-machine rules (1/2).
const GROUP1_FILTER = ["group1"]; // Group 1 – Supervision & Staff
const GROUP2_FILTER = ["group2"]; // Group 2 – Drilling Crew
const CREW_EXCLUDE = [
  "Perforista",
  "PERFORISTA BU",
  "PERFORISTA DDH",
  "PERFORISTA RC",
  "Driller",
  "Ayudante",
  "Ayudante Perforista",
  "Ayudante de Perforista",
  "Ayudante de Perforista (Rigger)",
  "PERFORISTA (INSTRUCTOR)",
  "Instructor de Operaciones",
];

async function main() {
  const sites = await prisma.site.findMany({ orderBy: { name: "asc" } });
  const site = sites.find((s) => /fenix/i.test(s.name));
  if (!site) throw new Error("Fenix site not found");
  console.log("Site:", site.name, site.id);

  const getId = async (code: string) =>
    (await prisma.bonusType.findUnique({ where: { code } }))?.id;
  const prod = await getId("production_meter");
  const above = await getId("above_threshold");
  const goal = await getId("monthly_goal");
  const eos = await getId("end_of_season");
  if (!prod || !above || !goal || !eos) throw new Error("Missing bonus types — run seed first");

  // Replace the rules of the active Fenix rule set, creating it if missing.
  let ruleSet = await prisma.bonusRuleSet.findFirst({
    where: { siteId: site.id, isActive: true },
  });
  if (!ruleSet) {
    ruleSet = await prisma.bonusRuleSet.create({
      data: {
        siteId: site.id,
        name: "Fenix - Bono Producción (Memo 200526)",
        version: 1,
        effectiveFrom: new Date("2026-05-01T00:00:00Z"),
        isActive: true,
      },
    });
    console.log("Created rule set", ruleSet.id);
  }
  await prisma.bonusRule.deleteMany({ where: { ruleSetId: ruleSet.id } });
  // RULES_PLACEHOLDER
  const rules = [
    {
      bonusTypeId: prod,
      positionFilter: PERFORISTA_FILTER,
      drillingTypeFilter: [],
      priority: 1,
      parameters: { rateTable: TABLE1, bestRigSelection: "employee_rig", rateKey: "Perforista" } as object,
      notes:
        "Rule 1 — Bono Metro PERFORISTAS (PRIMERO §1): producción día+noche de su máquina por día en faena, Tabla 1.",
    },
    {
      bonusTypeId: prod,
      positionFilter: AYUDANTE_FILTER,
      drillingTypeFilter: [],
      priority: 1,
      parameters: { rateTable: TABLE2, bestRigSelection: "employee_rig", rateKey: "Ayudante" } as object,
      notes: "Rule 2 — Bono Metro AYUDANTES (PRIMERO §1): su máquina día+noche, Tabla 2.",
    },
    {
      bonusTypeId: above,
      positionFilter: CREW_FILTER,
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
      bonusTypeId: goal,
      positionFilter: CREW_FILTER,
      drillingTypeFilter: [],
      priority: 3,
      parameters: {
        goals: { DIAMANTINA: 1500, RC: 3000 },
        amounts: {
          Perforista: 250000,
          "Ayudante Perforista": 125000,
          "Ayudante de Perforista": 125000,
        },
      } as object,
      notes:
        "Rule 4 — Bono meta (CUARTO): máquina >1.500 m Diamantina / >3.000 m RC (día+noche). Perforista 250.000, Ayudante 125.000. Sólo perforistas y ayudantes.",
    },
    {
      bonusTypeId: eos,
      positionFilter: CREW_FILTER,
      drillingTypeFilter: [],
      priority: 4,
      parameters: {
        totalDays: 258,
        baseSalary: 1000000,
        attendanceWeight: 0.5,
        excellenceWeight: 0.5,
        salaryMultiplier: 1,
      } as object,
      notes:
        "Rule 5 — Bono término de temporada (TERCERO): 1 sueldo base imponible, 50% asistencia + 50% excelencia operacional. Sólo perforistas y ayudantes. Ajustar baseSalary/totalDays por proyecto.",
    },
    {
      bonusTypeId: prod,
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
        "Rule 6 — (PRIMERO §2) Group 1 Supervision & Staff: MEJOR MÁQUINA del mes, Tabla 1 (rateKey Perforista), prorrateado (total/30) × días trabajados. Gate RC 2.500 m. Excluye perforistas (Rule 1).",
    },
    {
      bonusTypeId: prod,
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
        "Rule 7 — (PRIMERO §3) Group 2 Drilling Crew: MEJOR MÁQUINA del mes, Tabla 2 (rateKey Ayudante), prorrateado (total/30) × días trabajados. Gate RC 2.500 m. Excluye ayudantes (Rule 2).",
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
