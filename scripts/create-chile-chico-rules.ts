import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Creating bonus rule set for Chile Chico...\n");

  const chileChico = await prisma.site.findFirst({
    where: { name: { contains: "Chile Chico" } },
  });

  if (!chileChico) {
    console.error("Proyecto Chile Chico not found");
    return;
  }

  console.log(`Found site: ${chileChico.name} (${chileChico.id})`);

  const bonusTypes = await prisma.bonusType.findMany();
  const btMap = new Map(bonusTypes.map((bt) => [bt.code, bt.id]));
  const getId = (code: string) => {
    const id = btMap.get(code);
    if (!id) throw new Error(`Bonus type '${code}' not found`);
    return id;
  };

  const productionMeterId = getId("production_meter");
  const terminationAdjustmentId = getId("termination_adjustment");

  // Delete existing rule sets for this site
  await prisma.bonusRuleSet.updateMany({ where: { siteId: chileChico.id }, data: { isActive: false } });
  const latestRuleSet = await prisma.bonusRuleSet.findFirst({ where: { siteId: chileChico.id }, orderBy: { version: "desc" }, select: { version: true } });

  // Chile Chico: Simple 3-tramo production meter, paid from the best rig
  // of the month and prorated by effective days in the project.
  await prisma.bonusRuleSet.create({
    data: {
      siteId: chileChico.id,
      name: "Chile Chico - Bono Produccion 2026",
      version: (latestRuleSet?.version ?? 0) + 1,
      effectiveFrom: new Date("2026-07-01T00:00:00Z"),
      isActive: true,
      rules: {
        create: [
          {
            bonusTypeId: productionMeterId,
            positionFilter: ["Perforista", "Driller"],
            drillingTypeFilter: [],
            priority: 1,
            parameters: {
              rateTable: {
                DDH: {
                  "0-200": { Perforista: 600, Driller: 600 },
                  "200-400": { Perforista: 800, Driller: 800 },
                  "400-600": { Perforista: 1000, Driller: 1000 },
                },
              },
                bestRigSelection: "best_rig_month",
                rateKey: "Perforista",
                attendanceProrate: { divisor: "days_in_month" },
            },
            minAttendanceDays: null,
            notes: "Perforistas: bono segun tramo (0-200: $600, 200-400: $800, 400-600: $1000). Mejor maquina del mes.",
          },
          {
            bonusTypeId: productionMeterId,
            positionFilter: ["Ayudante", "Helper"],
            drillingTypeFilter: [],
            priority: 1,
            parameters: {
              rateTable: {
                DDH: {
                  "0-200": { Ayudante: 400, Helper: 400, Soporte: 400, Support: 400 },
                  "200-400": { Ayudante: 600, Helper: 600, Soporte: 600, Support: 600 },
                  "400-600": { Ayudante: 800, Helper: 800, Soporte: 800, Support: 800 },
                },
              },
              bestRigSelection: "best_rig_month",
                rateKey: "Ayudante",
                attendanceProrate: { divisor: "days_in_month" },
            },
            minAttendanceDays: null,
            notes: "Ayudantes: bono segun tramo (0-200: $400, 200-400: $600, 400-600: $800). Mejor maquina del mes.",
          },
          {
            bonusTypeId: productionMeterId,
            positionFilter: ["Supervisor", "Jefe de Faena", "Supervisor HSEC", "HSEC", "HESQ"],
            drillingTypeFilter: [],
            priority: 1,
            parameters: {
              rateTable: {
                DDH: {
                  "0-200": { Supervisor: 600, "Jefe de Faena": 600, "Supervisor HSEC": 600, HESQ: 600 },
                  "200-400": { Supervisor: 800, "Jefe de Faena": 800, "Supervisor HSEC": 800, HESQ: 800 },
                  "400-600": { Supervisor: 1000, "Jefe de Faena": 1000, "Supervisor HSEC": 1000, HESQ: 1000 },
                },
              },
              bestRigSelection: "best_rig_month",
                rateKey: "Perforista",
                attendanceProrate: { divisor: "days_in_month" },
            },
            minAttendanceDays: null,
            notes: "Jefes de Faena, Supervisores, HESQ: tarifa Perforistas segun tramo (0-200: $600, 200-400: $800, 400-600: $1000). Mejor maquina del mes.",
          },
          {
            bonusTypeId: productionMeterId,
            positionFilter: ["Administrativo", "Admin", "Apoyo", "Operativo de apoyo", "Soporte", "Support", "Otros"],
            drillingTypeFilter: [],
            priority: 1,
            parameters: {
              rateTable: {
                DDH: {
                  "0-200": { Ayudante: 400 },
                  "200-400": { Ayudante: 600 },
                  "400-600": { Ayudante: 800 },
                },
              },
              bestRigSelection: "best_rig_month",
              rateKey: "Ayudante",
              attendanceProrate: { divisor: "days_in_month" },
            },
            minAttendanceDays: null,
            notes: "Otros cargos y apoyo: tarifa Ayudantes segun tramo y mejor maquina del mes.",
          },
          {
            bonusTypeId: terminationAdjustmentId,
            positionFilter: [],
            drillingTypeFilter: [],
            priority: 99,
            parameters: {
              terminationMultiplier: 1,
              reason: "Chile Chico: aplicar segun causal de termino registrada para el trabajador",
            },
            notes: "Reglas de termino del memo Chile Chico: 0% para renuncia sin aviso, Art. 161 y Art. 160; 100% con aviso de 30 dias o vencimiento sin renovacion.",
          },
        ],
      },
    },
  });

  console.log("  Chile Chico rules created successfully!");
}

main()
  .catch((e) => { console.error("Error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
