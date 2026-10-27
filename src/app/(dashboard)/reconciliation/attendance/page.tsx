import { format } from "date-fns";
import Link from "next/link";
import { db } from "@/lib/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { loadAttendanceReconciliation } from "@/lib/reconciliation";
import { ReconciliationFilters } from "../reconciliation-filters";
import { AttendanceMatchTable } from "./attendance-match-table";

type SearchParams = { from?: string; to?: string; site?: string };

export default async function AttendanceReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const today = new Date();
  // Same default period as the reports page: the previous month.
  const lastMonthFirst = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthLast = new Date(today.getFullYear(), today.getMonth(), 0);
  const from = params.from ?? format(lastMonthFirst, "yyyy-MM-dd");
  const to = params.to ?? format(lastMonthLast, "yyyy-MM-dd");
  const invalidRange = from > to;

  // Build query string for the CSV export link (carries all current filters).
  const exportQuery = new URLSearchParams();
  exportQuery.set("from", from);
  exportQuery.set("to", to);
  if (params.site) exportQuery.set("site", params.site);

  const [sites, view] = await Promise.all([
    db.site.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    loadAttendanceReconciliation({ from, to, siteId: params.site || null }),
  ]);

  const s = view.summary;
  const summaryCards = [
    {
      label: "Matched",
      value: s.matched,
      tone: "text-green-600",
      hint: "Planilla row with a present Workera attendance record",
    },
    {
      label: "Workera absent",
      value: s.workeraAbsent,
      tone: "text-red-600",
      hint: "Workera marks the day absent while the planilla recorded work",
    },
    {
      label: "Planilla only",
      value: s.planillaOnly,
      tone: "text-amber-600",
      hint: `Rows with no Workera record at all (${s.planillaOnlyClaimsMark} of them claim a Workera mark in the sheet)`,
    },
    {
      label: "Workera only",
      value: s.workeraOnly,
      tone: "text-blue-600",
      hint: "Attendance records with no planilla row for that employee and day",
    },
    {
      label: "Conflicts",
      value: s.saysNoButPresent + s.planillaOnlyClaimsMark,
      tone: "text-amber-600",
      hint: "Sheet says No while a record exists, or says marked with no Workera record",
    },
    {
      label: "Unmatched RUT",
      value: s.unmatchedRut,
      tone: "text-red-600",
      hint: "Planilla RUT that matches no employee — blocks every other match",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Attendance matching</h1>
          <p className="text-sm text-muted-foreground">
            Workera attendance against the Planilla Diaria attendance for the same employee and day.
            The sheet&apos;s own &ldquo;workera entrada / salida&rdquo; columns are compared with the real
            attendance record, so days the sheet claims but Workera never recorded (or vice versa) are
            visible. One row per employee per day; a day with both a day and a night block is flagged
            because Workera stores a single attendance row per day.
          </p>
        </div>
        <Link
          href={`/api/reconciliation/attendance/export?${exportQuery.toString()}`}
          prefetch={false}
        >
          <Button variant="outline">Export CSV</Button>
        </Link>
      </div>

      {invalidRange ? (
        <Card className="border-destructive">
          <CardContent className="py-4 text-sm text-destructive">
            &ldquo;From&rdquo; is after &ldquo;To&rdquo; — pick a valid period.
          </CardContent>
        </Card>
      ) : null}

      {view.truncated ? (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardContent className="py-4 text-sm">
            Large period: only the first {view.summary.planillaRows.toLocaleString()} planilla rows were
            loaded. Narrow the range or pick a site for the full picture.
          </CardContent>
        </Card>
      ) : null}

      <ReconciliationFilters
        sites={sites}
        defaultFrom={from}
        defaultTo={to}
        showTolerance={false}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {summaryCards.map((card) => (
          <Card key={card.label} className="py-2" title={card.hint}>
            <CardContent className="flex items-baseline justify-between gap-2 px-3">
              <span className="text-xs font-medium text-muted-foreground">{card.label}</span>
              <span className={`text-lg font-bold ${card.tone}`}>{card.value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Attendance detail</CardTitle>
          <CardDescription>
            {s.planillaRows.toLocaleString()} planilla row(s) → {s.employeeDays.toLocaleString()}{" "}
            employee-day(s) compared{params.site ? " (site filter applied)" : ""}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AttendanceMatchTable rows={view.rows} />
        </CardContent>
      </Card>
    </div>
  );
}