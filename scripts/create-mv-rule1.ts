/**
 * Creates the FIRST rule of the fresh Mantoverde rule set:
 *   Rule 1 — production_meter (employee_rig) PERFORISTAS, Tabla 1 rates.
 *
 * Keyed with the corrected drilling types: HQ, NQ, PQ, RC (no H1–H5).
 * The old H3–H5 "1900" rows are expressed as the deeper tramos of HQ/NQ/PQ.
 *
 * Memo Final MV_Estructura de Bonos 200526:
 *   PQ  0-500 1.000 / 500-1000 1.400
 *   HQ  0-500   750 / 500-1000   900   (memo "H1")
 *   NQ  0-500 1.200 / 500-1000 1.600  (memo "H2")
 *   H3+       1.900  (1000-1500 / 1500-2000 / 2000-2500)
 *   RC (Aire Reverso) 300 (Tabla 3)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const perfRow = (rate: number) => ({ Perforista: rate, Driller: rate });

const TABLE1 = {
  PQ: {
    "0-500": perfRow(1000),
    "500-1000": perfRow(1400),
    "1000-1500": perfRow(1900),
    "1500-2000": perfRow(1900),
    "2000-2500": perfRow(1900),
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
    "0-500": perfRow(300),
    "500-1000": perfRow(300),
  },
};

const PERFORISTA_FILTER = ["Perforista", "PERFORISTA (INSTRUCTOR)", "Driller"];

async function main() {
  const site = (await prisma.site.findMany({ orderBy: { name: "asc" } })).find((s) =>
    s.name.toLowerCase().includes("mantoverde"),
  );
  if (!site) throw new Error("Mantoverde site not found");

  const prod = await prisma.bonusType.findUnique({ where: { code: "production_meter" } });
  if (!prod) throw new Error("production_meter bonus type missing — run seed first");

  // Idempotent: reuse the active MV rule set if present, else create it.
  let ruleSet = await prisma.bonusRuleSet.findFirst({
    where: { siteId: site.id, isActive: true },
    include: { rules: true },
  });
  if (!ruleSet) {
    ruleSet = await prisma.bonusRuleSet.create({
      data: {
        siteId: site.id,
        name: "MV - Bono Producción (Memo 200526)",
        version: 1,
        effectiveFrom: new Date("2026-05-01T00:00:00Z"),
        isActive: true,
      },
      include: { rules: true },
    });
    console.log("Created rule set", ruleSet.id);
  }

  const existing = ruleSet.rules.find((r) => r.notes?.startsWith("Rule 1"));
  const data = {
    bonusTypeId: prod.id,
    positionFilter: PERFORISTA_FILTER,
    drillingTypeFilter: [], // all types
    priority: 1,
    parameters: {
      rateTable: TABLE1,
      bestRigSelection: "employee_rig",
    } as unknown as object,
    notes:
      "Rule 1 — Bono Metro PERFORISTAS (PRIMERO §1): producción día+noche de la máquina por día en faena, Tarifa Perforistas (Tabla 1).",
  };
  if (existing) {
    await prisma.bonusRule.update({ where: { id: existing.id }, data });
    console.log("Updated existing Rule 1:", existing.id);
  } else {
    const rule = await prisma.bonusRule.create({ data: { ...data, ruleSetId: ruleSet.id } });
    console.log("Created Rule 1:", rule.id);
  }

  const check = await prisma.bonusRuleSet.findFirst({
    where: { id: ruleSet.id },
    include: { rules: { include: { bonusType: true } } },
  });
  console.log(JSON.stringify(check, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());