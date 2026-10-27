# PROJECT PLAN – Drilling Bonus Calculation System
**Version:** 2.0 (Excel-first, CorePlan-ready)  
**Last updated:** 2026-08-31

## 1. Vision

Build a modular web application that calculates employee bonuses for drilling operations.

### Current Data Sources
1. **Workera API** → Attendance (who was present, hours, absences)
2. **Rig Excel files** → One file per rig containing:
   - Date
   - Hole worked on
   - Shift (Day / Night)
   - Drilling Level
   - Drilling Quantity (meters)
   - Hours spent
   - (other columns may exist but we only need the above for now)
3. **Crew Assignment file** → Which employees worked on which Rig / Machine (and preferably which shift)

### Future Data Source
- **CorePlan API** (or export) will later replace the Excel files.
  The system must be designed so that switching from Excel → CorePlan requires minimal changes.

### Core Logic
1. Get attendance from Workera
2. Get who worked on which Rig (from Crew Assignment file)
3. Get drilling performance per Rig + Date + Shift (from Rig Excel files)
4. Match Employee → Rig → Shift → Drilling performance
5. Apply site-specific + role-specific + performance-based bonus rules
6. Produce auditable bonus results

---

## 2. Key Design Principle: Modularity

We treat **data sources as interchangeable providers**.
┌────────────────────┐
│  Data Providers    │
│  - WorkeraProvider │
│  - ExcelProvider   │  ← current
│  - CorePlanProvider│  ← future
└─────────┬──────────┘
│
▼
┌────────────────────┐
│  Normalized Models │  ← common internal format
└─────────┬──────────┘
│
▼
┌────────────────────┐
│  Bonus Engine      │  ← pure functions
└────────────────────┘


All calculation logic works only with the **normalized internal models**.  
It never knows whether the data came from Excel or CorePlan.

---

## 3. Tech Stack (Mandatory)

- Next.js 15 (App Router) + TypeScript
- Tailwind CSS + shadcn/ui
- Prisma + PostgreSQL (Neon recommended)
- Zod
- date-fns
- NextAuth.js or Clerk
- Excel parsing: `xlsx` or `exceljs`

Do not introduce other major libraries without approval.

---

## 4. Core Domain Models (Normalized)

These are the internal models the whole system works with:

### Employee
- id, name, rut / employeeCode
- workeraId
- defaultRole
- siteId (optional)

### AttendanceRecord
- employeeId
- date
- hoursWorked
- status (present, absent, etc.)
- source: "workera"

### RigShiftPerformance (from Excel or later CorePlan)
- rigId / rigName
- date
- shift: "day" | "night"
- hole
- drillingLevel
- metersDrilled
- hoursSpent
- source: "excel" | "coreplan"

### CrewAssignment
- employeeId
- rigId / rigName
- date
- shift (optional but preferred)
- roleOnShift (Driller, Helper, etc.)
- source: "excel" | "coreplan" | "manual"

### Site + BonusRuleSet
- Fully configurable rules per site
- Versioned + effective dates

### BonusCalculation
- Final result + full snapshot of inputs used (for audit)

---

## 5. Data Flow (Current)

1. Admin uploads:
   - Multiple Rig Excel files
   - One Crew Assignment file
2. System parses and normalizes them into `RigShiftPerformance` and `CrewAssignment`
3. System pulls attendance from Workera for the same period
4. Matching engine joins:
   - Employee + Date + Shift + Rig
5. Bonus Engine calculates using the matched data + site rules
6. Results are stored with full audit trail

---

## 6. Folder Structure
src/
├── app/
│   ├── (dashboard)/
│   │   ├── sites/
│   │   ├── employees/
│   │   ├── uploads/          ← Excel upload pages
│   │   ├── rules/
│   │   ├── calculations/
│   │   └── sync/
│   └── api/
│       ├── workera/
│       ├── uploads/
│       └── bonuses/
├── lib/
│   ├── workera/              # Workera API client
│   ├── excel/                # Excel parsers (current provider)
│   ├── coreplan/             # Future provider (placeholder)
│   ├── providers/            # Common interfaces
│   ├── matching/             # Employee ↔ Rig ↔ Shift matching
│   ├── bonus-engine/         # Pure calculation logic
│   └── db.ts
├── prisma/
└── types/


---

## 7. Provider Interface (Critical for future CorePlan)

```ts
interface PerformanceProvider {
  getRigShiftPerformance(period: DateRange): Promise<RigShiftPerformance[]>
}

interface CrewProvider {
  getCrewAssignments(period: DateRange): Promise<CrewAssignment[]>
}

8. Development Phases
Phase 1 – Foundation

Project setup + Prisma schema
Auth
Site + Role management
Workera client (employees + attendance)
Basic Employee sync

Phase 2 – Excel Ingestion

Upload page for Rig Excel files
Upload page for Crew Assignment file
Parsers that normalize into internal models
Data preview + validation

Phase 3 – Matching + Calculation

Matching engine (Employee + Date + Shift + Rig)
Configurable Bonus Rules per site
Pure Bonus Engine
Run calculation + store results with audit

Phase 4 – Polish + Future-proofing

Better error handling & validation of Excel files
Historical calculations
Export results
Prepare CorePlan provider (interface already exists)


9. Coding Rules (Strict)

Never hard-code bonus percentages or formulas
All external data must be normalized before use
Calculation engine = pure functions only
Excel parsing logic stays isolated in lib/excel/
Do not put business logic in React components
Always store the source of data (excel / workera / coreplan)
Prefer configuration over new code when adding sites or rules


10. Current Priority

Finalize Prisma schema supporting both Excel and future CorePlan
Workera integration
Excel upload + parsing for Rig files and Crew Assignment
Matching logic
Basic bonus calculation


Instruction for AI (Cline / Qwen / etc.):
Always follow this document.

If a request conflicts with the modular design or tech stack, stop and ask for clarification.