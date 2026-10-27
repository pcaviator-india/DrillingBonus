import "dotenv/config";
import ExcelJS from "exceljs";
import { readdirSync } from "fs";
import { join } from "path";
import { db } from "../src/lib/db";
import { parsePlanillaDiaria } from "../src/lib/excel/planilla-diaria";
import { normalizeText, normalizeRut, similarity } from "../src/lib/excel/normalize";
import { buildRoleTokenResolver } from "../src/lib/positions/registry";

/**
 * READ-ONLY audit: verifies that every PLANILLA DIARIA crew row is consistent
 * with the employee registry, i.e. the RUT written in the sheet resolves to an
 * employee whose registered name (and bonus position group) agrees with the row.
 *
 * Why: crew matching is keyed on RUT only. When a sheet pairs a valid RUT with
 * somebody else's name AND another cargo, the row silently becomes a shift for
 * the RUT owner. The engine then unions BOTH position families into the role
 * tokens, so the employee can match two mutually exclusive rules at once
 * (e.g. Group 1 MEJOR MÃQUINA + Group 2 MEJOR MÃQUINA = month-best paid twice).
 *
 * Usage:
 *   npx tsx scripts/audit-planilla-identity.ts                 # every planilla in data-samples
 *   npx tsx scripts/audit-planilla-identity.ts "<file.xlsx>"   # one file
 */

type EmployeeRow = {
  id: string;
  fullName: string;
  rut: string | null;
  jobPositionName: string | null;
  siteName: string | null;
};

type Finding = {
  kind: "unknown-rut" | "name-mismatch" | "group-conflict";
  date: string;
  sheet: string;
  orderNumber: number | null;
  rut: string;
  sheetNameRaw: string;
  cargo: string;
  machine: string | null;
  shift: string;
  employee: EmployeeRow | null;
  detail: string;
};

const NAME_TOKEN_MIN = 3;

function nameTokens(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((t) => t.length >= NAME_TOKEN_MIN);
}

/** True when two names look like the same person (order/typo tolerant). */
function namesAgree(a: string, b: string): boolean {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return true; // nothing to compare -> not a conflict
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  const shared = ta.filter((t) => tb.includes(t)).length;
  const ratio = shared / Math.max(1, Math.min(ta.length, tb.length));
  return ratio >= 0.5 || similarity(na, nb) >= 0.8;
}

/** Best registry candidate for a name written in a sheet (evidence for the report). */
function bestNameCandidate(name: string, employees: EmployeeRow[]): EmployeeRow | null {
  let best: { e: EmployeeRow; score: number } | null = null;
  for (const e of employees) {
    if (namesAgree(e.fullName, name)) return e;
    const score = similarity(normalizeText(e.fullName), normalizeText(name));
    if (!best || score > best.score) best = { e, score };
  }
  return best && best.score >= 0.55 ? best.e : null;
}

async function main() {
  const arg = process.argv[2];
  const dir = "data-samples";
  const files = arg
    ? [arg]
    : readdirSync(dir)
        .filter((f) => f.toLowerCase().endsWith(".xlsx") && /PLANILLA/i.test(f))
        .map((f) => join(dir, f));

  const employeeRows = await db.employee.findMany({
    select: { id: true, fullName: true, rut: true, jobPositionName: true, site: { select: { name: true } } },
  });
  const employees: EmployeeRow[] = employeeRows.map((e) => ({
    id: e.id,
    fullName: e.fullName,
    rut: e.rut,
    jobPositionName: e.jobPositionName,
    siteName: e.site?.name ?? null,
  }));
  const byRut = new Map(employees.filter((e) => e.rut).map((e) => [normalizeRut(e.rut as string), e]));
  const tokensFor = await buildRoleTokenResolver();
  const groupsOf = (role: string | null | undefined): string[] =>
    tokensFor(role)
      .filter((t) => /^group\d+$/i.test(t))
      .map((t) => t.toLowerCase());

  const findings: Finding[] = [];
  let totalEntries = 0;

  for (const file of files) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.readFile(file);
    } catch {
      console.log(`\n${file}: UNREADABLE â€” skipped`);
      continue;
    }
    const parsed = parsePlanillaDiaria(wb);
    const entries = parsed.sheets.flatMap((s) => s.entries);
    totalEntries += entries.length;
    const fileFindings: Finding[] = [];

    for (const s of parsed.sheets) {
      for (const e of s.entries) {
        const employee = byRut.get(e.rutNormalized) ?? null;
        const base = {
          date: e.date,
          sheet: s.sheetName,
          orderNumber: e.orderNumber,
          rut: e.rut,
          sheetNameRaw: e.fullName,
          cargo: e.cargoRaw,
          machine: e.machine,
          shift: e.shiftDayNight,
        };
        if (!employee) {
          fileFindings.push({
            ...base,
            kind: "unknown-rut",
            employee: null,
            detail: `RUT ${e.rut} is not registered (sheet name "${e.fullName}", cargo ${e.cargoRaw})`,
          });
          continue;
        }
        if (!namesAgree(employee.fullName, e.fullName)) {
          const other = bestNameCandidate(e.fullName, employees);
          fileFindings.push({
            ...base,
            kind: "name-mismatch",
            employee,
            detail: other
              ? `sheet name belongs to "${other.fullName}" (RUT ${other.rut}, job ${other.jobPositionName ?? "-"}, ${other.siteName ?? "-"}), but RUT ${e.rut} is registered to "${employee.fullName}"`
              : `sheet name "${e.fullName}" matches no registered employee; RUT ${e.rut} is registered to "${employee.fullName}"`,
          });
        }
        const planillaGroups = groupsOf(e.cargoNormalized).sort();
        const registeredGroups = groupsOf(employee.jobPositionName).sort();
        if (planillaGroups.length && registeredGroups.length && planillaGroups.join() !== registeredGroups.join()) {
          fileFindings.push({
            ...base,
            kind: "group-conflict",
            employee,
            detail: `planilla cargo "${e.cargoRaw}" is ${planillaGroups.join("/")} but registered job "${employee.jobPositionName}" is ${registeredGroups.join("/")} â€” both rule families can match this employee`,
          });
        }
      }
    }
    const counts = {
      "unknown-rut": fileFindings.filter((f) => f.kind === "unknown-rut").length,
      "name-mismatch": fileFindings.filter((f) => f.kind === "name-mismatch").length,
      "group-conflict": fileFindings.filter((f) => f.kind === "group-conflict").length,
    };
    console.log(
      `\n=== ${file}\n    sheets=${parsed.sheets.length} entries=${entries.length} | unknown-rut=${counts["unknown-rut"]} name-mismatch=${counts["name-mismatch"]} group-conflict=${counts["group-conflict"]}`,
    );

    const byEmp = new Map<string, Finding[]>();
    for (const f of fileFindings) {
      const key = f.kind === "unknown-rut" ? "(unregistered RUT)" : `${f.employee?.fullName} [${f.employee?.id}]`;
      byEmp.set(key, [...(byEmp.get(key) ?? []), f]);
    }
    for (const [key, list] of [...byEmp.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const kinds = [...new Set(list.map((f) => f.kind))].join(",");
      console.log(`  - ${key} â†’ ${list.length} row(s) [${kinds}]`);
      const show = list.slice(0, 6);
      for (const f of show) {
        console.log(
          `      ${f.date} sheet=${f.sheet} shift=${f.shift} #${f.orderNumber ?? "-"} rut=${f.rut} sheetName="${f.sheetNameRaw}" cargo="${f.cargo}" machine=${f.machine ?? "-"} :: ${f.kind} â€” ${f.detail}`,
        );
      }
      if (list.length > show.length) console.log(`      â€¦ ${list.length - show.length} more row(s)`);
    }
    findings.push(...fileFindings);
  }

  // ---------- Global summary ----------
  console.log(`\n================ SUMMARY ================`);
  console.log(`planilla rows audited: ${totalEntries}`);
  console.log(`  unknown RUT         : ${findings.filter((f) => f.kind === "unknown-rut").length}`);
  console.log(`  RUT/name mismatch   : ${findings.filter((f) => f.kind === "name-mismatch").length}`);
  console.log(`  position-group clash: ${findings.filter((f) => f.kind === "group-conflict").length}`);

  type Risk = {
    name: string;
    job: string | null;
    kinds: Set<string>;
    dates: Set<string>;
    cargos: Set<string>;
  };
  const risky = new Map<string, Risk>();
  for (const f of findings) {
    if (!f.employee) continue;
    const cur: Risk =
      risky.get(f.employee.id) ??
      ({
        name: f.employee.fullName,
        job: f.employee.jobPositionName,
        kinds: new Set<string>(),
        dates: new Set<string>(),
        cargos: new Set<string>(),
      } satisfies Risk);
    cur.kinds.add(f.kind);
    cur.dates.add(f.date);
    cur.cargos.add(f.cargo);
    risky.set(f.employee.id, cur);
  }
  const doublePayRisk = [...risky.entries()].filter(
    ([, v]) => v.kinds.has("name-mismatch") && v.kinds.has("group-conflict"),
  );
  console.log(`\nEmployees whose role tokens can be polluted by a bad row: ${risky.size}`);
  for (const [id, v] of risky) {
    console.log(
      `  ${v.kinds.has("group-conflict") ? "DOUBLE-PAY RISK" : "review"} â€” ${v.name} (registered ${v.job ?? "-"}) id=${id} Â· days=${v.dates.size} Â· cargos="${[...v.cargos].join(", ")}" Â· reasons=${[...v.kinds].join(",")}`,
    );
  }
  console.log(`\nDouble-pay risk (name mismatch + group clash on the same employee): ${doublePayRisk.length}`);
}
main()
  .catch((e) => {
    console.error("FAILED:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
