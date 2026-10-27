import { z } from "zod";
import {
  workeraEmployeeSchema,
  workeraAttendanceSchema,
  workeraListEnvelope,
  workeraJobPositionSchema,
  parseOrgUnitList,
  orgUnitRow,
  type WorkeraAttendance,
  type WorkeraEmployee,
  type WorkeraJobPosition,
  type WorkeraOrgUnit,
} from "./types";
import { getMockEmployees, getMockAttendance } from "./mock";

const BASE_URL = (process.env.WORKERA_BASE_URL ?? "").replace(/\/+$/, "");
const API_KEY = process.env.WORKERA_API_KEY ?? "";
const API_USER = process.env.WORKERA_API_USER ?? "";
const MOCK = process.env.WORKERA_MOCK === "true";

/**
 * The Workera /employee endpoint REQUIRES branchOffice and department codes
 * (per official docs). Configure them as comma-separated branch:department
 * pairs, e.g. WORKERA_SCOPE="MATRIZ:INICIAL,IQ01:D001".
 * /attendanceData accepts the same codes optionally.
 */
const SCOPE_PAIRS = (process.env.WORKERA_SCOPE ?? "")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean)
  .map((p) => {
    const [branchOffice, department] = p.split(":").map((s) => s.trim());
    return { branchOffice, department };
  });

/**
 * Dedicated Workera client. All external Workera API calls go through here â€“
 * never call Workera from components, routes, or the bonus engine directly.
 *
 * Auth per docs: API_USER + API_KEY are required. Sent both as query params
 * and headers so either server-side convention works.
 */
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_PAGES = 500;

async function workeraFetch(
  path: string,
  params: Record<string, string> = {},
): Promise<unknown> {
  if (!API_KEY || !API_USER) {
    throw new Error(
      "Workera credentials missing: set WORKERA_API_USER and WORKERA_API_KEY in .env (API_USER is the user code Workera assigned alongside the key)",
    );
  }
  const qs = new URLSearchParams({ ...params });
  if (API_USER) qs.set("API_USER", API_USER);
  if (API_KEY) qs.set("API_KEY", API_KEY);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}?${qs.toString()}`, {
      headers: {
        ...(API_USER ? { API_USER } : {}),
        ...(API_KEY ? { API_KEY } : {}),
        Accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Workera GET ${path} failed: ${res.status} ${res.statusText}${body ? ` â€” body: ${body.slice(0, 300)}` : ""}`,
    );
  }
  return res.json();
}

async function fetchPaginated<T>(
  path: string,
  baseParams: Record<string, string>,
  dataSchema: z.ZodType<T>,
): Promise<T[]> {
  const out: T[] = [];
  let page = 1;
  for (;;) {
    const t0 = Date.now();
    const json = await workeraFetch(path, { ...baseParams, page: String(page) });
    const parsed = workeraListEnvelope(dataSchema).parse(json);
    out.push(...parsed.data);
    console.log(
      `[workera] ${path} page ${parsed.page}/${parsed.totalPages}: ${parsed.pageResult} rows (${Date.now() - t0}ms, total ${out.length})`,
    );
    // Advance only when the API actually returns the page we asked for;
    // guards against APIs that ignore the page param (would loop forever).
    // Also stop when we've collected totalResult rows (some endpoints report
    // fewer pages than exist) — never silently return a partial page 1.
    if (parsed.page !== page || parsed.pageResult === 0) break;
    page += 1;
    if (out.length >= parsed.totalResult) break;
    if (page > parsed.totalPages || page > MAX_PAGES) {
      if (page > MAX_PAGES && page <= parsed.totalPages) {
        throw new Error(`Workera ${path}: exceeded ${MAX_PAGES} pages — aborting`);
      }
      break;
    }
  }
  return out;
}

export const workeraClient = {
  isMock(): boolean {
    return MOCK;
  },

  /** GET /employee â€” requires branchOffice + department scope pairs */
  async fetchEmployees(pairs?: { branchOffice: string; department: string }[]): Promise<WorkeraEmployee[]> {
    if (MOCK) return getMockEmployees();
    const scopes = pairs && pairs.length > 0 ? pairs : SCOPE_PAIRS;
    if (scopes.length === 0) {
      throw new Error(
        "No Workera scope selected â€” import branches & departments on the Sync page and select at least one pair (GET /employee requires branchOffice + department)",
      );
    }
    const results: WorkeraEmployee[] = [];
    for (const scope of scopes) {
      results.push(
        ...(await fetchPaginated(
          "/employee",
          { branchOffice: scope.branchOffice, department: scope.department },
          workeraEmployeeSchema,
        )),
      );
    }
    return results;
  },

  /** GET /branchOffice â€” lists all branch offices (sucursales) */
  async fetchBranchOffices(): Promise<WorkeraOrgUnit[]> {
    if (MOCK) {
      return [
        { code: "SITE-01", name: "Mina Norte" },
        { code: "SITE-02", name: "Mina Sur" },
      ];
    }
    return parseOrgUnitList(await fetchPaginated("/branchOffice", {}, orgUnitRow));
  },

  /** GET /department â€” lists all departments */
  async fetchDepartments(): Promise<WorkeraOrgUnit[]> {
    if (MOCK) {
      return [
        { code: "PERF", name: "PerforaciÃ³n" },
        { code: "OPS", name: "Operaciones" },
      ];
    }
    return parseOrgUnitList(await fetchPaginated("/department", {}, orgUnitRow));
  },

  /** GET /attendanceData - paginated, 20 results per page.
   * Queried per unique branchOffice WITHOUT department: department is optional
   * and branch x department pairs that do not exist in Workera return HTTP 500.
   * Per-branch queries return all departments in one call. A failing branch
   * (e.g. branch with no attendance data) is skipped with a warning.
   */
  async fetchAttendance(from: string, to: string, pairs?: { branchOffice: string; department: string }[]): Promise<WorkeraAttendance[]> {
    if (MOCK) return getMockAttendance(from, to);
    const results: WorkeraAttendance[] = [];
    const scopes = pairs && pairs.length > 0 ? pairs : SCOPE_PAIRS.length > 0 ? SCOPE_PAIRS : [undefined];
    const branchCodes = [
      ...new Set(scopes.map((s) => s?.branchOffice).filter((b): b is string => Boolean(b))),
    ];
    const targets = branchCodes.length > 0 ? branchCodes : [undefined];
    for (const branch of targets) {
      const params: Record<string, string> = { start: from, end: to };
      if (branch) params.branchOffice = branch;
      try {
        results.push(...(await fetchPaginated("/attendanceData", params, workeraAttendanceSchema)));
      } catch (e) {
        console.warn(
          `[workera] attendance for branchOffice=${branch ?? '(all)'} failed, skipping: ${e instanceof Error ? e.message.slice(0, 200) : e}`,
        );
      }
    }
    if (results.length === 0 && targets.length > 1) {
      throw new Error(
        "Workera attendance sync returned no data: all branch queries failed (see server warnings)",
      );
    }
    return results;
  },
  /** GET /attendanceData for a SINGLE branch office. Throws on failure so the
   * caller (per-unit sync) can record the error against that exact site/date.
   */
  async fetchAttendanceForBranch(
    from: string,
    to: string,
    branchCode: string,
  ): Promise<WorkeraAttendance[]> {
    if (MOCK) return getMockAttendance(from, to);
    return fetchPaginated(
      "/attendanceData",
      { start: from, end: to, branchOffice: branchCode },
      workeraAttendanceSchema,
    );
  },
  async fetchJobPositions(): Promise<WorkeraJobPosition[]> {
    if (MOCK) {
      return [
        { code: "51", name: "Perforista" },
        { code: "18", name: "Ayudante de Perforista" },
        { code: "22", name: "Chofer" },
        { code: "62", name: "Supervisor de Operaciones" },
      ];
    }
    return fetchPaginated("/jobPosition", {}, workeraJobPositionSchema);
  },
  /** POST /events - push a single attendance punch to Workera */
  async postAttendanceEvent(payload: {
    employeeCode: string;
    eventType: string;
    timestamp: string;
    deviceName?: string;
    checksum?: string;
  }): Promise<void> {
    if (!API_KEY || !API_USER) {
      throw new Error(
        "Workera credentials missing: set WORKERA_API_USER and WORKERA_API_KEY in .env",
      );
    }
    const body = JSON.stringify(payload);
    const res = await fetch(
      `${BASE_URL}/events?API_USER=${API_USER}&API_KEY=${API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body,
        cache: "no-store",
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Workera POST /events failed: ${res.status} ${res.statusText}${text ? ` - body: ${text.slice(0, 300)}` : ""}`,
      );
    }
  },
};

