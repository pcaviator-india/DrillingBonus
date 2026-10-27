import { z } from "zod";

/**
 * Raw Workera API models, exactly as documented at
 * https://help.workera.com/documentacion-de-apis
 */

/** EmployeeFullData — response of GET /employee */
export const workeraEmployeeSchema = z.object({
  code: z.string(),
  deviceCode: z.number().nullable().optional(),
  identification: z.string().nullable().optional(),
  name: z.string(),
  secondName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  secondLastName: z.string().nullable().optional(),
  branchOfficeCode: z.string().nullable().optional(),
  branchOfficeName: z.string().nullable().optional(),
  departmentCode: z.string().nullable().optional(),
  departmentName: z.string().nullable().optional(),
  employeeStatus: z.string().default("ACTIVO"),
  genre: z.string().nullable().optional(),
  birthDate: z.string().nullable().optional(),
  civilStatus: z.string().nullable().optional(),
  // Extra fields the live API returns beyond the docs
  nationality: z.string().nullable().optional(),
  jobPositionCode: z.string().nullable().optional(),
  jobPositionName: z.string().nullable().optional(),
  costCenterCode: z.string().nullable().optional(),
  costCenterName: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  personalPhone: z.number().nullable().optional(),
  personalMail: z.string().nullable().optional(),
  corporatePhone: z.number().nullable().optional(),
  corporateMail: z.string().nullable().optional(),
  favorite: z.boolean().nullable().optional(),
  comment: z.string().nullable().optional(),
});
export type WorkeraEmployee = z.infer<typeof workeraEmployeeSchema>;

/** Pagination wrapper used by all list endpoints */
export const workeraListEnvelope = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    page: z.number(),
    // Live API uses `totalPages`; older docs/code used `totalPage`. Accept both.
    totalPages: z.number().optional(),
    totalPage: z.number().optional(),
    pageResult: z.number(),
    totalResult: z.number(),
    data: z.array(data),
  }).transform((v) => ({
    page: v.page,
    totalPages: v.totalPages ?? v.totalPage ?? 1,
    pageResult: v.pageResult,
    totalResult: v.totalResult,
    data: v.data,
  }));

/** Job position (cargo) — response of GET /jobPosition (undocumented but live) */
export const workeraJobPositionSchema = z.object({
  name: z.string(),
  code: z.string().nullable().optional(),
  id: z.number().optional(),
  status: z.string().optional(),
  employeesCount: z.number().optional(),
});
export type WorkeraJobPosition = z.infer<typeof workeraJobPositionSchema>;

// --- Branch offices & departments (for scope discovery/selection UI) ---

/** Tolerant row schema: /branchOffice and /department list items */
export const orgUnitRow = z.object({
  code: z.string(),
  name: z.string().nullable().optional(),
}).passthrough();

export const workeraOrgUnitSchema = orgUnitRow;
export type WorkeraOrgUnit = z.infer<typeof orgUnitRow>;

export function parseOrgUnitList(json: unknown): WorkeraOrgUnit[] {
  // Response may be a plain array or the standard pagination envelope
  if (Array.isArray(json)) return z.array(orgUnitRow).parse(json);
  return workeraListEnvelope(orgUnitRow).parse(json).data;
}

export const workeraAttendanceSchema = z.object({
  employee: z.object({
    code: z.string(),
    identification: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
    lastName: z.string().nullable().optional(),
    branchOffice: z.string().nullable().optional(),
    department: z.string().nullable().optional(),
    employeeStatus: z.string().nullable().optional(),
  }),
  attendanceDate: z.string(), // yyyy-MM-ddTHH:mm:ss
  attendanceType: z.number(), // 0 entrada, 1 salida, 2 salida ext, 3 entrada ext, 4/5 descanso
  attendanceStatus: z.string().nullable().optional(),
  origin: z.string().nullable().optional(),
  deviceName: z.string().nullable().optional(),
  isMobile: z.boolean().nullable().optional(),
  // Mark details for site attribution (live API returns these beyond docs)
  address: z.string().nullable().optional(),
  checksum: z.string().nullable().optional(),
  coordinatesMobile: z.string().nullable().optional(),
  precisionMobile: z.number().nullable().optional(),
});
export type WorkeraAttendance = z.infer<typeof workeraAttendanceSchema>;

