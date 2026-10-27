import { PrismaClient } from "@prisma/client";
import { calculateBonuses } from "../src/lib/bonus-engine/engine";
import type { BonusEngineInput, BonusRuleConfig } from "../src/types/bonus";

/**
 * Validates the active Fenix and Chile Chico rule sets with the PURE engine,
 * mimicking the data shapes run.ts produces (incl. raw tramo scale keys).
 */
const p = new PrismaClient();

function run(label: string, input: BonusEngineInput, expect: Record<string, number>) {
  const out = calculateBonuses(input);
  console.log(`\n== ${label}`);
  for (const line of out.lines) {
    console.log(`  ${line.fullName} role=${line.roleUsed} days=${line.daysWorked} total=${line.calculatedBonus}`);
    for (const c of line.components) {
      console.log(`    - ${c.bonusTypeName}: ${Math.round(c.amount)}`);
    }
  }
  for (const [name, expected] of Object.entries(expect)) {
    const line = out.lines.find((l) => l.fullName === name);
    if (!line || Math.abs(line.calculatedBonus - expected) > 0.05) {
      throw new Error(`FAIL ${label}: ${name} expected ${expected}, got ${line?.calculatedBonus}`);
    }
  }
  console.log(`PASS ${label}`);
}

function mapRules(rs: { rules: Array<{ id: string; bonusType: { code: string }; positionFilter: string[]; drillingTypeFilter: string[]; priority: number; parameters: unknown; minAttendanceDays: number | null }> }): BonusRuleConfig[] {
  return rs.rules.map((r) => ({
    ruleId: r.id,
    bonusTypeCode: r.bonusType.code,
    positionFilter: r.positionFilter,
    drillingTypeFilter: r.drillingTypeFilter,
    priority: r.priority,
    parameters: r.parameters as never,
    minAttendanceDays: r.minAttendanceDays ?? null,
  }));
}

const shift = (role: string) => ({ date: "2026-08-05", shift: "day", rigName: "none", role, meters: 0, hours: 8, drillingLevel: null, drillingType: null, drillingDepth: null });

async function main() {
  const [fenixRs, ccRs] = await Promise.all([
    p.bonusRuleSet.findFirst({
      where: { site: { name: { contains: "Fenix" } }, isActive: true },
      include: { rules: { include: { bonusType: true } } },
    }),
    p.bonusRuleSet.findFirst({
      where: { site: { name: { contains: "Chile Chico" } }, isActive: true },
      include: { rules: { include: { bonusType: true } } },
    }),
  ]);
  if (!fenixRs || !ccRs) throw new Error("missing active rulesets");
  console.log("Fenix:", fenixRs.name, "v" + fenixRs.version, "| Chile Chico:", ccRs.name, "v" + ccRs.version);

  // ---- FENIX ----
  run("Fenix", {
    period: { start: "2026-08-01", end: "2026-08-31" },
    rules: mapRules(fenixRs),
    employees: [
      { employeeId: "a", fullName: "Ayudante Test", daysWorked: 20, attendanceHours: 160, defaultRole: "Ayudante Perforista", roleTokens: ["Ayudante Perforista", "group2"], shifts: [{ ...shift("Ayudante Perforista"), rigName: "RIG-A" }] },
      { employeeId: "b", fullName: "Bodeguero Test", daysWorked: 10, attendanceHours: 80, defaultRole: "bodeguero", roleTokens: ["bodeguero", "BODEGUERO", "group2"], shifts: [shift("bodeguero")] },
      { employeeId: "c", fullName: "HSEC Test", daysWorked: 8, attendanceHours: 64, defaultRole: "HSEC", roleTokens: ["HSEC", "group1"], shifts: [shift("HSEC")] },
      { employeeId: "d", fullName: "Perforista Test", daysWorked: 25, attendanceHours: 200, defaultRole: "Perforista", roleTokens: ["Perforista", "group2"], shifts: [{ ...shift("Perforista"), rigName: "RIG-A" }] },
    ],
    monthlyRigTotals: { "RIG-A": 2000 },
    rigTotalsByType: { "RIG-A": { H1: 2000, DIAMANTINA: 2000 } },
    rigTotalsByTypeAndScale: { "RIG-A": { H1: { "0-500": 2000 } } },
    rigDailyTotalsByTypeAndScale: { "RIG-A": { "2026-08-05": { H1: { "0-500": 500 } } } },
    rigTypes: { "RIG-A": "DIAMANTINA" },
  }, {
    // Production 250.000 + meta 125.000 + fin de temporada ~77.519
    "Ayudante Test": 452519,
    "Bodeguero Test": 372093.33,    // 2.000 × 500 /30 × 10 + fin de temporada
    "HSEC Test": 431008,            // 2.000 × 750 /30 × 8 + fin de temporada
    "Perforista Test": 721899,      // bono metro 375.000 + meta 250.000 + fin de temporada
  });

  // ---- CHILE CHICO ----
  run("Chile Chico", {
    period: { start: "2026-08-01", end: "2026-08-31" },
    rules: mapRules(ccRs),
    employees: [
      { employeeId: "p", fullName: "CC Perforista", daysWorked: 15, attendanceHours: 120, defaultRole: "Perforista", roleTokens: ["Perforista", "group2"], shifts: [shift("Perforista")] },
      { employeeId: "h", fullName: "CC Ayudante", daysWorked: 12, attendanceHours: 96, defaultRole: "Ayudante Perforista", roleTokens: ["Ayudante Perforista", "group2"], shifts: [shift("Ayudante Perforista")] },
      { employeeId: "b", fullName: "CC Bodeguero", daysWorked: 10, attendanceHours: 80, defaultRole: "bodeguero", roleTokens: ["bodeguero", "BODEGUERO", "group2"], shifts: [shift("bodeguero")] },
    ],
    monthlyRigTotals: { "RIG-CC": 1000 },
    rigTotalsByType: { "RIG-CC": { H1: 1000 } },
    rigTotalsByTypeAndScale: { "RIG-CC": { H1: { "0-200": 1000, "0-500": 1000 } } },
    rigTypes: { "RIG-CC": "DIAMANTINA" },
  }, {
    "CC Perforista": 300000,        // 1.000 × 600 /30 × 15
    "CC Ayudante": 160000,          // 1.000 × 400 /30 × 12
    "CC Bodeguero": 133333.33,      // 1.000 × 400 /30 × 10
  });

  // ---- CHILE CHICO - real CERRO BAYO band shapes (100 m bands -> memo tramos) ----
  // The interval report emits escala "0-100" / "100-200" / "200-300" *and* the
  // canonical "0-500" bucket run.ts also records. The rules' depthScaleAliases
  // must fold the 100 m bands onto the memo tramos 0-200 / 200-400 / 400-600,
  // while the canonical bucket (which duplicates the band total) stays unrated.
  run("Chile Chico band aliases", {
    period: { start: "2026-08-01", end: "2026-08-31" },
    rules: mapRules(ccRs),
    employees: [
      { employeeId: "p", fullName: "CC Perforista", daysWorked: 15, attendanceHours: 120, defaultRole: "Perforista", roleTokens: ["Perforista", "group2"], shifts: [shift("Perforista")] },
      { employeeId: "h", fullName: "CC Ayudante", daysWorked: 12, attendanceHours: 96, defaultRole: "Ayudante Perforista", roleTokens: ["Ayudante Perforista", "group2"], shifts: [shift("Ayudante Perforista")] },
    ],
    monthlyRigTotals: { "200-13": 960.6, "200-11": 820.5 },
    rigTotalsByType: { "200-13": { H1: 882.1, DIAMANTINA: 882.1, "GROUTING HQ": 78.5 } },
    rigTotalsByTypeAndScale: {
      "200-13": {
        H1: { "0-100": 474.6, "100-200": 385.2, "200-300": 22.3, "0-500": 882.1 },
        "GROUTING HQ": { "0-500": 78.5 },
      },
    },
    rigTypes: { "200-13": "DIAMANTINA", "200-11": "DIAMANTINA" },
  }, {
    // Tramo 1 = 474.6 + 385.2 = 859.8 m × 600 = 515.880; Tramo 2 = 22.3 × 800 = 17.840
    // raw = 533.720 -> /30 × 15 días = 266.860 (Tarifa Perforistas)
    "CC Perforista": 266860,
    // 859.8 × 400 + 22.3 × 600 = 357.300 -> /30 × 12 días = 142.920 (Tarifa Ayudantes)
    "CC Ayudante": 142920,
  });
}
main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => p.$disconnect());

