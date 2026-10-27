import { Suspense } from "react";
import Link from "next/link";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { formatTimeChile, formatDateUtc, formatDateTimeChile } from "@/lib/datetime";
import { db } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AttendanceFilters } from "./attendance-filters";
import { PaginationControls } from "./pagination-controls";
import { AttendanceTable, type AttendanceRow } from "./attendance-table";
import { normalizeText } from "@/lib/excel/normalize";

type SearchParams = {
  from?: string;
  to?: string;
  employee?: string;
  role?: string;
  site?: string;
  department?: string;
  shift?: string;
  status?: string;
  needsReview?: string;
  page?: string;
  perPage?: string;
};

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = (await searchParams) as SearchParams;
  const today = new Date();
  const from = params.from ?? format(startOfMonth(today), "yyyy-MM-dd");
  const to = params.to ?? format(endOfMonth(today), "yyyy-MM-dd");
  const isoFrom = new Date(`${from}T00:00:00Z`);
  const isoTo = new Date(`${to}T00:00:00Z`);

  const [
    employees,
    roles,
    sites,
    departments,
    distinctShifts,
    distinctStatuses,
    needsReviewAgg,
    correctedAgg,
    missingPunchAgg,
  ] = await Promise.all([
      db.employee.findMany({
        where: { isActive: true },
        select: { id: true, fullName: true },
        orderBy: { fullName: "asc" },
        take: 1000,
      }),
      db.role.findMany({ orderBy: { name: "asc" } }),
      db.site.findMany({ orderBy: { name: "asc" } }),
      db.employee.findMany({
        where: { departmentName: { not: null } },
        select: { departmentName: true },
        distinct: ["departmentName"],
        orderBy: { departmentName: "asc" },
      }),
      db.attendanceRecord.findMany({
        where: { shift: { not: undefined } },
        select: { shift: true },
        distinct: ["shift"],
      }),
      db.attendanceRecord.findMany({
        where: { status: { not: undefined } },
        select: { status: true },
        distinct: ["status"],
      }),
      db.attendanceRecord.aggregate({
        where: { needsReview: true },
        _count: { id: true },
      }),
      db.attendanceRecord.aggregate({
        where: { corrected: true },
        _count: { id: true },
      }),
      db.attendanceRecord.aggregate({
        where: { timeIn: null, timeOut: null },
        _count: { id: true },
      }),
    ]);

  const [needsReviewCount, correctedCount, missingPunchCount] = [
    needsReviewAgg._count.id,
    correctedAgg._count.id,
    missingPunchAgg._count.id,
  ];

  const employeeFilter: Record<string, unknown> = {};
  if (params.role) employeeFilter.defaultRole = { name: params.role };
  if (params.site) employeeFilter.site = { name: params.site };
  if (params.department) employeeFilter.departmentName = params.department;

  const recordWhere = {
    date: { gte: isoFrom, lte: isoTo },
    ...(params.employee ? { employeeId: params.employee } : {}),
    ...(params.shift ? { shift: params.shift } : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(params.needsReview === "true" ? { needsReview: true } : {}),
    ...(Object.keys(employeeFilter).length ? { employee: employeeFilter } : {}),
  };

  const perPageOptions = [25, 50, 100] as const;
  const perPage = perPageOptions.includes(Number(params.perPage) as (typeof perPageOptions)[number])
    ? Number(params.perPage)
    : 50;
  const totalRecords = await db.attendanceRecord.count({ where: recordWhere });
  const totalPages = Math.max(1, Math.ceil(totalRecords / perPage));
  const page = Math.min(Math.max(1, Number(params.page) || 1), totalPages);

  // Load position aliases for role → main position resolution
  const positionAliases = await db.positionAlias.findMany({
    select: { normalized: true, mainPositionId: true },
  });
  const mainPositions = await db.mainPosition.findMany({ select: { id: true, name: true } });
  const mainPosNameById = new Map(mainPositions.map((m) => [m.id, m.name]));
  const mainPosByRole = new Map(
    positionAliases
      .filter((a) => a.mainPositionId)
      .map((a) => [a.normalized, mainPosNameById.get(a.mainPositionId!) ?? null]),
  );
  const resolveRole = (roleName: string | null): string | null => {
    if (!roleName) return null;
    return mainPosByRole.get(normalizeText(roleName)) ?? roleName;
  };

  const records = await db.attendanceRecord.findMany({
    where: recordWhere,
    orderBy: [{ date: "asc" }, { employeeId: "asc" }],
    include: { employee: { include: { defaultRole: true, site: true } } },
    skip: (page - 1) * perPage,
    take: perPage,
  });

  const rows: AttendanceRow[] = records.map((rec) => ({
    id: rec.id,
    date: formatDateUtc(rec.date),
    employeeName: rec.employee.fullName,
    role: resolveRole(rec.employee.defaultRole?.name ?? null),
    site: rec.employee.site?.name ?? null,
    department: rec.employee.departmentName ?? null,
    shift: rec.shift ?? null,
    timeIn: rec.timeIn ? formatTimeChile(rec.timeIn) : null,
    timeOut: rec.timeOut ? formatTimeChile(rec.timeOut) : null,
    hours: rec.hoursWorked,
    status: rec.status,
    corrected: rec.corrected,
    needsReview: rec.needsReview,
    correctedById: rec.correctedById ?? null,
    correctedAt: rec.correctedAt ? formatDateTimeChile(rec.correctedAt) : null,
    correctionReason: rec.correctionReason ?? null,
    originalTimeIn: rec.originalTimeIn ? formatTimeChile(rec.originalTimeIn) : null,
    originalTimeOut: rec.originalTimeOut ? formatTimeChile(rec.originalTimeOut) : null,
    reviewStatus: rec.reviewStatus ?? null,
    reviewNote: rec.reviewNote ?? null,
    inDevice: rec.inDevice ?? null,
    employeeWorkeraId: rec.employee.workeraId ?? null,
    outDevice: rec.outDevice ?? null,
    inOrigin: rec.inOrigin ?? null,
    inAddress: rec.inAddress ?? null,
    inCoordinates: rec.inCoordinates ?? null,
  }));

  // Build query string for the CSV export link (carries all current filters).
  const exportQuery = new URLSearchParams();
  exportQuery.set("from", from);
  exportQuery.set("to", to);
  if (params.employee) exportQuery.set("employee", params.employee);
  if (params.role) exportQuery.set("role", params.role);
  if (params.site) exportQuery.set("site", params.site);
  if (params.department) exportQuery.set("department", params.department);
  if (params.shift) exportQuery.set("shift", params.shift);
  if (params.status) exportQuery.set("status", params.status);
  if (params.needsReview) exportQuery.set("needsReview", params.needsReview);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Attendance</h1>
          <p className="text-sm text-muted-foreground">
            Daily attendance records from Workera, joined with crew/rig data.
          </p>
        </div>
        <Link href={`/api/attendance/export?${exportQuery.toString()}`} prefetch={false}>
          <Button variant="outline">Export CSV</Button>
        </Link>
      </div>

      <Suspense
        fallback={
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Loading filters…
            </CardContent>
          </Card>
        }
      >
        <AttendanceFilters
          employees={employees}
          roles={roles.map((r) => r.name)}
          sites={sites.map((s) => s.name)}
          departments={departments.map((d) => d.departmentName ?? "").filter(Boolean)}
          shifts={distinctShifts.map((s) => s.shift ?? "").filter(Boolean)}
          statuses={distinctStatuses.map((s) => s.status ?? "").filter(Boolean)}
          defaultFrom={from}
          defaultTo={to}
          currentParams={params}
        />
      </Suspense>

      {/* Review summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-3 px-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-amber-900">Needs review</span>
              <span className="text-xl font-bold text-amber-900">{needsReviewCount}</span>
            </div>
            <p className="mt-1 text-xs text-amber-700">
              Records flagged during sync (missing punches, duplicates removed)
            </p>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="py-3 px-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-blue-900">Previously corrected</span>
              <span className="text-xl font-bold text-blue-900">{correctedCount}</span>
            </div>
            <p className="mt-1 text-xs text-blue-700">
              Records with duplicate/mis-ordered marks cleaned during sync
            </p>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3 px-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-red-900">Missing both punches</span>
              <span className="text-xl font-bold text-red-900">{missingPunchCount}</span>
            </div>
            <p className="mt-1 text-xs text-red-700">
              Records with no clock-in and no clock-out
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Records</CardTitle>
          <CardDescription>
            {totalRecords} record(s) found — showing page {page} of {totalPages}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AttendanceTable rows={rows} />

          <div className="mt-4">
            <PaginationControls
              page={page}
              totalPages={totalPages}
              perPage={perPage}
              perPageOptions={[...perPageOptions]}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

