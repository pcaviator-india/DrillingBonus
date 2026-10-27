import { toCsv } from "@/lib/csv";

/**
 * CSV builder for the attendance page export.
 * Pure functions over already-loaded DB rows – no DB access here.
 */

export type AttendanceExportRow = {
  date: string;
  employeeName: string;
  role: string | null;
  site: string | null;
  department: string | null;
  shift: string | null;
  timeIn: string | null;
  timeOut: string | null;
  hours: number | null;
  status: string;
  corrected: boolean;
  inDevice: string | null;
  outDevice: string | null;
  inOrigin: string | null;
  inAddress: string | null;
  inCoordinates: string | null;
};

export function buildAttendanceCsv(rows: AttendanceExportRow[]): string {
  const headers = [
    "Date",
    "Employee",
    "Role (Cargo)",
    "Site",
    "Department",
    "Shift",
    "Time in",
    "Time out",
    "Hours",
    "Status",
    "Corrected",
    "Clock-in device",
    "Clock-out device",
    "Origin",
    "Location",
    "GPS coords",
  ];
  const data = rows.map((r) => [
    r.date,
    r.employeeName,
    r.role ?? "",
    r.site ?? "",
    r.department ?? "",
    r.shift ?? "",
    r.timeIn ?? "",
    r.timeOut ?? "",
    r.hours ?? "",
    r.status,
    r.corrected ? "yes" : "no",
    r.inDevice ?? "",
    r.outDevice ?? "",
    r.inOrigin ?? "",
    r.inAddress ?? "",
    r.inCoordinates ?? "",
  ]);
  return toCsv(headers, data);
}
