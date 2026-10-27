import type { WorkeraAttendance, WorkeraEmployee } from "./types";

/**
 * Mock Workera data – used only when WORKERA_MOCK=true.
 * Shapes mirror the real API (EmployeeFullData / AttendanceData).
 */
export function getMockEmployees(): WorkeraEmployee[] {
  const mk = (
    code: string,
    name: string,
    lastName: string,
    rut: string,
    branch: string,
    branchName: string,
    dept: string,
    deptName: string,
    jobPositionCode = "51",
    jobPositionName = "Perforista",
    costCenterCode = "01",
    costCenterName = "WORKSHOP",
  ): WorkeraEmployee => ({
    code,
    deviceCode: Number(code),
    identification: rut,
    name,
    lastName,
    branchOfficeCode: branch,
    branchOfficeName: branchName,
    departmentCode: dept,
    departmentName: deptName,
    employeeStatus: "ACTIVO",
    jobPositionCode,
    jobPositionName,
    costCenterCode,
    costCenterName,
    nationality: "Chile",
  });

  return [
    mk("wk-001", "Juan", "Perez", "11111111-1", "SITE-01", "Mina Norte", "PERF", "Perforacion", "51", "Perforista"),
    mk("wk-002", "Carlos", "Gomez", "22222222-2", "SITE-01", "Mina Norte", "PERF", "Perforacion", "18", "Ayudante de Perforista"),
    mk("wk-003", "Pedro", "Rojas", "33333333-3", "SITE-01", "Mina Norte", "OPS", "Operaciones", "22", "Chofer"),
    mk("wk-004", "Luis", "Soto", "44444444-4", "SITE-01", "Mina Norte", "OPS", "Operaciones", "62", "Supervisor de Operaciones"),
    mk("wk-005", "Ana", "Martinez", "55555555-5", "SITE-02", "Mina Sur", "PERF", "Perforacion", "51", "Perforista"),
  ];
}

export function getMockAttendance(from: string, to: string): WorkeraAttendance[] {
  const marks: WorkeraAttendance[] = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const employees = getMockEmployees();

  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86400000)) {
    const day = d.getUTCDay();
    if (day === 0 || day === 6) continue; // weekends off
    const iso = d.toISOString().slice(0, 10);
    for (const emp of employees) {
      const roll = (d.getUTCDate() + emp.code.length) % 10;
      if (roll === 3) continue; // absent – no marks that day
      const outH = roll === 7 ? 14 : 17;
      marks.push({
        employee: { code: emp.code, name: emp.name, lastName: emp.lastName },
        attendanceDate: `${iso}T08:00:00`,
        attendanceType: 0,
        attendanceStatus: "ACTIVO",
      });
      marks.push({
        employee: { code: emp.code, name: emp.name, lastName: emp.lastName },
        attendanceDate: `${iso}T${String(outH).padStart(2, "0")}:00:00`,
        attendanceType: 1,
        attendanceStatus: "ACTIVO",
      });
    }
  }
  return marks;
}
