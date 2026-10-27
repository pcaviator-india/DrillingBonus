import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { formatTimeChile, formatDateUtc } from "@/lib/datetime";
import { normalizeText } from "@/lib/excel/normalize";
import { buildWorkeraImportCsv } from "@/lib/export/attendance-export";
import { csvContentDisposition } from "@/lib/csv";

type ExportParams = {
  from?: string;
  to?: string;
  employee?: string;
  role?: string;
  site?: string;
  department?: string;
  shift?: string;
  status?: string;
};

function parseDate(value: string | undefined, fallback: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? "") ? (value as string) : fallback;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const q = url.searchParams;
  const today = new Date();
  const from = parseDate(q.get("from") ?? undefined, format(startOfMonth(today), "yyyy-MM-dd"));
  const to = parseDate(q.get("to") ?? undefined, format(endOfMonth(today), "yyyy-MM-dd"));
  const isoFrom = new Date(`${from}T00:00:00Z`);
  const isoTo = new Date(`${to}T00:00:00Z`);

  const employeeId = q.get("employee");
  const shift = q.get("shift");
  const status = q.get("status");
  const role = q.get("role");
  const site = q.get("site");
  const department = q.get("department");

  const employeeFilter: Record<string, unknown> = {};
  if (role) employeeFilter.defaultRole = { name: role };
  if (site) employeeFilter.site = { name: site };
  if (department) employeeFilter.departmentName = department;

  const recordWhere = {
    date: { gte: isoFrom, lte: isoTo },
    ...(employeeId ? { employeeId } : {}),
    ...(shift ? { shift } : {}),
    ...(status ? { status } : {}),
    ...(Object.keys(employeeFilter).length ? { employee: employeeFilter } : {}),
  };

  const records = await db.attendanceRecord.findMany({
    where: recordWhere,
    orderBy: [{ date: "asc" }, { employeeId: "asc" }],
    include: { employee: { select: { id: true, fullName: true, rut: true } } },
  });

  const csv = buildWorkeraImportCsv(
    records.map((rec) => ({
      date: formatDateUtc(rec.date),
      employeeName: rec.employee.fullName,
      role: null,
      site: null,
      department: null,
      shift: rec.shift ?? null,
      timeIn: rec.timeIn ? formatTimeChile(rec.timeIn) : null,
      timeOut: rec.timeOut ? formatTimeChile(rec.timeOut) : null,
      hours: rec.hoursWorked,
      status: rec.status,
      corrected: rec.corrected,
      inDevice: rec.inDevice ?? null,
      outDevice: rec.outDevice ?? null,
      inOrigin: rec.inOrigin ?? null,
      inAddress: rec.inAddress ?? null,
      inCoordinates: rec.inCoordinates ?? null,
      rut: rec.employee.rut ?? null,
    })),
  );

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": csvContentDisposition("attendance_workera"),
    },
  });
}