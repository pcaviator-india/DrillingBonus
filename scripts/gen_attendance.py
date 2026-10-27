import io

P1 = '''import { format, startOfMonth, endOfMonth } from "date-fns";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AttendanceFilters } from "./attendance-filters";

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  present: "secondary",
  absent: "destructive",
  late: "default",
  leave: "outline",
};

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) as {
    from?: string;
    to?: string;
    employee?: string;
    role?: string;
    site?: string;
    department?: string;
    shift?: string;
    status?: string;
  };
  const today = new Date();
  const from = params.from ?? format(startOfMonth(today), "yyyy-MM-dd");
  const to = params.to ?? format(endOfMonth(today), "yyyy-MM-dd");
  const isoFrom = new Date(from + "T00:00:00Z");
  const isoTo = new Date(to + "T00:00:00Z");

  const [employees, roles, sites, departments, shifts, statuses] = await Promise.all([
    db.employee.findMany({ where: { isActive: true }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" }, take: 1000 }),
    db.role.findMany({ orderBy: { name: "asc" } }),
    db.site.findMany({ orderBy: { name: "asc" } }),
    db.employee.findMany({ where: { departmentName: { not: null } }, select: { departmentName: true }, distinct: ["departmentName"], orderBy: { departmentName: "asc" } }),
    db.attendanceRecord.findMany({ where: { shift: { not: null } }, select: { shift: true }, distinct: ["shift"] }),
    db.attendanceRecord.findMany({ where: { status: { not: null } }, select: { status: true }, distinct: ["status"] }),
  ]);
'''
print("P1 ok", len(P1))