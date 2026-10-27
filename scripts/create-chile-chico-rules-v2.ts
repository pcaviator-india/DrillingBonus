/**
 * Creates the Proyecto Chile Chico bonus rule set — Memo Julio 2026 V2.
 *
 * Chile Chico's regime is DIFFERENT from MV/Fenix/Coipa: EVERYONE is paid on
 * the MEJOR MÁQUINA (best machine of the month), prorated (raw / 30) × días
 * efectivos — including Perforistas and Ayudantes (PRIMERO §1-3):
 *   - Sup/Drillers/HESQ:      600 / 800 / 1.000 (Tramo 1/2/3) — rateKey Perforista
 *   - Helpers/Support/Others: 400 / 600 / 800              — rateKey Ayudante
 * Tramos: 0-200 / 200-400 / 400-600 (Diamantina). Types: HQ, NQ, PQ, DDH, NAVI
 * (corrected set — no H1–H5). SEGUNDO = termination gate. NO above-threshold,
 * NO monthly-goal, NO end-of-season in this memo.
 *
 * Group-based filters (group1 / group2 from the Positions registry) need NO
 * crew exclusion here: Perforista is a group1 member and gets Perforista rates
 * via Rule 1, Ayudante Perforista is a group2 member and gets Ayudante rates
 * via Rule 2 — exactly what the memo states.
 *
 * depthScaleAliases maps the CERRO BAYO interval report's 100 m bands
 * ("0-100" / "100-200" / "200-300" / ...) onto the memo's 200 m tramos.
 * The canonical "0-500" bucket run.ts also emits is deliberately NOT mapped:
 * it holds the sum of all bands, so giving it a rate would double-count.
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

// Tarifa Sup/Drillers/HESQ (Tramo 1/2/3: 600 / 800 / 1.000), keyed by the
// corrected real diameters and the RAW memo tramos.
const TRAMOS = { "0-200": 600, "200-400": 800, "400-600": 1000 };
const TABLE1 = Object.fromEntries(
  ["HQ", "NQ", "PQ", "DDH", "NAVI"].map((t) => [
    t,
    Object.fromEntries(Object.entries(TRAMOS).map(([k, v]) => [k, perfRow(v)])),
  ]),
);

// Tarifa Helpers/Support/Others (Tramo 1/2/3: 400 / 600 / 800).
const TRAMOS_AYUD = { "0-200": 400, "200-400": 600, "400-600": 800 };
const TABLE2 = Object.fromEntries(
  ["HQ", "NQ", "PQ", "DDH", "NAVI"].map((t) => [
    t,
    Object.fromEntries(Object.entries(TRAMOS_AYUD).map(([k, v]) => [k, ayudRow(v)])),
  ]),
);

// Report band -> memo tramo (rule config, consumed at rate-lookup time).
const TRAMO_ALIASES: Record<string, string> = {
  "0-100": "0-200",
  "100-200": "0-200",
  "200-300": "200-400",
  "300-400": "200-400",
  "400-500": "400-600",
  "500-600": "400-600",
};

const GROUP1_FILTER = ["group1"]; // Group 1 – Supervision & Staff (incl. Perforistas)
const GROUP2_FILTER = ["group2"]; // Group 2 – Drilling Crew (incl. Ayudantes)

async function main() {
  const sites = await prisma.site.findMany({ orderBy: { name: "asc" } });
  const site = sites.find((s) => /chile chico/i.test(s.name));
  if (!site) throw new Error("Chile Chico site not found");
  console.log("Site:", site.name, site.id);

  const getId = async (code: string) =>
    (await prisma.bonusType.findUnique({ where: { code } }))?.id;
  const prod = await getId("production_meter");
  const termination = await getId("termination_adjustment");
  if (!prod) throw new Error("Missing bonus types — run seed first");

  // Replace the rules of the active Chile Chico rule set, creating it if missing.
  let ruleSet = await prisma.bonusRuleSet.findFirst({
    where: { siteId: site.id, isActive: true },
  });
  if (!ruleSet) {
    ruleSet = await prisma.bonusRuleSet.create({
      data: {
        siteId: site.id,
        name: "Chile Chico - Bono Producción (Memo Julio 2026 V2)",
        version: 1,
        effectiveFrom: new Date("2026-07-01T00:00:00Z"),
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
      positionFilter: GROUP1_FILTER,
      positionExclude: [],
      drillingTypeFilter: [],
      priority: 1,
      parameters: {
        rateTable: TABLE1,
        bestRigSelection: "best_rig_month",
        attendanceProrate: { divisor: "days_in_month" },
        rateKey: "Perforista",
        depthScaleAliases: TRAMO_ALIASES,
      } as object,
      notes:
        "Rule 1 — (PRIMERO §1-2) Group 1 (Sup/Drillers/HESQ): MEJOR MÁQUINA del mes, 600/800/1.000 por tramo (rateKey Perforista), prorrateado (total/30) × días trabajados. Incluye perforistas — este memo paga a todos por la mejor máquina.",
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
        attendanceProrate: { divisor: "days_in_month" },
        rateKey: "Ayudante",
        depthScaleAliases: TRAMO_ALIASES,
      } as object,
      notes:
        "Rule 2 — (PRIMERO §1,3) Group 2 (Helpers/Support/Others): MEJOR MÁQUINA del mes, 400/600/800 por tramo (rateKey Ayudante), prorrateado (total/30) × días trabajados.",
    },
    {
      bonusTypeId: termination ?? "",
      positionFilter: [],
      drillingTypeFilter: [],
      priority: 3,
      parameters: {
        reason: "Chile Chico: aplicar según causal de término registrada para el trabajador (SEGUNDO)",
        terminationMultiplier: 1,
      } as object,
      notes: "Rule 3 — Condiciones de pago de bonos en caso de término (SEGUNDO).",
    },
  ].filter((r) => r.bonusTypeId !== "");

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