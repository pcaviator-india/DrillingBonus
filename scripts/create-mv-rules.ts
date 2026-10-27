import { PrismaClient } from "@prisma/client";

/**
 * Creates the Proyecto Mantoverde bonus rule set (PERIOD-AGNOSTIC config –
 * it applies to every calculation until replaced; version bump = config change,
 * not a month change), aligned to:
 *   - Memo Final MV_Estructura de Bonos 200526 (Capstone Copper) — Tablas 1/2/3
 *   - "Cálculo Bono Produccion Recon Drilling - Julio REV TA-TB EH_.xlsx"
 *
 * Drilling types are keyed with the SAME codes the normalization pipeline
 * produces from rig intervals (see src/lib/calculations/run.ts):
 *   HQ -> H1, NQ -> H2, PQ -> PQ, RockH / RockT (prefix) -> RC (Aire Reverso).
 * Jitu's sheet calls these "DDH" (Diamantina) and "RC" (Aire Reverso).
 *
 * Position filters use the ACTUAL role names found in planilla cargos and
 * Workera default roles (verified against the production DB for MV):
 *   crew roleOnShift: Perforista, Ayudante Perforista, PERFORISTA (INSTRUCTOR), MECANICO FLOTA
 *   workera defaultRole: Ayudante de Perforista, Mecánico, Chofer, Administrativo de Faena, ...
 *
 * Rules:
 *  1. production_meter (employee_rig) Perforista — Tabla 1 rates (Bono Metro,
 *     machine day+night production per day onsite).
 *  2. production_meter (employee_rig) Ayudante de Perforista — Tabla 2 rates.
 *  3. above_threshold incrementOnly (SEGUNDO) — >22 m/turno Diamantina,
 *     >50 m/turno Aire Reverso, pays only the +50% increment.
 *  4. monthly_goal (TERCERO) — machine >1.000 m Diamantina / >2.500 m RC,
 *     Perforista $250.000 / Ayudante $125.000.
 *  5. production_meter (best_rig_month) Jefes/Supervisores/HSEC — Tabla 1,
 *     prorated (raw / daysInMonth) * daysWorked (PRIMERO §2).
 *  6. production_meter (best_rig_month) Admin/apoyo — Tabla 2, prorated
 *     (PRIMERO §3).
 */

const prisma = new PrismaClient();

// Per-row helper: same value under every role label that maps to the position,
// so rate lookups resolve for planilla cargo variants ("Ayudante Perforista"),
// Workera roles ("Ayudante de Perforista") and legacy codes ("Perforista").
const perfRow = (perforista: number) => ({ Perforista: perforista, Driller: perforista });
const ayudRow = (ayudante: number) => ({
  Ayudante: ayudante,
  Helper: ayudante,
  "Ayudante Perforista": ayudante,
  "Ayudante de Perforista": ayudante,
});

// Tabla 1 — Perforistas (memo: PQ 1.000/1.400, H1 750/900, H2 1.200/1.600,
// H3+ 1.900) + Tabla 3 Aire Reverso (0-600 -> 300).
const TABLE1 = {
  PQ: { "0-500": perfRow(1000), "500-1000": perfRow(1400) },
  H1: { "0-500": perfRow(750), "500-1000": perfRow(900) },
  H2: { "0-500": perfRow(1200), "500-1000": perfRow(1600) },
  H3: { "1000-1500": perfRow(1900), "1500-2000": perfRow(1900) },
  H4: { "2000-2500": perfRow(1900) },
  H5: { "2000-2500": perfRow(1900) },
  NAVI: { "2000-2500": perfRow(1900) },
  RC: { "0-500": perfRow(300), "500-1000": perfRow(300) },
};

// Tabla 2 — Ayudantes de Perforista (PQ/H1 500/700, H2 900/1.200, H3+ 1.500)
// + Tabla 3 Aire Reverso (0-600 -> 200).
const TABLE2 = {
  PQ: { "0-500": ayudRow(500), "500-1000": ayudRow(700) },
  H1: { "0-500": ayudRow(500), "500-1000": ayudRow(700) },
  H2: { "0-500": ayudRow(900), "500-1000": ayudRow(1200) },
  H3: { "1000-1500": ayudRow(1500), "1500-2000": ayudRow(1500) },
  H4: { "2000-2500": ayudRow(1500) },
  H5: { "2000-2500": ayudRow(1500) },
  NAVI: { "2000-2500": ayudRow(1500) },
  RC: { "0-500": ayudRow(200), "500-1000": ayudRow(200) },
};

// Above Threshold (SEGUNDO): >22 m/turno Diamantina, >50 m/turno Aire Reverso.
// Base rates = the current production rate of each type (both positions).
const ABOVE_BASE_RATES = {
  PQ: {
    "0-500": { ...perfRow(1000), ...ayudRow(500) },
    "500-1000": { ...perfRow(1400), ...ayudRow(700) },
  },
  H1: {
    "0-500": { ...perfRow(750), ...ayudRow(500) },
    "500-1000": { ...perfRow(900), ...ayudRow(700) },
  },
  H2: {
    "0-500": { ...perfRow(1200), ...ayudRow(900) },
    "500-1000": { ...perfRow(1600), ...ayudRow(1200) },
  },
  RC: {
    "0-500": { ...perfRow(300), ...ayudRow(200) },
    "500-1000": { ...perfRow(300), ...ayudRow(200) },
  },
};

// Actual MV role names (planilla cargo + Workera), mutually exclusive groups.
const PERFORISTA_FILTER = ["Perforista", "PERFORISTA (INSTRUCTOR)", "Driller"];
const AYUDANTE_FILTER = [
  "Ayudante Perforista",
  "Ayudante de Perforista",
  "Ayudante",
  "Helper",
  "Perforista Training",
];
const JEFE_HSEC_FILTER = [
  "Jefe de Faena",
  "Supervisor",
  "Supervisor de Operaciones",
  "Supervisor de Mantención",
  "Supervisor Eléctrico",
  "Superintendente de Mantención",
  "Jefe de Taller",
  "Prevencionista de Riesgos",
  "Líder de Prevención",
  "HSEC",
  "Supervisor HSEC",
  "Gerente de HSEC",
  "Controladora de Gestión HSEC",
];
const APOYO_FILTER = [
  "Chofer",
  "Chofer de Servicios",
  "Mecánico",
  "MECANICO FLOTA",
  "Mecánico Líder",
  "Electromecánico",
  "Soldador",
  "Ayudante Mecánico",
  "Ayudante de Soldador",
  "Ayudante de Pintor",
  "Bodeguero",
  "Bodeguero Trainee",
  "Administrativo de Faena",
  "Administrativo Avanzado",
  "Administrativo Senior",
  "Administrador de Contrato",
  "Administrador de Contrato Junior",
  "Contador",
  "Analista Contable",
  "Encargado de Contratos",
  "Encargada de Selección",
  "Encargada de Documentación",
  "Encargada de Administración y Contabilidad",
  "Controladora de Cuentas Experta",
  "Coordinadora de Operaciones",
  "Coordinadora Administrativa",
  "Coordinadora de Recursos Humanos",
  "Coordinadora de Logística",
  "Planificador",
  "Planificadora Administrativa",
  "Analista de Logística",
  "Analista Recursos Humanos",
  "Asistente de Planificación",
  "Asistente Administrativa",
  "Asistente Avanzada de Logística",
  "Asistente de Recursos Humanos",
  "Asistente de Compras",
  "Asistente de Flota",
  "Asistente Logístico",
  "Asistente de Acreditación",
  "Líder de Acreditación",
  "Ingeniero de Proyectos",
  "Instructor de Operaciones",
  "Jefe de Formación y Evaluación",
  "Recepcionista",
  "Dibujante Técnico",
  "Profesora de Idiomas",
  "Cargo indefinido (por defecto)",
];
async function main() {
  const site = (await prisma.site.findMany({ orderBy: { name: "asc" } })).find((s) =>
    s.name.toLowerCase().includes("mantoverde"),
  );
  if (!site) throw new Error("Mantoverde site not found");

  const bonusTypes = await prisma.bonusType.findMany();
  const getId = (code: string) => bonusTypes.find((b) => b.code === code)?.id;
  const prod = getId("production_meter");
  const above = getId("above_threshold");
  const goal = getId("monthly_goal");
  if (!prod || !above || !goal) throw new Error("Missing bonus types — run seed first");

  // Idempotent: deactivate prior active MV rule set, create the corrected one.
  await prisma.bonusRuleSet.updateMany({
    where: { siteId: site.id, isActive: true },
    data: { isActive: false },
  });

  const ruleSet = await prisma.bonusRuleSet.create({
    data: {
      siteId: site.id,
      name: "MV - Bono Producción (Memo 200526)",
      version: 2,
      effectiveFrom: new Date("2026-05-01T00:00:00Z"), // memo date – common rules until changed
      isActive: true,
      rules: {
        create: [
          {
            bonusTypeId: prod,
            positionFilter: PERFORISTA_FILTER,
            drillingTypeFilter: [],
            priority: 1,
            parameters: { rateTable: TABLE1, bestRigSelection: "employee_rig", rateKey: "Perforista" },
            notes: "Perforistas: Bono Metro, producción de la máquina día+noche por día en faena (PRIMERO §1)",
          },
          {
            bonusTypeId: prod,
            positionFilter: AYUDANTE_FILTER,
            drillingTypeFilter: [],
            priority: 1,
            parameters: { rateTable: TABLE2, bestRigSelection: "employee_rig", rateKey: "Ayudante" },
            notes: "Ayudantes de Perforista: Bono Metro, Tabla 2 (PRIMERO §1)",
          },
          {
            bonusTypeId: above,
            positionFilter: [...PERFORISTA_FILTER, ...AYUDANTE_FILTER],
            drillingTypeFilter: [],
            priority: 2,
            parameters: {
              thresholds: { PQ: 22, H1: 22, H2: 22, RC: 50 },
              multiplier: 1.5,
              baseRateTable: ABOVE_BASE_RATES,
              incrementOnly: false,
            },
            notes: "Bono Extra: >22 m/turno Diamantina, >50 m/turno Aire Reverso, paga tarifa × 1.5 (completo) por cada metro excedido (SEGUNDO)",
          },
          {
            bonusTypeId: goal,
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
            },
            notes: "Bono meta: máquina >1.000 m Diamantina / >2.500 m RC (ambos turnos) (TERCERO)",
          },
          {
            // Memo PRIMERO §2: Jefes/Supervisores/HSEC -> MEJOR MÁQUINA, Tabla 1
            bonusTypeId: prod,
            positionFilter: JEFE_HSEC_FILTER,
            drillingTypeFilter: [],
            priority: 1,
            parameters: {
              rateTable: TABLE1,
              bestRigSelection: "best_rig_month",
              attendanceProrate: { divisor: "days_in_month" },
              rateKey: "Perforista",
              bestRigRule: { arThresholdMeters: 2500 },
            },
            notes: "Mejor máquina del mes, Tabla 1 (Perforista), prorrateado por días del mes",
          },
          {
            // Memo PRIMERO §3: Admin/apoyo -> MEJOR MÁQUINA, Tabla 2
            bonusTypeId: prod,
            positionFilter: APOYO_FILTER,
            drillingTypeFilter: [],
            priority: 1,
            parameters: {
              rateTable: TABLE2,
              bestRigSelection: "best_rig_month",
              attendanceProrate: { divisor: "days_in_month" },
              rateKey: "Ayudante",
              bestRigRule: { arThresholdMeters: 2500 },
            },
            notes: "Mejor máquina del mes, Tabla 2 (Ayudante), prorrateado por días del mes",
          },
        ],
      },
    },
    include: { rules: true },
  });

  console.log("Created MV rule set (v2):", ruleSet.id, ruleSet.name, `(${ruleSet.rules.length} rules)`);
}

main()
  .catch((e) => { console.error("Error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());