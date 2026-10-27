# Plan — Rig drilling type + site-dependent multipurpose rig + best-rig rule change

Status: PROPOSAL ONLY — no code changed. Awaiting confirmation.
## 1. Verified in codebase

- `prisma/schema.prisma` → `model Rig { id, name, code, siteId, ... }` — NO type column today.
- Rig→Site is FK `Rig.siteId`; UI: `sites/page.tsx`, `site-rigs-form.tsx`, `actions.ts`.
- Drilling type is DERIVED per shift from intervals (`calculations/run.ts` `getDrillingType`: HQ→H1, NQ→H2, PQ, RockH/RockT→RC; PQ+H1+H2 grouped as DIAMANTINA). So "1200-1=AR, 740-7=DDH" is emergent, not stored — dual-use rig breaks this.
- Best rig today (`bonus-engine/handlers/production-meter.ts`, best_rig_month): plain max of `monthlyRigTotals` (all types summed). No 2500 gate.
- Thresholds/goals (22 DDH / 50 RC, 1000/2500) already in rule params — configurable. New 2500 gate must also be a param (clinerules: never hard-code).

## 2. Request interpretation (confirm)

1. Add type column on rigs.
2. One rig (not in DB) is MULTIPROPOSITO: effective type set per Site assignment.
3. Best-rig rule: if any Aire Reverso rig totals > 2500 m → best = top AR rig; else best = top Diamantina rig. 2500 configurable.


## 3. Data model proposal

```prisma
enum RigType { DIAMANTINA AIRE_REVERSO MULTIPROPOSITO }
model Rig { ... rigType RigType @default(DIAMANTINA) ... }
```

Per-site effective type — recommended join table (keeps history):

```prisma
model SiteRig {
  id String @id @default(cuid())
  siteId String
  rigId String
  effectiveType RigType?
  site Site @relation(fields: [siteId], references: [id])
  rig Rig @relation(fields: [rigId], references: [id])
  @@unique([siteId, rigId])
}
```

Lighter alternative: `Rig.siteEffectiveType RigType?` (simpler, loses history).
Resolution helper (new `lib/rigs/effective-type.ts`, pure):
effectiveType = rig MULTIPROPOSITO ? siteRig.effectiveType ?? fallback : rig.rigType.
Fallback: infer from month intervals OR block run until admin sets it (recommend block).

## 4. Best-rig rule (configurable, pure engine)

1. Partition rigs into AR vs DDH by EFFECTIVE TYPE.
2. arTop = max monthly total among AR rigs.
3. If arTop > arThreshold (default 2500, rule param) -> best = arTop rig.
4. Else -> best = max among DDH rigs. Empty set -> fallback; ties -> by name.
New params on ProductionMeterParams: `bestRigRule?: { arThresholdMeters; preferArAboveThreshold }`.
Absent = today's behavior (backward compatible). Seeds set 2500/true.
Confirm: metric = rig monthly total (recommended) vs RC-meters-only? `>` vs `>=`?

## 8. CLOCKS & BIOMETRIC DEVICES (NEW FEATURE — PROPOSAL)

### 8.1 Current state (how clocks ARE used today)

- `prisma/schema.prisma` line 229-244: `model Device` exists (name, siteId?, isActive, attendanceRecords).
- `lib/workera/sync.ts` `discoverAndMapDevices()` auto-discovers clocking devices from attendance data and maps them to sites.
- The `Device` model is used **only for site attribution**: when an employee clocks in to a device (Workera record `inDevice`), the sync looks up `Device` by name and assigns its `siteId` to `attendanceRecord.siteAttributionSiteId`.
- **1 clock per site** today — no rigs have clocks yet.
- **No UI exposes the Device list or mapping.** The only place `device` name appears is the `attribution-table` column (`device: rec.inDevice ?? null`), which is a read-only reference inside the GPS-site-attribution review screen. A user cannot add, edit, deactivate, or assign devices.
- `Device.siteId` is nullable → a device can exist without a site, but there is no UI to set it, and no way to move a device from one site to another (the old comment said "when a site closes, its devices move to the new site" but no code implements the move).

### 8.2 What we need to make clocks visible and manageable NOW

Add a **Clocks / Devices page** in the admin UI (e.g., `/sites/clocks` or under each site):
- List of `Device` rows: name, type (biometric / mobile / web), site (or "unmapped"), isActive, last used date.
- Action to assign a device to a site.
- Action to move a device to another site (site change).
- Action to deactivate a device (e.g., broken/borrowed).
- Seed note: the two sites ("Faena A", "Faena B") already have one device each in `Device`, but the rows are populated only via `discoverAndMapDevices()` from existing attendance data — they should be created/maintained manually before any attendance exists.

### 8.3 Future architecture (after CorePlan replaces Excel sync)

**Clock hardware:** ZKTeco MB360 plus (admission/exit management system with ADMS).

**Two clock types:**

| Type | Location | Owner | Purpose |
|---|---|---|---|
| Admin clock | Per site (1 per site) | Admin / supervisor employees | General attendance, manual check-in/out, offline punch upload |
| Rig clock | Per rig (1 per rig) | Rig supervisor / workers | Auto-identify which employee worked which rig at what time |

**Connection model:**
- **Admin clock** → connects to ZKTeco ADMS app → sends biometric event directly to Workera API (Workera is still the source of truth for employee identity + attendance presence).
- **Rig clock** → NOT connected to Workera directly. After each punch, ADMS app pushes the punch to our backend; **our system posts the entry/exit to Workera on behalf of that employee**. This gives us:
  - Fixed mapping: rig clock → rig (via clock record), employee identified by ADMS account/user assigned to the clock.
  - Deterministic employee↔rig assignment for future bonus rules (rig-level attendance windowing).
- All punches are stored as `AttendanceMark` rows (immutable, keyed by `employeeId + sourceRef`) and aggregated into `AttendanceRecord` grain `(employeeId, date, shift)`, exactly like the Workera sync.

### 8.4 Required schema changes (future)

- `Device` model: add `deviceType` enum (`admin | rig | adminApp`), `isActive`, `assignedUserId?` (for rig clock → ADMS user), `rigId?` (for rig clock), `serialNumber` (MB360 serial), `notes`.
- `Employee` model: add `admsUserId` (ZKTeco ADMS login), `clockEmployee` boolean (is this employee the industrial-clocked admin?).
- `AttendanceRecord`: add `clockClockId` (FK to Device) for the clock that produced the punch — needed so future rig clocks can map punch → rig later.
- `SyncJob`: add `clockedByZkteco` flag to distinguish Workera-sourced data from SDK/MB360 sync.

### 8.5 Required UI changes (future)

- **Clocks page** (admin): CRUD for devices, field for type, search/filter, site assignment, site-change, deactivation, and viewing associated employees (rig clocks → list of ADMS users → list of employees).
- **ZKTeco ADMS integration card** in settings: API key/URL, sync interval, test-punch button.
- **Rig assignment in sync job** (future): reads rig clock punch → finds rig → posts to Workera → stores mark with `source: "zkteco"` + `clockId`.
- Update `site-attribution` and `attendance` tables to show which device/clock was used (already exposes `inDevice`, but needs a device link + name resolved from `Device`).

### 8.6 Migration + files (future)

- Migration: add `Device.deviceType`, `Device.serialNumber`, `Device.assignedUserId?`, `Employee.admsUserId`, `AttendanceRecord.clockClockId` (nullable) — keep existing Workera marks as `deviceType = "adminApp"` (from `inDevice` discovery).
- Seed: one `Device` per site for current admin clocks (name = the discovered device names from Data → Site attribution). Rig clocks are created only when rigs exist (future).
- UI: `/sites/clocks`, `/settings/zkteco-adms`, reconcile `Device` with the site-attribution table (drop `inDevice` text column once `clockClockId` is populated).
- Verify after OK: `tsc --noEmit`; DB migration clean; seed devices match the two existing site devices; sync run remains offline until Workera returns (do not break today's sync).



- `RigType` enum + `Rig.rigType` + `SiteRig(siteId, rigId unique, effectiveType)`; pushed via `prisma db push` (no migrations dir in repo). UI on /sites: type badge + selectors; assign requires effectiveType for MULTIPROPOSITO; runCalculation blocks when dual rig lacks site type.
- Engine: `ProductionMeterParams.bestRigRule { arThresholdMeters }` (Zod-validated, editable in Rules UI JSON); `BonusEngineInput.rigTypes`; `production-meter.ts` selects top AR rig when its rig monthly total is STRICTLY > threshold else top DDH. Legacy rows without the rule keep old max behavior.
- MV seeds updated with `bestRigRule: { arThresholdMeters: 2500 }`. Existing calculations untouched.
- Excel auto-created rigs default to DIAMANTINA (per schema default); change classification on /sites when more rig info arrives.
- Verified: `tsc --noEmit` clean; `scripts/verify-best-rig.ts` PASS (AR>2500→AR, AR≤2500→DDH, ==2500→DDH, legacy→max).
- To classify existing rigs later: set RigType on /sites (1200-1→AIRE_REVERSO, 740-7→DIAMANTINA, etc.).

## 5. Migration + UI + files

Migration: add enum + Rig.rigType (+ SiteRig if approved); backfill 1200-1->AR, 740-7->DDH (need full list from you); new dual rig created as MULTIPROPOSITO with per-site effectiveType. Old calculations untouched (snapshots preserved).
UI (sites/): type badge on rig rows; type selector on assign; when assigning MULTIPROPOSITO require effectiveType (Diamantina/Aire Reverso); admin-only Zod-validated actions; block calc run if dual rig has no site type.
Engine wiring: run.ts loads rig/site types -> rigTypes map into BonusEngineInput + snapshot; production-meter.ts pure selection; export super-detail mentions winner + reason; excel/process.ts default for auto-created rigs (confirm default).
Files: prisma/schema.prisma; types/bonus.ts; lib/bonus-engine/schema.ts + handlers/production-meter.ts; lib/calculations/run.ts (+new lib/rigs/effective-type.ts); app/(dashboard)/sites/*; scripts/create-mv-rules.ts + create-atex-rules.ts (+backfill); lib/export/calculation-super-detail.ts; lib/excel/process.ts.
Verify after OK: tsc --noEmit; engine unit tests (AR>2500 picks AR; AR<=2500 picks DDH; dual respects site); one real-month rerun diff.

## 6. Questions before I implement

1. Labels OK: DIAMANTINA / AIRE_REVERSO / MULTIPROPOSITO?
2. SiteRig table (recommended) vs simple Rig.siteEffectiveType column?
3. Full backfill list beyond 1200-1 / 740-7?
4. Best-rig metric: rig monthly total vs RC-only sum? `>` vs `>=` 2500?
5. 2500 editable in Rules UI or seed-default only?
6. Default type for Excel auto-created rigs?

