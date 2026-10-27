/**
 * CorePlan data explorer (read-only). Confirms login, auth header, pagination and
 * shows exactly what data CorePlan holds for us — so we can "see where we stand"
 * before wiring the sync that replaces the Excel rig/crew files.
 *
 * Credentials (add to .env):
 *   COREPLAN_EMAIL="..."
 *   COREPLAN_PASSWORD="..."
 * Optional overrides:
 *   COREPLAN_AUTH_URL="https://www.coreplan.io/api/v1/auth/login/"
 *   COREPLAN_DATA_URL="https://www.coreplan.io/api/public/v1/"
 *
 * Run: npx tsx --env-file=.env scripts/probe-coreplan.ts
 * Scope plods/crew/intervals to a project + period (optional):
 *   npx tsx --env-file=.env scripts/probe-coreplan.ts --project 1 --from 2026-08-01 --to 2026-08-31
 */
const AUTH_URL = (process.env.COREPLAN_AUTH_URL ?? "https://www.coreplan.io/api/v1/auth/login/").replace(/\/+$/, "") + "/";
const DATA_URL = (process.env.COREPLAN_DATA_URL ?? "https://www.coreplan.io/api/public/v1/").replace(/\/+$/, "") + "/";
const EMAIL = process.env.COREPLAN_EMAIL ?? "";
const PASSWORD = process.env.COREPLAN_PASSWORD ?? "";
const PAGE_SIZE = 1000;
const MAX_PAGES = 50; // safety cap

const argv = process.argv.slice(2);
const arg = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const PROJECT = arg("project");
const FROM = arg("from");
const TO = arg("to");

function log(...a: unknown[]) { console.log(...a); }
function head(title: string) { log(`\n========== ${title} ==========`); }

async function login(): Promise<string> {
  if (!EMAIL || !PASSWORD) {
    throw new Error("Missing COREPLAN_EMAIL / COREPLAN_PASSWORD in .env");
  }
  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Login failed: ${res.status} ${res.statusText} — ${text.slice(0, 200)}`);
  let token = "";
  let expiresIn: number | undefined;
  try {
    const j = JSON.parse(text) as Record<string, unknown> & { data?: Record<string, unknown> };
    token = String(j.token ?? j.key ?? j.access ?? j.access_token ?? j.auth_token ?? j.data?.token ?? "");
    expiresIn = (j.expires_in ?? j.expiresIn ?? j.data?.expires_in) as number | undefined;
    if (!token && typeof j === "string") token = j as unknown as string;
  } catch {
    token = text.trim().replace(/^"|"$/g, "");
  }
  if (!token) throw new Error(`Login OK but no token found in response: ${text.slice(0, 200)}`);
  log(`[login] OK — token length ${token.length}${expiresIn ? `, expires_in=${expiresIn}s` : ""}`);
  return token;
}

/** Cursor-paginated GET. Follows `next` until null. Tries Token then Bearer auth. */
async function fetchAll(
  token: string,
  path: string,
  params: Record<string, string | undefined> = {},
): Promise<unknown[]> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") qs.set(k, v);
  qs.set("pagination", "cursor");
  qs.set("page-size", String(PAGE_SIZE));

  const out: unknown[] = [];
  let url: string | null = `${DATA_URL}${path}?${qs.toString()}`;
  let pages = 0;
  while (url && pages < MAX_PAGES) {
    let res: Response | null = null;
    let body = "";
    for (const scheme of ["Token", "Bearer"]) {
      const r = await fetch(url, {
        headers: { Authorization: `${scheme} ${token}`, Accept: "application/json" },
      });
      if (r.ok) { res = r; break; }
      body = await r.text().catch(() => "");
      if (r.status === 429) {
        const wait = Number(r.headers.get("Retry-After") ?? 2);
        log(`[429] rate-limited on ${path}, waiting ${wait}s`);
        await new Promise((r2) => setTimeout(r2, wait * 1000));
        continue;
      }
      if (r.status !== 401 && r.status !== 403) break;
    }
    if (!res) throw new Error(`${path} failed: ${body.slice(0, 200)}`);

    const json = (await res.json()) as unknown;
    if (Array.isArray(json)) {
      out.push(...json);
      url = null;
    } else {
      const env = json as { results?: unknown[]; next?: string | null };
      out.push(...(env.results ?? []));
      url = env.next ?? null;
    }
    pages++;
  }
  log(`[fetch] ${path}: ${out.length} rows (${pages} page${pages === 1 ? "" : "s"})`);
  return out;
}

function sample<T>(rows: T[], n = 2): T[] { return rows.slice(0, n); }
function range(rows: Record<string, unknown>[], field: string): string {
  const vals = rows.map((r) => String(r[field] ?? "")).filter(Boolean).sort();
  if (!vals.length) return "—";
  return `${vals[0]} … ${vals[vals.length - 1]}`;
}
function distinct(rows: Record<string, unknown>[], field: string): string {
  const set = new Set(rows.map((r) => String(r[field] ?? "(null)")));
  return [...set].slice(0, 12).join(", ") + (set.size > 12 ? `, …(+${set.size - 12})` : "");
}

async function main() {
  const token = await login();

  head("PROJECTS /projects/");
  const projects = (await fetchAll(token, "projects")) as Record<string, unknown>[];
  for (const p of projects) log(`  #${p.id}  ${p.name}  ref=${p.reference_number ?? "—"}  active=${p.is_active}`);

  head("RIGS /drilling-rigs/");
  const rigs = (await fetchAll(token, "drilling-rigs")) as Record<string, unknown>[];
  for (const r of rigs.slice(0, 40)) log(`  #${r.id}  ${r.name}  type=${r.type}  active=${r.is_active}`);
  if (rigs.length > 40) log(`  … (+${rigs.length - 40} more)`);

  head("DRILL TYPES /drill-types/");
  const drillTypes = (await fetchAll(token, "drill-types")) as Record<string, unknown>[];
  for (const d of drillTypes) log(`  #${d.id}  name=${d.name}  ref=${d.reference_name ?? "—"}  rig_type=${d.rig_type ?? "—"}`);

  head("PEOPLE /people/");
  const people = (await fetchAll(token, "people")) as Record<string, unknown>[];
  log(`  total=${people.length}`);
  for (const p of sample(people, 4))
    log(`  ${p.name}  emp_id=${p.employee_id ?? "—"}  job_role=${p.job_role ?? "—"}  payroll=${p.payroll_category ?? "—"}`);

  const plodParams: Record<string, string | undefined> = { project_id: PROJECT };
  if (FROM) { plodParams.date_since = FROM; plodParams.date_before = TO ?? FROM; }

  head(`SHIFTS /drilling-plods/ ${PROJECT ? `(project ${PROJECT})` : "(all)"} ${FROM ? `${FROM}..${TO ?? FROM}` : ""}`);
  const plods = (await fetchAll(token, "drilling-plods", plodParams)) as Record<string, unknown>[];
  log(`  total=${plods.length}`);
  if (plods.length) {
    log(`  date range: ${range(plods, "date")}`);
    log(`  workshift values: ${distinct(plods, "workshift")}`);
    log(`  status values: ${distinct(plods, "status")}`);
    log(`  rig_id values: ${distinct(plods, "rig_id")}`);
    for (const p of sample(plods, 3))
      log(`  plod #${p.id} date=${p.date} shift=${p.workshift} rig=${p.rig_id} status=${p.status} rig_start=${p.rig_start} rig_end=${p.rig_end}`);
  }

  head("CREW PRESENT /drilling-plods/people-present/");
  const crew = (await fetchAll(token, "drilling-plods/people-present")) as Record<string, unknown>[];
  log(`  total=${crew.length}`);
  for (const c of sample(crew, 4))
    log(`  plod=${c.plod_id}  ${c.person_name}  job_role=${c.job_role ?? "—"}  role=${c.role ?? "—"}  duration=${c.duration}s (=${(Number(c.duration) / 3600).toFixed(2)}h)`);

  head("DRILLED METRES /drilling-plods/drilling-intervals/");
  const intervals = (await fetchAll(token, "drilling-plods/drilling-intervals")) as Record<string, unknown>[];
  log(`  total=${intervals.length}`);
  for (const iv of sample(intervals, 4))
    log(`  plod=${iv.plod_id}  ${iv.depth_from}→${iv.depth_to} (=${(Number(iv.depth_to) - Number(iv.depth_from)).toFixed(2)}m)  type_id=${iv.type_id}  dur=${iv.duration}s`);

  head("SUMMARY");
  log(`  projects=${projects.length}  rigs=${rigs.length}  people=${people.length}  drillTypes=${drillTypes.length}`);
  log(`  plods=${plods.length}  crewRows=${crew.length}  intervalRows=${intervals.length}`);
  log("\nDone. Use these shapes to confirm the sync mapping before wiring it in.");
}

main().catch((e) => { console.error("\nPROBE FAILED:", e instanceof Error ? e.message : e); process.exit(1); });

