import { PrismaClient } from "@prisma/client";

/**
 * Creates the Proyecto La Coipa (Kinross) bonus rule set (PERIOD-AGNOSTIC config),
 * aligned to Memo Final Coipa_Estructura de Bonos 200526 (Kinross) — Tablas 1/2/3.
 *
 * The Coipa memo is structurally identical to the Mantoverde memo (same tables,
 * same PRIMERO §1-3 / SEGUNDO / TERCERO rules — only the project name differs),
 * so this mirrors the production-validated MV rule set (scripts/create-mv-rules.ts):
 *   Tabla 1 Perforistas: PQ 1.000/1.400, H1 750/900, H2 1.200/1.600, H3+ 1.900
 *   Tabla 2 Ayudantes:   PQ 500/700, H1 500/700, H2 900/1.200, H3+ 1.500
 *   Tabla 3 Aire Reverso 0-600: Perforistas 300, Soporte/Ayudantes 200
 *
 * Fixes vs the previous Coipa ruleset:
 *   1. Ayudante rules now carry rateKey + multi-label rate rows so
 *      "Ayudante Perforista" / "Ayudante de Perforista" resolve a rate
 *      (previously the daily metered bonus resolved to 0 for them).
 *   2. Full depth-scale coverage per drilling type (no more 0-rate lookups
 *      when the rig's tramo differs from the single previously-configured scale).
 *   3. RC (Aire Reverso) rates added (previously missing entirely).
 *   4. Best-rig rules (group 1 = Tabla 1/Perforista rate, group 2 = Tabla 2/Ayudante
 *      rate) prorated (raw / 30) × daysWorked, with the RC 2.500 m best-rig gate.
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

// Tabla 1 — Perforistas + Tabla 3 Aire Reverso (0-600 -> 300).
const TABLE1 = {
  PQ: { "0-500": perfRow(1000), "500-1000": perfRow(1400) },
  H1: { "0-500": perfRow(750), "500-1000": perfRow(900) },
  H2: { "0-500": perfRow(1200), "500-1000": perfRow(1600) },
  H3: { "0-500": perfRow(1900), "1000-1500": perfRow(1900), "1500-2000": perfRow(1900) },
  H4: { "0-500": perfRow(1900), "1500-2000": perfRow(1900), "2000-2500": perfRow(1900) },
  H5: { "0-500": perfRow(1900), "2000-2500": perfRow(1900) },
  NAVI: { "0-500": perfRow(1900), "2000-2500": perfRow(1900) },
  RC: { "0-500": perfRow(300), "500-1000": perfRow(300) },
};

// Tabla 2 — Ayudantes + Tabla 3 Aire Reverso (0-600 -> 200).
const TABLE2 = {
  PQ: { "0-500": ayudRow(500), "500-1000": ayudRow(700) },
  H1: { "0-500": ayudRow(500), "500-1000": ayudRow(700) },
  H2: { "0-500": ayudRow(900), "500-1000": ayudRow(1200) },
  H3: { "0-500": ayudRow(1500), "1000-1500": ayudRow(1500), "1500-2000": ayudRow(1500) },
  H4: { "0-500": ayudRow(1500), "1500-2000": ayudRow(1500), "2000-2500": ayudRow(1500) },
  H5: { "0-500": ayudRow(1500), "2000-2500": ayudRow(1500) },
  NAVI: { "0-500": ayudRow(1500), "2000-2500": ayudRow(1500) },
  RC: { "0-500": ayudRow(200), "500-1000": ayudRow(200) },
};

// Above Threshold (SEGUNDO): >22 m/turno Diamantina, >50 m/turno Aire Reverso.
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

// Actual role names (planilla cargo + Workera), same conventions as MV.
const PERFORISTA_FILTER = ["Perforista", "PERFORISTA (INSTRUCTOR)", "Driller"];
const AYUDANTE_FILTER = [
  "Ayudante Perforista",
  "Ayudante de Perforista",
  "Ayudante",
  "Helper",
  "Perforista Training",
];

async function main() {
  const sites = await prisma.site.findMany({ orderBy: { name: "asc" } });
  const site = sites.find((s) => /la coipa/i.test(s.name) && !/["\u201d]2["\u201d]/.test(s.name));
  if (!site) throw new Error("Coipa site not found");
  console.log("Site:", site.name, site.id);

  const bonusTypes = await prisma.bonusType.findMany();
  const getId = (code: string) => bonusTypes.find((b) => b.code === code)?.id;
  const prod = getId("production_meter");
  const above = getId("above_threshold");
  const goal = getId("monthly_goal");
  if (!prod || !above || !goal) throw new Error("Missing bonus types — run seed first");

  // Idempotent: deactivate prior active Coipa rule sets, create the corrected one.
  await prisma.bonusRuleSet.updateMany({
    where: { siteId: site.id, isActive: true },
    data: { isActive: false },
  });

  const ruleSet = await prisma.bonusRuleSet.create({
    data: {
      siteId: site.id,
      name: "Coipa - Bono Producción (Memo 200526)",
      version: 4,
      effectiveFrom: new Date("2026-05-01T00:00:00Z"), // memo date – common rules until changed
      isActive: true,
      rules: {
        create: [
          {
            bonusTypeId: prod,
            positionFilter: PERFORISTA_FILTER,
            drillingTypeFilter: [],
            priority: 1,
            parameters: { rateTable: TABLE1, bestRigSelection: "employee_rig_month", rateKey: "Perforista" },
            notes: "Perforistas: Bono Metro, producción de la máquina día+noche por día en faena (PRIMERO §1)",
          },
          {
            bonusTypeId: prod,
            positionFilter: AYUDANTE_FILTER,
            drillingTypeFilter: [],
            priority: 1,
            parameters: { rateTable: TABLE2, bestRigSelection: "employee_rig_month", rateKey: "Ayudante" },
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
            notes: "Bono Extra: >22 m/turno Diamantina, >50 m/turno Aire Reverso, tarifa × 1.5 por metro excedido (SEGUNDO)",
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
            // Memo PRIMERO §2: Jefes/Supervisores/HSEC -> MEJOR MÁQUINA, Tabla 1 (grupo 1)
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
            notes: "Mejor máquina del mes, Tabla 1 (Perforista), prorrateado (raw / 30) × días trabajados",
          },
          {
            // Memo PRIMERO §3: Admin/apoyo -> MEJOR MÁQUINA, Tabla 2 (grupo 2)
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
            notes: "Mejor máquina del mes, Tabla 2 (Ayudante), prorrateado (raw / 30) × días trabajados",
          },
        ],
      },
    },
    include: { rules: true },
  });

  console.log("Created Coipa rule set (v4):", ruleSet.id, ruleSet.name, `(${ruleSet.rules.length} rules)`);
}

main()
  .catch((e) => { console.error("Error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
