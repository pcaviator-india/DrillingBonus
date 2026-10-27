import { Suspense } from "react";
import { format, startOfMonth, endOfMonth, addMonths } from "date-fns";
import { db } from "@/lib/db";
import { normalizeRut } from "@/lib/excel/normalize";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TurnGrid, type TurnMap } from "./turn-grid";
import type { TurnGridEmployee, TurnGridDay } from "./turn-toolbar";
import { TurnNav } from "./turn-nav";

type SearchParams = { site?: string; month?: string };

const MONTH_RE = /^\d{4}-\d{2}$/;

export const metadata = { title: "Turn Schedules" };

export default async function TurnsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const today = new Date();
  const currentMonth = format(today, "yyyy-MM");

  const month = params.month && MONTH_RE.test(params.month) ? params.month : currentMonth;
  const siteId = params.site ?? undefined;

  // Resolve the exact month window.
  const [y, mo] = month.split("-").map(Number);
  const monthStart = new Date(Date.UTC(y, mo - 1, 1));
  const from = format(startOfMonth(monthStart), "yyyy-MM-dd");
  const to = format(endOfMonth(monthStart), "yyyy-MM-dd");
  const isoFrom = new Date(`${from}T00:00:00Z`);
  const isoTo = new Date(`${to}T00:00:00Z`);

  const sites = await db.site.findMany({ orderBy: { name: "asc" } });

  // Employees: all active (optionally scoped by site).
  const employees = await db.employee.findMany({
    where: {
      isActive: true,
      ...(siteId ? { siteId } : {}),
    },
    include: { defaultRole: true, site: true },
    orderBy: { fullName: "asc" },
  });

  // Existing manual turn rows for the visible window.
  const schedules = await db.employeeTurnSchedule.findMany({
    where: { date: { gte: isoFrom, lte: isoTo } },
    select: { employeeId: true, date: true, turn: true },
  });

  const days: TurnGridDay[] = [];
  for (let d = new Date(isoFrom); d <= isoTo; d = new Date(d.getTime() + 86400000)) {
    days.push({
      date: format(d, "yyyy-MM-dd"),
      dayOfMonth: d.getUTCDate(),
      weekday: "",
    });
  }

  const turns: TurnMap = {};
  for (const s of schedules) {
    const dateKey = format(s.date, "yyyy-MM-dd");
    if (!turns[s.employeeId]) turns[s.employeeId] = {};
    turns[s.employeeId][dateKey] = s.turn as "A" | "B";
  }

  // Turn read from the uploaded planilla (TURNO A/B sections) — the primary source.
  // It is shown as the default; the manual grid above it overrides day by day.
  const planillaEntries = await db.dailyCrewEntry.findMany({
    where: { date: { gte: isoFrom, lte: isoTo }, turnoAB: { not: null } },
    select: { rutNormalized: true, date: true, turnoAB: true },
  });
  const employeeIdByRut = new Map(
    employees.filter((e) => e.rut).map((e) => [normalizeRut(e.rut as string), e.id]),
  );
  const planillaTurns: TurnMap = {};
  let planillaTurnCount = 0;
  for (const p of planillaEntries) {
    if (p.turnoAB !== "A" && p.turnoAB !== "B") continue;
    const employeeId = employeeIdByRut.get(p.rutNormalized);
    if (!employeeId) continue;
    const dateKey = format(p.date, "yyyy-MM-dd");
    if (!planillaTurns[employeeId]) planillaTurns[employeeId] = {};
    planillaTurns[employeeId][dateKey] = p.turnoAB;
    planillaTurnCount++;
  }

  const gridEmployees: TurnGridEmployee[] = employees.map((e) => ({
    id: e.id,
    fullName: e.fullName,
    roleName: e.defaultRole?.name ?? null,
    siteName: e.site?.name ?? null,
  }));

  const prevMonth = format(addMonths(monthStart, -1), "yyyy-MM");
  const nextMonth = format(addMonths(monthStart, 1), "yyyy-MM");
  const monthLabel = format(monthStart, "MMMM yyyy");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Turn schedules (A/B)</h1>
          <p className="text-sm text-muted-foreground">
            Manually assign each employee&apos;s 14-day crew turn (A or B) per calendar day. Offsite /
            supervisor staff can be left blank. Click a cell to select; shift-click selects a range;
            a day header selects the whole column. These values are used by calculations when the
            planilla file doesn&apos;t carry a real turn.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <TurnNav
            sites={sites.map((s) => ({ id: s.id, name: s.name }))}
            siteId={siteId}
            month={month}
            prevMonth={prevMonth}
            nextMonth={nextMonth}
            monthLabel={monthLabel}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {monthLabel} — {gridEmployees.length} active employee(s)
          </CardTitle>
          <CardDescription>
            Turns are auto-filled from the uploaded planilla (dotted underline = from planilla) and can
            be edited per day. A manual value here overrides the planilla for that day. Green = Turn A,
            violet = Turn B. Select cells then use the toolbar to mark or clear.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
            <TurnGrid
              employees={gridEmployees}
              days={days}
              initialTurns={turns}
              planillaTurns={planillaTurns}
              siteId={siteId}
            />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}