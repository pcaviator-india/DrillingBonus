# Plan v2 — CorePlan as the unique data source (rules & engine unchanged)

Status: **PROPOSAL ONLY — awaiting confirmation.** The data-explorer probe is built and ready to run once credentials are added.

**Correction from v2-draft:** Bonus **rules and the engine stay exactly as they are today.** The only change is the **data source**: CorePlan (uniquely) replaces the Excel rig-intervals + crew-assignment files. CorePlan is synced into the existing normalized models (`RigShiftPerformance`, `CrewAssignment`, `Rig`, `Employee.coreplanId`), and the **existing engine + existing site `BonusRuleSet`s** compute bonuses unchanged. No separate calculator.

This is confirmed against the live API docs: CorePlan carries rigs, people, shifts, worked durations and drilled metres — enough to feed the same pipeline.

---

## 1. Authoritative API reference (verified against live docs)

Fetched the real OpenAPI 3.0.0 spec from `https://dev.coreplan.io/public-api/v1` (Next.js/RapiDoc page; spec embedded in `__NEXT_DATA__`). Full spec cached locally at `scripts/.tmp/coreplan-openapi.json` (339 paths) for implementation reference.

### 1.1 Auth (two URLs, as before)
- Login: `POST https://www.coreplan.io/api/v1/auth/login/` body `{email, password}` → token. (OAuth2 alt: `POST /api/oauth/token/`.)
- Data base: `https://www.coreplan.io/api/public/v1/` (all GET, read-only). Auth header `Authorization: Token <token>` (per Postman PDF) — **confirm via probe**.

### 1.2 Endpoints we will use (exact paths + query filters)
| Purpose | Path | Useful query params |
|---|---|---|
| Projects (sites) | `/projects/` | `is_active`, `updated_since`, `updated_before`, `created_since`, `created_before` |
| Rigs | `/drilling-rigs/` | `is_active`, `updated_since`… |
| People (employees) | `/people/` | `is_active`, `updated_since`… |
| Shifts (plods) | `/drilling-plods/` | `project_id`, `rig_id`, `date`, `date_since`, `date_before`, `workshift`, `status`, `updated_since`… |
| Crew present on a shift | `/drilling-plods/people-present/` | `plod_id`, `person_id`, `role`, `updated_since`… |
| Drilled metres | `/drilling-plods/drilling-intervals/` | `plod_id`, `hole_id`, `type_id`, `date_since`, `date_before`, `updated_since`… |
| Drill types | `/drill-types/` | `updated_since`… |
| Deletions (optional) | each resource has `/…/deleted/` | `deleted_since` |

Deprecated (do NOT use): `/plods/*` and `/rigs/`. Other plod families exist (`earthworks-plods`, `geophysics-plods`, `surface-drill-and-blast-plods`, `underground-drill-and-blast-plods`) — **out of scope**; we use `/drilling-plods/`.

### 1.3 Pagination / dates
- Envelope `PaginatedDto`: `{count, next, previous, results}`; follow `next` URL until null. Use `pagination=cursor&page-size=1000` per the PDF.
- `date` example is `"2021-04-17"` (ISO) in the spec (the PDF showed compact `20211012`) — **confirm actual format in the probe** and parse defensively.
- Incremental via `updated_since` (ISO 8601 UTC `Z`).

### 1.4 Exact schemas (key fields)
- **Project**: `id`, `name`, `reference_number`, `currency`, `unit_of_length`, `is_active`.
- **DrillingRig**: `id`, `name`, `type` (enum below), `drill_company_id`, `is_active`.
  - `RigType` enum: `DD, RC, AUG, RAB, AC, HYD, SNC, BH` (DD=Diamond, RC=Reverse Circulation, …). Maps to our DIAMANTINA (DD) / AIRE_REVERSO (RC); others need a decision.
- **Person**: `id`(uuid), `name`, `job_role`, `employee_id`, `employer`, `payroll_category`, `is_active`, `personnel_id`, `user_id`.
- **DrillingPlod** (a shift): `id`, `slug`, `date`, `project_id`, `rig_id`, `rig_start`, `rig_end` (engine-hour readings), `workshift`, `status`, `cost`.
  - `Workshift` enum: **`D` (Day), `M` (Afternoon), `N` (Night)** — note the extra `M`.
  - `status`: `supervisor_approval_pending | supervisor_approved | client_approval_pending | client_rejected | client_approved | invalid`.
- **DrillingPlodPersonPresent**: `plod_id`, `person_id`, `person_name`, `role` (enum, e.g. `driller`), `job_role`, `duration` (**seconds**), `sick_duration`, `travel_duration`, `hole_id`, `cost`.
- **PlodDrillingInterval** (metres): `plod_id`, `hole_id`, `depth_from`, `depth_to` (**strings**, e.g. `"180.00"`), `type_id`, `duration`, `end_of_hole`, `core_loss`, `order`. Metres = `depth_to − depth_from`.
- **DrillType**: `id`, `name`, `reference_name` (short code), `rig_type`, `sample_type_id`.

### 1.5 "Turns"
CorePlan has **no explicit A/B turn** field. `workshift` (D/M/N) is the closest. If A/B turn matters for the rules, it must be derived (e.g. rotation by date) or imported — **open decision (see §7).**

---

## 2. How CorePlan plugs into the existing pipeline (rules & engine unchanged)

CorePlan becomes the **unique data source** for drilling/crew data. It syncs into the **same normalized models** the Excel files use today, so `src/lib/calculations/run.ts` + `src/lib/bonus-engine` + the existing `BonusRuleSet`s run **unchanged**:

- **Rigs** → `Rig` (map CorePlan `type` DD→DIAMANTINA, RC→AIRE_REVERSO; link to `Site` via project).
- **Shifts** → `RigShiftPerformance` (one per rig+date+shift): metres from intervals, `source: "coreplan"`.
- **Crew present** → `CrewAssignment` (person → `Employee.coreplanId`, `roleOnShift = job_role`).
- **People** → match to existing `Employee` (identity stays Workera-first; CorePlan fills `coreplanId`).
- Hours/attendance still come from Workera `AttendanceRecord` (the engine's attendance gate is unchanged) — unless you want CorePlan `duration` to also feed hours (open decision §7.4).

What changes is only the **fetch layer** in `src/lib/coreplan/` (auth + client + mapping). The engine, rule sets, and reconciliation are untouched. Excel upload stays available but is no longer the source once CorePlan is wired.

### 2.1 Where "uniquely" matters
- A site is driven by **either** Excel **or** CorePlan, not mixed. Recommendation: when CorePlan data exists for a site/period, it is authoritative (`source: "coreplan"` rows), and Excel rows for the same rig+date+shift are overwritten by the CorePlan upsert (the models already key on `rigId+date+shift`).

---

## 3. Data flow

```
[CorePlan API]  (read-only; login email/password → token)
  GET /projects/            ─▶ Site link (project_id → Site)
  GET /drilling-rigs/       ─▶ Rig (+ type DD/RC…)  → Rig.rigType
  GET /people/              ─▶ Employee.coreplanId (+ employee_id, job_role, payroll_category)
  GET /drilling-plods/?project_id&date_since&date_before   ─▶ shifts (rig_id, workshift, status)
  GET /drilling-plods/people-present/  (per period)        ─▶ CrewAssignment (who + duration)
  GET /drilling-plods/drilling-intervals/ (per period)     ─▶ RigShiftPerformance.intervals + meters
  GET /drill-types/         ─▶ type_id → reference_name (drilling type)
        │
        ▼  mapping.ts (pure): join plod_id; workshift D/M/N→shift; metres=Σ(depth_to−depth_from);
        │                     interval.diameter ← drill-type reference_name; hours=duration/3600
        ▼  sync.ts: upsert into Rig / RigShiftPerformance / CrewAssignment (source="coreplan")
        ▼  EXISTING engine + rule sets run unchanged → bonus calculation
        ▼  Sync page triggers it (background job, like Workera)
```

---

## 4. Proposed file layout

```
src/lib/coreplan/
  auth.ts     // login -> {token, expiresAt}; in-memory cache + refresh on 401/expiry
  client.ts   // typed getters (getProjects, getRigs, getPeople, getPlods,
              //   getPeoplePresent, getDrillingIntervals, getDrillTypes) with
              //   cursor pagination, 429/Retry-After backoff, array-or-envelope tolerance
  types.ts    // Zod schemas matching the REAL payloads (from the cached OpenAPI spec)
  mapping.ts  // PURE: raw CorePlan -> rows shaped for Rig/RigShiftPerformance/CrewAssignment
  sync.ts     // upsert into the EXISTING normalized models (source="coreplan"); mirror workera/sync.ts
  mock.ts     // keep for offline dev behind COREPLAN_MOCK
src/app/(dashboard)/sync/          // extend the existing Sync page (like Workera)
  actions.ts  // add syncCorePlanAction(from,to) -> createJob + runJobInBackground
  sync-forms.tsx // add "Sync CorePlan drilling data" card (project/period), live-vs-mock badge
scripts/probe-coreplan.ts  // DONE: logs in, confirms auth header + cursor + date shape,
                           //   and prints exactly what data CorePlan holds (see where we stand)
```

**Schema:** reuse existing `Rig`, `RigShiftPerformance`, `CrewAssignment`, `Employee` — no engine-facing schema change. The only candidate additions (decide in §8): `Rig.coreplanRigId Int? @unique` (CorePlan rig ids are numeric, no code) and `Site.coreplanProjectId Int? @unique` (to map project→site). Both are optional conveniences; the sync can also match by name.


---

## 5. Normalized rows produced by `mapping.ts` (pure) → existing models

```ts
// Per drilling plod (shift) -> one RigShiftPerformance
{ rigId, date, shift: "day"|"night",           // workshift D->day, N->night, M->? (see §7)
  metersDrilled: Σ(depth_to−depth_from),        // productive intervals only (exclude grouting)
  intervals: [{ band, escala, diameter, meters }], // diameter = drill-type reference_name
  hole, hoursSpent, source: "coreplan", rawData }
// Per people-present row -> one CrewAssignment
{ employeeId (via Employee.coreplanId = person_id), rigId, date, shift,
  roleOnShift: job_role, source: "coreplan", rawData: { duration, sick/travel } }
// /drilling-rigs/ -> Rig { name, rigType (DD->DIAMANTINA, RC->AIRE_REVERSO), siteId via project }
```

Metres are aggregated per shift from its intervals (group by `plod_id`); drilling type per interval comes from `type_id → drill-types.reference_name`, resolved through the existing `resolveDrillingTypeFromDiameter` so the engine derives type/depth exactly as it does from Excel today.

---

## 6. Rules — UNCHANGED
No new rule config. CorePlan rows feed the **existing** `RigShiftPerformance`/`CrewAssignment`, so the current `BonusRuleSet`s (rates, thresholds, shift/turn logic, best-rig) apply as-is. Only the **source label** on rows changes to `"coreplan"`. Config that already exists (which statuses count, drill-type→rate keys) is reused, not reinvented.

---

## 7. Open decisions to confirm (blocking the sync wiring)

1. **Workshift `M` (Afternoon):** the engine models only day/night today. Store `M` as a third `shift` label, fold into day, or ignore? (CorePlan `Workshift` enum = `D/M/N`.)
2. **Hours:** keep hours/attendance from Workera (engine unchanged), or also let CorePlan crew `duration/3600` populate `hoursSpent`? Do `sick_duration`/`travel_duration` count?
3. **Which shift `status` values** count as valid drilling shifts (default: `supervisor_approved, client_approved`; ignore pending/rejected/invalid)?
4. **Drill-type → rate keys:** confirm CorePlan `reference_name` values map to the engine's `HQ/NQ/PQ/RC/…` (probe will print the actual list).
5. **Identity match:** confirm `Employee.coreplanId = people.id` (uuid) and whether `employee_id` should backfill/verify Workera matches.
6. **Site/project mapping:** how do CorePlan `project_id` → our `Site`, and rigs → `Site`? (add `Site.coreplanProjectId` / `Rig.coreplanRigId`, or match by name?)
7. **"Unique" scope:** per site/period, CorePlan overwrites Excel rows for the same rig+date+shift (recommended) — confirm.
8. **Auth header + date format:** the probe tries `Token` then `Bearer` and prints the real `date` shape — confirm from its output.

---

## 8. Phased rollout

1. **Probe (built, ready):** add `COREPLAN_EMAIL`/`COREPLAN_PASSWORD` to `.env`, run `npx tsx --env-file=.env scripts/probe-coreplan.ts [--project N --from YYYY-MM-DD --to YYYY-MM-DD]` → **this is how we see where we stand with the data** (login, auth header, counts, date ranges, workshift/status/drill-type values, sample shifts/crew/intervals).
2. **Auth + client** (`auth.ts`, `types.ts`, `client.ts`) against the live read-only API; Zod schemas from the cached spec.
3. **mapping.ts** (pure) → rows; unit-verify joins (plod→intervals/crew, type_id→drill type) for one project/month.
4. **sync.ts** upsert into existing models (`source="coreplan"`); verify a calculation for one site runs unchanged on CorePlan data.
5. **Sync page** action/form (background job, like Workera); optional `updated_since` incremental + `/deleted/` handling.

---

## Appendix — how the two source docs differ from the live spec
- PDF `Retrieve_…_Access_Token…pdf`: auth only (login URL + `{email,password}` body, "Token" API-key style). Consistent with live docs.
- PDF `Retrieving shift, personnel and drilled metre data…pdf`: matches the live endpoints for `/drilling-plods/`, `/people-present/`, `/drilling-intervals/`, `/projects/`, `/drilling-rigs/`, `/people/`, `/drill-types/`. Live spec **adds** `workshift` enum `D/M/N` (PDF only mentioned D/M/N informally), `role`+`job_role` on people-present, `rig_start/rig_end` engine-hours, and the full 339-endpoint surface. Cached spec is the implementation reference.

