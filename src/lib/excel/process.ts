import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { detectWorkbookKind } from "./detect-kind";
import { parsePlanillaDiaria } from "./planilla-diaria";
import { parseRigIntervals } from "./rig-intervals";
import { normalizeText, normalizeRigKey, normalizeRut, rigKeyOf } from "./normalize";
import { ensureGroupsSeeded, ensureMainPositionsSeeded, registerCargosFromExcel } from "@/lib/positions/registry";
import { ensureRigAliasesSeeded } from "@/lib/matching/rig-aliases";
import { flagPerformanceSiteConflicts } from "@/lib/rigs/site-evidence";

export type ProcessResult = {
  message: string;
  revalidatePaths: string[];
};

/**
 * Parses an uploaded Excel file in the background and persists its normalized
 * rows. Updates ExcelUpload.status along the way so the uploads page and the
 * bottom bubble can reflect progress.
 */
export async function processExcelUpload(uploadId: string): Promise<ProcessResult> {
  const upload = await db.excelUpload.findUnique({ where: { id: uploadId } });
  if (!upload) throw new Error("Upload record not found.");
  if (!upload.rawFile) throw new Error("Uploaded file content is missing — re-upload the file.");

  await db.excelUpload.update({ where: { id: uploadId }, data: { status: "processing" } });

  // On retries, drop any rows previously written for this upload so we don't duplicate.
  await db.dailyCrewEntry.deleteMany({ where: { uploadId } });

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(upload.rawFile as unknown as ExcelJS.Buffer);
  } catch {
    throw new Error("Could not read the file as .xlsx");
  }

  const kind = detectWorkbookKind(wb);
  if (kind === "unknown") {
    const summary =
      "Unrecognized file format: expected a Planilla Diaria (RUT header per day sheet) or a Drilling Intervals report (Date/Hole/Shift per rig sheet)";
    await db.excelUpload.update({
      where: { id: uploadId },
      data: { status: "error", kind: "unknown", errorSummary: summary },
    });
    throw new Error(summary);
  }

  let rowCount = 0;
  let sheetCount = 0;
  let dataSnapshot: unknown = null;
  const warnings: string[] = [];

  if (kind === "planilla_diaria") {
    const parsed = parsePlanillaDiaria(wb);
    sheetCount = parsed.sheets.length;
    rowCount = parsed.sheets.reduce((n, s) => n + s.entries.length, 0);
    parsed.sheets.forEach((s) => warnings.push(...s.warnings));
    dataSnapshot = parsed;
    const projects = [...new Set(parsed.sheets.map((sheet) => normalizeText(sheet.projectName ?? "")).filter(Boolean))];
    if (projects.length === 1 && !upload.siteId) {
      const alias = await db.siteAlias.findUnique({ where: { normalized: projects[0] } });
      if (alias) await db.excelUpload.update({ where: { id: uploadId }, data: { siteId: alias.siteId } });
    }
  } else {
    const parsed = parseRigIntervals(wb);
    sheetCount = parsed.sheets.length;
    rowCount = parsed.sheets.reduce((n, s) => n + s.rows.length, 0);
    parsed.sheets.forEach((s) => warnings.push(...s.warnings));
    dataSnapshot = parsed;
  }

  if (rowCount === 0) {
    const summary = `File parsed but no data rows found: ${warnings[0] ?? "empty workbook"}`;
    await db.excelUpload.update({
      where: { id: uploadId },
      data: { status: "error", kind, errorSummary: summary },
    });
    throw new Error(summary);
  }

  await db.excelUpload.update({
    where: { id: uploadId },
    data: {
      kind,
      status: "parsed",
      rowCount,
      sheetCount,
      errorSummary: warnings.length ? warnings.join(" | ") : null,
      dataSnapshot: JSON.parse(JSON.stringify(dataSnapshot)) as Prisma.InputJsonValue,
    },
  });

  if (kind === "planilla_diaria") {
    const parsed = dataSnapshot as ReturnType<typeof parsePlanillaDiaria>;

    // Collect distinct machines across all sheets so we can ensure a Rig row exists
    // for each one. Machines and rigs are the same concept here; the admin assigns
    // them to sites later on /sites.
    const machineSet = new Map<string, { name: string; code: string | null }>();
    for (const sheet of parsed.sheets) {
      for (const e of sheet.entries) {
        if (!e.machine) continue;
        const key = normalizeText(e.machine);
        if (!machineSet.has(key)) {
          machineSet.set(key, {
            name: e.machine.trim(),
            code: e.orderNumber != null ? String(e.orderNumber) : null,
          });
        }
      }
    }
    await ensureRigAliasesSeeded();
    const existingRigs = await db.rig.findMany({ select: { id: true, name: true, code: true } });
    const rigAliases = await db.rigAlias.findMany({ select: { normalized: true, rigId: true } });
    const rigByMachine = new Map(rigAliases.map((a) => [rigKeyOf(a.normalized), a.rigId]));
    for (const rig of existingRigs) rigByMachine.set(rigKeyOf(rig.name), rig.id);
    for (const machine of machineSet.values()) {
      if (rigByMachine.has(rigKeyOf(machine.name))) continue;
      // The planilla order number identifies the worker row, not the machine.
      // Use the normalized machine name so every spelling maps to one rig.
      const code = `rig:${normalizeRigKey(machine.name)}`;
      await db.rig.upsert({
        where: { code },
        create: { name: machine.name, code },
        update: { name: machine.name },
      });
    }
    await ensureRigAliasesSeeded();

    const entryRows = parsed.sheets.flatMap((sheet) => sheet.entries);
    // The source may contain repeated identical rows inside one sheet (for
    // example copied blocks). Persist them in one PostgreSQL statement with
    // skipDuplicates; the old create-loop aborted at the first duplicate and
    // left the upload only partially persisted.
    await db.dailyCrewEntry.createMany({
      data: entryRows.map((e) => ({
        uploadId,
        sheetName: e.sheetName,
        date: new Date(e.date),
        projectName: e.projectName,
        orderNumber: e.orderNumber,
        rut: e.rut,
        rutNormalized: e.rutNormalized,
        fullName: e.fullName,
        cargoRaw: e.cargoRaw,
        cargoNormalized: e.cargoNormalized,
        machine: e.machine,
        diameter: e.diameter,
        escala: e.escala,
        metros: e.metros,
        horasExtras: e.horasExtras,
        workeraMarkedIn: e.workeraMarkedIn,
        workeraMarkedOut: e.workeraMarkedOut,
        motivoHorasExtra: e.motivoHorasExtra,
        asistencia: e.asistencia,
        asistenciaRaw: e.asistenciaRaw,
        shiftDayNight: e.shiftDayNight,
        turnoAB: e.turnoAB,
        rawData: JSON.parse(JSON.stringify(e.rawData)) as Prisma.InputJsonValue,
      })),
      skipDuplicates: true,
    });

    // Ensure people present in this upload are registered before matching crew
    // assignments. Otherwise valid Planilla rows with an employee master gap are
    // persisted but silently discarded below when employeeByRut cannot resolve
    // their RUT. This is generic for every site, not a site-specific workaround.
    const uploadSiteId = (await db.excelUpload.findUnique({ where: { id: uploadId }, select: { siteId: true } }))?.siteId ?? null;
    const existingPeople = await db.employee.findMany({ where: { rut: { not: null } }, select: { rut: true } });
    const knownRuts = new Set(existingPeople.map((employee) => normalizeRut(employee.rut as string)));
    const entriesForIdentity = await db.dailyCrewEntry.findMany({
      where: { uploadId },
      select: { rut: true, rutNormalized: true, fullName: true, cargoRaw: true },
    });
    for (const entry of entriesForIdentity) {
      if (knownRuts.has(entry.rutNormalized) || !entry.fullName.trim()) continue;
      await db.employee.create({
        data: {
          fullName: entry.fullName.trim(),
          rut: entry.rutNormalized,
          siteId: uploadSiteId,
          jobPositionName: entry.cargoRaw?.trim() || null,
        },
      });
      knownRuts.add(entry.rutNormalized);
    }

    // Create CrewAssignment records so calculations can use the planilla data.
    // Match employees by RUT and rigs by machine name (via RigAlias).
    // Resolve cargo names to main positions for consistency.
    const employees = await db.employee.findMany({ select: { id: true, rut: true } });
    const employeeByRut = new Map(
      employees.filter((e) => e.rut).map((e) => [normalizeRut(e.rut as string), e.id]),
    );
    // Load position aliases + main positions for role resolution
    const positionAliases = await db.positionAlias.findMany({
      select: { normalized: true, mainPositionId: true },
    });
    const mainPositions = await db.mainPosition.findMany({ select: { id: true, name: true } });
    const mainPosNameById = new Map(mainPositions.map((m) => [m.id, m.name]));
    const mainPosByCargo = new Map(
      positionAliases
        .filter((a) => a.mainPositionId)
        .map((a) => [a.normalized, mainPosNameById.get(a.mainPositionId!) ?? null]),
    );

    const resolveRole = (cargoNormalized: string): string => {
      if (!cargoNormalized) return "";
      const mainName = mainPosByCargo.get(cargoNormalized);
      return mainName ?? cargoNormalized;
    };

    // Resolve the per-upload site once (same for all entries in this upload),
    // then fall back to project-name → site alias inference. This is the
    // per-upload rig→site declaration that replaces the static Rig.siteId.
    // `uploadSiteId` is already declared above in this planilla block.
    const siteAliases = await db.siteAlias.findMany({ select: { normalized: true, siteId: true } });
    const siteByProject = new Map(siteAliases.map((a) => [a.normalized, a.siteId]));

    let assignmentsCreated = 0;
    const entriesForAssignment = await db.dailyCrewEntry.findMany({ where: { uploadId } });
    for (const entry of entriesForAssignment) {
      const employeeId = employeeByRut.get(entry.rutNormalized);
      const rigId = entry.machine ? rigByMachine.get(rigKeyOf(entry.machine)) : null;
      if (!employeeId || !rigId) continue;
      const shift = entry.shiftDayNight === "night" ? "night" : "day";
      const roleOnShift = resolveRole(entry.cargoNormalized);
      // Site: upload-declared site first, else project-name alias inference.
      const siteId =
        uploadSiteId ??
        (entry.projectName ? siteByProject.get(normalizeText(entry.projectName)) : undefined) ??
        null;
      const existing = await db.crewAssignment.findFirst({
        where: { employeeId, rigId, date: entry.date, shift },
      });
      if (existing) {
        await db.crewAssignment.update({
          where: { id: existing.id },
          data: {
            roleOnShift,
            source: "excel",
            siteId,
            siteEvidence: uploadSiteId ? "upload" : siteId ? "planilla" : null,
          },
        });
      } else {
        await db.crewAssignment.create({
          data: {
            employeeId,
            rigId,
            date: entry.date,
            shift,
            roleOnShift,
            siteId,
            siteEvidence: uploadSiteId ? "upload" : siteId ? "planilla" : null,
            source: "excel",
            rawData: { dailyCrewEntryId: entry.id } as object,
          },
        });
      }
      assignmentsCreated++;
    }
    if (assignmentsCreated > 0) {
      warnings.push(`Created ${assignmentsCreated} crew assignment(s) from planilla`);
    }

    await ensureGroupsSeeded();
    await ensureMainPositionsSeeded();
    const newAliases = await registerCargosFromExcel();
    if (newAliases > 0) {
      await db.excelUpload.update({
        where: { id: uploadId },
        data: { positionAliasesPending: newAliases },
      });
    }
  } else {
    const parsed = dataSnapshot as ReturnType<typeof parseRigIntervals>;

    // Resolve the per-shift site BEFORE writing performances, this is a
    // historical fact per (rig, date, shift): the upload's site when chosen,
    // otherwise the rigs' shared current site (legacy inference). A rig moving
    // sites later must never rewrite these rows.
    const uploadSiteId =
      (await db.excelUpload.findUnique({ where: { id: uploadId }, select: { siteId: true } }))
        ?.siteId ?? null;
    const rigNames = [...new Set(parsed.sheets.flatMap((sheet) => sheet.rows.map((row) => row.rigName)))];
    const candidateRigs = await db.rig.findMany({
      where: { name: { in: rigNames } },
      select: { name: true, siteId: true },
    });
    const inferredSiteIds = [
      ...new Set(candidateRigs.map((r) => r.siteId).filter((s): s is string => Boolean(s))),
    ];
    const inferredSiteId =
      inferredSiteIds.length === 1 && candidateRigs.length === rigNames.length
        ? inferredSiteIds[0]
        : null;
    const resolvedSiteId = uploadSiteId ?? inferredSiteId;
    const siteEvidence = uploadSiteId ? "upload" : resolvedSiteId ? "rig-current" : null;
    if (!uploadSiteId && inferredSiteId) {
      await db.excelUpload.update({ where: { id: uploadId }, data: { siteId: inferredSiteId } });
    }

    for (const sheet of parsed.sheets) {
      for (const row of sheet.rows) {
        // find or create rig by name within the report
        // Use normalized code so "740-07" and "740-7" map to the same rig
        const code = `rig:${normalizeRigKey(row.rigName)}`;
        const rig = await db.rig.upsert({
          where: { code },
          create: { name: row.rigName, code, siteId: resolvedSiteId },
          update: { name: row.rigName },
        });
        await db.rigShiftPerformance.upsert({
          where: {
            rigId_date_shift: { rigId: rig.id, date: new Date(row.date), shift: row.shift },
          },
          create: {
            rigId: rig.id,
            uploadId,
            date: new Date(row.date),
            shift: row.shift,
            hole: row.hole,
            metersDrilled: row.metersDrilled ?? 0,
            hoursSpent: row.hoursSpent,
            intervals: JSON.parse(JSON.stringify(row.intervals)) as Prisma.InputJsonValue,
            rawData: { ...row.rawData, drillingHours: row.drillingHours },
            siteId: resolvedSiteId,
            siteEvidence,
          },
          update: {
            uploadId,
            hole: row.hole,
            metersDrilled: row.metersDrilled ?? 0,
            hoursSpent: row.hoursSpent,
            intervals: JSON.parse(JSON.stringify(row.intervals)) as Prisma.InputJsonValue,
            rawData: { ...row.rawData, drillingHours: row.drillingHours },
            siteId: resolvedSiteId,
            siteEvidence,
            // Re-upload of the same file re-seeds the evidence; clear any stale
            // conflict flag so it is re-evaluated by the cross-check below.
            siteConflict: false,
          },
        });
      }
    }

    // Planilla cross-check: crew entries of the same rig/date may carry a
    // projectName whose site alias resolves to a DIFFERENT site than the one
    // we just stamped. Flag (never auto-fix) so a human reviews before running
    // calculations — this catches rigs quietly moving between sites.
    const shiftKeys = parsed.sheets.flatMap((sheet) =>
      sheet.rows.map((row) => row.date).filter(Boolean),
    );
    const minDate = shiftKeys.length
      ? new Date(shiftKeys.reduce((a, b) => (a < b ? a : b)))
      : null;
    const maxDate = shiftKeys.length
      ? new Date(shiftKeys.reduce((a, b) => (a > b ? a : b)))
      : null;
    if (minDate && maxDate) {
      const conflicted = await flagPerformanceSiteConflicts(minDate, maxDate);
      if (conflicted > 0) {
        warnings.push(
          `${conflicted} rig shift(s) show planilla crew evidence pointing at a different site — review before running calculations`,
        );
      }
    }
  }

  const kindLabel = kind === "planilla_diaria" ? "Planilla Diaria" : "Rig Intervals";
  return {
    message: `Parsed "${upload.fileName}" (${kindLabel}): ${sheetCount} sheet(s), ${rowCount} row(s)${
      warnings.length ? ` — ${warnings.length} warning(s)` : ""
    }`,
    revalidatePaths: ["/uploads", "/positions"],
  };
}