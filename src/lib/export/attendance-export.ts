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
  rut?: string | null;
};

/**
 * Builds a CSV in Workera's import template format (semicolon-separated).
 *
 * Template columns:
 *   N° identificación (RUT);Tipo registro;Fecha/Hora ;Motivo
 *
 * Each attendance record produces one row for timeIn (ENTRADA) and one
 * for timeOut (SALIDA) when present.
 */
export function buildWorkeraImportCsv(rows: AttendanceExportRow[]): string {
  const headers = [
    "N° identificación (RUT)",
    "Tipo registro",
    "Fecha/Hora ",
    "Motivo",
  ];

  const data: string[][] = [];
  for (const r of rows) {
    if (!r.rut) continue;
    const dateStr = r.date; // YYYY-MM-DD
    const timeIn = r.timeIn; // HH:mm
    const timeOut = r.timeOut; // HH:mm

    if (timeIn) {
      data.push([
        r.rut,
        "ENTRADA",
        `${dateStr} ${timeIn}:00`,
        "",
      ]);
    }
    if (timeOut) {
      data.push([
        r.rut,
        "SALIDA",
        `${dateStr} ${timeOut}:00`,
        "",
      ]);
    }
  }

  // Workera template uses semicolon separator; toCsv uses comma, so build manually.
  const all = [headers, ...data];
  return all
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"))
    .join("\r\n");
}

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
