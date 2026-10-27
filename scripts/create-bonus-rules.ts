import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Creating bonus rule sets for all sites...\n");

  const sites = await prisma.site.findMany({ orderBy: { name: "asc" } });
  if (sites.length === 0) {
    console.error("No sites found. Please create sites first.");
    return;
  }

  const bonusTypes = await prisma.bonusType.findMany();
  const btMap = new Map(bonusTypes.map((bt) => [bt.code, bt.id]));
  const getId = (code: string) => {
    const id = btMap.get(code);
    if (!id) throw new Error(`Bonus type '${code}' not found`);
    return id;
  };

  const productionMeterId = getId("production_meter");
  const aboveThresholdId = getId("above_threshold");
  const monthlyGoalId = getId("monthly_goal");
  const highAltitudeId = getId("high_altitude");
  const endOfSeasonId = getId("end_of_season");
  const terminationAdjustmentId = getId("termination_adjustment");

  const findSite = (pattern: string) => {
    const site = sites.find((s) => s.name.toLowerCase().includes(pattern.toLowerCase()));
    if (!site) console.warn(`Site matching '${pattern}' not found, skipping...`);
    return site;
  };

  const coipa = findSite("coipa");
  const fenix = findSite("fenix");
  // Mantoverde has a dedicated, production-validated rule script. Keep this
  // shared seed limited to the projects it owns so MV cannot be overwritten.
  const mv = process.env.UPDATE_MV === "true" ? findSite("mantoverde") : undefined;

  // ============ COIPA (KINROSS) ============
  if (coipa) {
    console.log("Creating rules for Coipa (Kinross)...");
    await prisma.bonusRuleSet.updateMany({ where: { siteId: coipa.id }, data: { isActive: false } });
    const coipaLatest = await prisma.bonusRuleSet.findFirst({ where: { siteId: coipa.id }, orderBy: { version: "desc" }, select: { version: true } });

    await prisma.bonusRuleSet.create({
      data: {
        siteId: coipa.id,
        name: "Coipa Kinross - Bonus Structure 2026",
        version: (coipaLatest?.version ?? 0) + 1,
        effectiveFrom: new Date("2026-05-01T00:00:00Z"),
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
                  PQ: { "0-500": { Perforista: 1000 }, "500-1000": { Perforista: 1400 } },
                  H1: { "0-500": { Perforista: 750 } },
                  N1: { "0-500": { Perforista: 750 } },
                  H2: { "500-1000": { Perforista: 900 } },
                  N2: { "500-1000": { Perforista: 900 } },
                  H3: { "1000-1500": { Perforista: 1200 } },
                  N3: { "1000-1500": { Perforista: 1200 } },
                  H4: { "1500-2000": { Perforista: 1600 } },
                  N4: { "1500-2000": { Perforista: 1600 } },
                  H5: { "2000-2500": { Perforista: 1900 } },
                  N5: { "2000-2500": { Perforista: 1900 } },
                },
                bestRigSelection: "employee_rig",
              },
              notes: "Perforistas: tarifa segun tipo de perforacion y tramo",
            },
            {
              bonusTypeId: productionMeterId,
              positionFilter: ["Ayudante", "Helper", "Soporte", "Support"],
              drillingTypeFilter: [],
              priority: 1,
              parameters: {
                rateTable: {
                  PQ: { "0-500": { Ayudante: 500 }, "500-1000": { Ayudante: 700 } },
                  H1: { "0-500": { Ayudante: 500 } },
                  N1: { "0-500": { Ayudante: 500 } },
                  H2: { "500-1000": { Ayudante: 700 } },
                  N2: { "500-1000": { Ayudante: 700 } },
                  H3: { "1000-1500": { Ayudante: 900 } },
                  N3: { "1000-1500": { Ayudante: 900 } },
                  H4: { "1500-2000": { Ayudante: 1200 } },
                  N4: { "1500-2000": { Ayudante: 1200 } },
                  H5: { "2000-2500": { Ayudante: 1500 } },
                  N5: { "2000-2500": { Ayudante: 1500 } },
                },
                bestRigSelection: "employee_rig",
              },
              notes: "Ayudantes: tarifa segun tipo de perforacion y tramo",
            },
            {
              bonusTypeId: productionMeterId,
              positionFilter: ["Jefe de Faena", "Supervisor", "Supervisor HSEC", "HSEC", "HESQ"],
              drillingTypeFilter: [],
              priority: 1,
              parameters: {
                rateTable: {
                  PQ: { "0-500": { Perforista: 1000 }, "500-1000": { Perforista: 1400 } },
                  H1: { "0-500": { Perforista: 750 } },
                  N1: { "0-500": { Perforista: 750 } },
                  H2: { "500-1000": { Perforista: 900 } },
                  N2: { "500-1000": { Perforista: 900 } },
                  H3: { "1000-1500": { Perforista: 1200 } },
                  N3: { "1000-1500": { Perforista: 1200 } },
                  H4: { "1500-2000": { Perforista: 1600 } },
                  N4: { "1500-2000": { Perforista: 1600 } },
                  H5: { "2000-2500": { Perforista: 1900 } },
                  N5: { "2000-2500": { Perforista: 1900 } },
                },
                bestRigSelection: "best_rig_month",
                rateKey: "Perforista",
                attendanceProrate: { divisor: "days_in_month" },
              },
              notes: "Jefes, supervisores y HSEC: mejor maquina del mes usando Tabla 1 y prorrateo por dias trabajados",
            },
            {
              bonusTypeId: productionMeterId,
              positionFilter: ["Administrativo", "Admin", "Apoyo", "Operativo de apoyo", "Soporte", "Support"],
              drillingTypeFilter: [],
              priority: 1,
              parameters: {
                rateTable: {
                  PQ: { "0-500": { Ayudante: 500 }, "500-1000": { Ayudante: 700 } },
                  H1: { "0-500": { Ayudante: 500 } },
                  N1: { "0-500": { Ayudante: 500 } },
                  H2: { "500-1000": { Ayudante: 700 } },
                  N2: { "500-1000": { Ayudante: 700 } },
                  H3: { "1000-1500": { Ayudante: 900 } },
                  N3: { "1000-1500": { Ayudante: 900 } },
                  H4: { "1500-2000": { Ayudante: 1200 } },
                  N4: { "1500-2000": { Ayudante: 1200 } },
                  H5: { "2000-2500": { Ayudante: 1500 } },
                  N5: { "2000-2500": { Ayudante: 1500 } },
                },
                bestRigSelection: "best_rig_month",
                rateKey: "Ayudante",
                attendanceProrate: { divisor: "days_in_month" },
              },
              notes: "Otros cargos y apoyo: mejor maquina del mes usando Tabla 2 y prorrateo por dias trabajados",
            },
            {
              bonusTypeId: aboveThresholdId,
              positionFilter: ["Perforista", "Driller", "Ayudante", "Helper"],
              drillingTypeFilter: [],
              priority: 2,
              parameters: {
                thresholds: { DDH: 22, RC: 50 },
                multiplier: 1.5,
                incrementOnly: true,
                baseRateTable: {
                  DDH: { "0-500": { Perforista: 750, Ayudante: 500 }, "500-1000": { Perforista: 900, Ayudante: 700 } },
                  RC: { "0-500": { Perforista: 1000, Ayudante: 500 }, "500-1000": { Perforista: 1400, Ayudante: 700 } },
                },
              },
              notes: "Bono por superar 22m DDH o 50m RC por turno - 1.5x",
            },
            {
              bonusTypeId: highAltitudeId,
              positionFilter: [],
              drillingTypeFilter: [],
              priority: 3,
              parameters: { monthlyAmount: 250000, daysInMonth: 30 },
              notes: "Bono trabajo en altura: $250.000/mes prorrateado",
            },
            {
              bonusTypeId: terminationAdjustmentId,
              positionFilter: [],
              drillingTypeFilter: [],
              priority: 99,
              parameters: {
                terminationMultiplier: 1,
                reason: "Coipa: aplicar segun causal de termino registrada para el trabajador",
              },
              notes: "Reglas de termino del memo Coipa: 0% para renuncia sin aviso, Art. 161 y Art. 160; 100% con aviso de 30 dias o vencimiento sin renovacion",
            },
          ],
        },
      },
    });
    console.log("  Coipa Kinross rules created");
  }

  // ============ FENIX ============
  if (fenix) {
    console.log("Creating rules for Fenix...");
    await prisma.bonusRuleSet.updateMany({ where: { siteId: fenix.id }, data: { isActive: false } });
    const fenixLatest = await prisma.bonusRuleSet.findFirst({ where: { siteId: fenix.id }, orderBy: { version: "desc" }, select: { version: true } });

    await prisma.bonusRuleSet.create({
      data: {
        siteId: fenix.id,
        name: "Fenix - Bonus Structure 2026",
        version: (fenixLatest?.version ?? 0) + 1,
        effectiveFrom: new Date("2026-05-01T00:00:00Z"),
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
                  PQ: { "0-500": { Perforista: 1000 }, "500-1000": { Perforista: 1400 } },
                  H1: { "0-500": { Perforista: 750 } }, N1: { "0-500": { Perforista: 750 } },
                  H2: { "500-1000": { Perforista: 900 } }, N2: { "500-1000": { Perforista: 900 } },
                  H3: { "1000-1500": { Perforista: 1200 } }, N3: { "1000-1500": { Perforista: 1200 } },
                  H4: { "1500-2000": { Perforista: 1600 } }, N4: { "1500-2000": { Perforista: 1600 } },
                  H5: { "2000-2500": { Perforista: 1900 } }, N5: { "2000-2500": { Perforista: 1900 } },
                },
                bestRigSelection: "employee_rig",
              },
              notes: "Perforistas: tarifa segun tipo de perforacion y tramo",
            },
            {
              bonusTypeId: productionMeterId,
              positionFilter: ["Ayudante", "Helper", "Soporte", "Support"],
              drillingTypeFilter: [],
              priority: 1,
              parameters: {
                rateTable: {
                  PQ: { "0-500": { Ayudante: 500 }, "500-1000": { Ayudante: 700 } },
                  H1: { "0-500": { Ayudante: 500 } }, N1: { "0-500": { Ayudante: 500 } },
                  H2: { "500-1000": { Ayudante: 700 } }, N2: { "500-1000": { Ayudante: 700 } },
                  H3: { "1000-1500": { Ayudante: 900 } }, N3: { "1000-1500": { Ayudante: 900 } },
                  H4: { "1500-2000": { Ayudante: 1200 } }, N4: { "1500-2000": { Ayudante: 1200 } },
                  H5: { "2000-2500": { Ayudante: 1500 } }, N5: { "2000-2500": { Ayudante: 1500 } },
                },
                bestRigSelection: "employee_rig",
              },
              notes: "Ayudantes: tarifa segun tipo de perforacion y tramo",
            },
            {
              bonusTypeId: productionMeterId,
              positionFilter: ["Jefe de Faena", "Supervisor", "Supervisor HSEC", "HSEC", "HESQ"],
              drillingTypeFilter: [],
              priority: 1,
              parameters: {
                rateTable: {
                  PQ: { "0-500": { Perforista: 1000 }, "500-1000": { Perforista: 1400 } },
                  H1: { "0-500": { Perforista: 750 } }, N1: { "0-500": { Perforista: 750 } },
                  H2: { "500-1000": { Perforista: 900 } }, N2: { "500-1000": { Perforista: 900 } },
                  H3: { "1000-1500": { Perforista: 1200 } }, N3: { "1000-1500": { Perforista: 1200 } },
                  H4: { "1500-2000": { Perforista: 1600 } }, N4: { "1500-2000": { Perforista: 1600 } },
                  H5: { "2000-2500": { Perforista: 1900 } }, N5: { "2000-2500": { Perforista: 1900 } },
                },
                bestRigSelection: "best_rig_month",
                rateKey: "Perforista",
                attendanceProrate: { divisor: "days_in_month" },
              },
              notes: "Jefes, supervisores y HSEC: mejor maquina del mes usando Tabla 1 y prorrateo por dias trabajados",
            },
            {
              bonusTypeId: productionMeterId,
              positionFilter: ["Administrativo", "Admin", "Apoyo", "Operativo de apoyo", "Soporte", "Support", "Otros"],
              drillingTypeFilter: [],
              priority: 1,
              parameters: {
                rateTable: {
                  PQ: { "0-500": { Ayudante: 500 }, "500-1000": { Ayudante: 700 } },
                  H1: { "0-500": { Ayudante: 500 } }, N1: { "0-500": { Ayudante: 500 } },
                  H2: { "500-1000": { Ayudante: 700 } }, N2: { "500-1000": { Ayudante: 700 } },
                  H3: { "1000-1500": { Ayudante: 900 } }, N3: { "1000-1500": { Ayudante: 900 } },
                  H4: { "1500-2000": { Ayudante: 1200 } }, N4: { "1500-2000": { Ayudante: 1200 } },
                  H5: { "2000-2500": { Ayudante: 1500 } }, N5: { "2000-2500": { Ayudante: 1500 } },
                },
                bestRigSelection: "best_rig_month",
                rateKey: "Ayudante",
                attendanceProrate: { divisor: "days_in_month" },
              },
              notes: "Otros cargos y apoyo: mejor maquina del mes usando Tabla 2 y prorrateo por dias trabajados",
            },
            {
              bonusTypeId: aboveThresholdId,
              positionFilter: ["Perforista", "Driller", "Ayudante", "Helper"],
              drillingTypeFilter: [],
              priority: 2,
              parameters: {
                thresholds: { DDH: 22, RC: 50 },
                multiplier: 1.5,
                incrementOnly: true,
                baseRateTable: {
                  DDH: { "0-500": { Perforista: 750, Ayudante: 500 }, "500-1000": { Perforista: 900, Ayudante: 700 } },
                  RC: { "0-500": { Perforista: 1000, Ayudante: 500 }, "500-1000": { Perforista: 1400, Ayudante: 700 } },
                },
              },
              notes: "Bono por superar 22m DDH o 50m RC por turno - 1.5x",
            },
            {
              bonusTypeId: monthlyGoalId,
              positionFilter: ["Perforista", "Driller", "Ayudante", "Helper"],
              drillingTypeFilter: [],
              priority: 3,
              parameters: { goals: { DDH: 1500, RC: 3000 }, amounts: { Perforista: 250000, Ayudante: 125000 } },
              notes: "Bono meta mensual: 1500m DDH / 3000m RC",
            },
            {
              bonusTypeId: endOfSeasonId,
              positionFilter: [],
              drillingTypeFilter: [],
              priority: 4,
              parameters: { salaryMultiplier: 1, totalDays: 258, baseSalary: 1000000, attendanceWeight: 0.5, excellenceWeight: 0.5 },
              notes: "Bono fin de temporada: 1 sueldo base, evaluado 50% asistencia y 50% excelencia operacional y seguridad",
            },
            {
              bonusTypeId: terminationAdjustmentId,
              positionFilter: [],
              drillingTypeFilter: [],
              priority: 99,
              parameters: {
                terminationMultiplier: 1,
                reason: "Fenix: aplicar segun causal de termino registrada para el trabajador",
              },
              notes: "Reglas de termino del memo Fenix: 0% para renuncia sin aviso, Art. 161 y Art. 160; 100% con aviso de 30 dias o vencimiento sin renovacion",
            },
          ],
        },
      },
    });
    console.log("  Fenix rules created");
  }

  // ============ MV (MANTOVERDE) ============
  if (mv) {
    console.log("Creating rules for Mantoverde...");
    await prisma.bonusRuleSet.updateMany({ where: { siteId: mv.id }, data: { isActive: false } });
    const mvLatest = await prisma.bonusRuleSet.findFirst({ where: { siteId: mv.id }, orderBy: { version: "desc" }, select: { version: true } });

    await prisma.bonusRuleSet.create({
      data: {
        siteId: mv.id,
        name: "Mantoverde - Bonus Structure 2026",
        version: (mvLatest?.version ?? 0) + 1,
        effectiveFrom: new Date("2026-05-01T00:00:00Z"),
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
                  PQ: { "0-500": { Perforista: 1000 }, "500-1000": { Perforista: 1400 } },
                  H1: { "0-500": { Perforista: 750 }, "500-1000": { Perforista: 900 } },
                  H2: { "0-500": { Perforista: 1200 }, "500-1000": { Perforista: 1600 } },
                  H3: { "1000-1500": { Perforista: 1900 }, "1500-2000": { Perforista: 1900 } },
                  NAVI: { "2000-2500": { Perforista: 1900 } },
                },
                bestRigSelection: "employee_rig",
              },
              notes: "Perforistas: tarifa segun tipo de perforacion y tramo",
            },
            {
              bonusTypeId: productionMeterId,
              positionFilter: ["Ayudante", "Helper", "Soporte", "Support"],
              drillingTypeFilter: [],
              priority: 1,
              parameters: {
                rateTable: {
                  PQ: { "0-500": { Ayudante: 500 }, "500-1000": { Ayudante: 700 } },
                  H1: { "0-500": { Ayudante: 500 }, "500-1000": { Ayudante: 700 } },
                  H2: { "0-500": { Ayudante: 900 }, "500-1000": { Ayudante: 1200 } },
                  H3: { "1000-1500": { Ayudante: 1500 }, "1500-2000": { Ayudante: 1500 } },
                  NAVI: { "2000-2500": { Ayudante: 1500 } },
                },
                bestRigSelection: "employee_rig",
              },
              notes: "Ayudantes: tarifa segun tipo de perforacion y tramo",
            },
            {
              bonusTypeId: productionMeterId,
              positionFilter: ["Supervisor"],
              drillingTypeFilter: [],
              priority: 1,
              parameters: { rateTable: { DDH: { "0-600": { Supervisor: 300 } } }, bestRigSelection: "best_rig_month" },
              notes: "Supervisores: tarifa plana DEPTH SCALE",
            },
            {
              bonusTypeId: aboveThresholdId,
              positionFilter: ["Perforista", "Driller", "Ayudante", "Helper"],
              drillingTypeFilter: [],
              priority: 2,
              parameters: {
                thresholds: { DDH: 22, RC: 50 },
                multiplier: 1.5,
                baseRateTable: {
                  DDH: { "0-500": { Perforista: 750, Ayudante: 500 }, "500-1000": { Perforista: 900, Ayudante: 700 } },
                  RC: { "0-500": { Perforista: 1000, Ayudante: 500 }, "500-1000": { Perforista: 1400, Ayudante: 700 } },
                },
              },
              notes: "Bono por superar 22m DDH o 50m RC por turno - 1.5x",
            },
            {
              bonusTypeId: monthlyGoalId,
              positionFilter: ["Perforista", "Driller", "Ayudante", "Helper"],
              drillingTypeFilter: [],
              priority: 3,
              parameters: { goals: { DDH: 1000, RC: 2500 }, amounts: { Perforista: 250000, Ayudante: 125000 } },
              notes: "Bono meta mensual: 1000m DDH / 2500m RC",
            },
          ],
        },
      },
    });
    console.log("  Mantoverde rules created");
  }

  console.log("\nAll bonus rule sets created successfully!");
}

main()
  .catch((e) => { console.error("Error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
