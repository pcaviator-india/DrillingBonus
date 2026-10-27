import { PrismaClient } from "@prisma/client";
import { normalizeText } from "../src/lib/excel/normalize";

const prisma = new PrismaClient();
const execute = process.argv.includes("--execute");

async function main() {
  const mv = await prisma.site.findFirstOrThrow({
    where: { name: { contains: "Mantoverde" } },
    include: { siteRigs: { select: { rigId: true } } },
  });
  const mvRigIds = new Set(mv.siteRigs.map((r) => r.rigId));
  const uploads = await prisma.excelUpload.findMany({
    orderBy: { uploadedAt: "asc" },
    include: {
      entries: { select: { projectName: true } },
      performances: { select: { rigId: true } },
    },
  });

  const keep = uploads.filter((upload) => {
    if (upload.kind === "planilla_diaria") {
      return upload.entries.length > 0 && upload.entries.every((e) => normalizeText(e.projectName ?? "").includes("MANTOVERDE"));
    }
    if (upload.kind === "rig_intervals") {
      return upload.performances.length > 0 && upload.performances.every((p) => mvRigIds.has(p.rigId));
    }
    return false;
  });
  const remove = uploads.filter((upload) => !keep.some((saved) => saved.id === upload.id));

  console.log(`${execute ? "EXECUTE" : "DRY RUN"}: Mantoverde site=${mv.name}`);
  console.log(`Keep ${keep.length} upload(s):`);
  for (const upload of keep) console.log(`  KEEP ${upload.fileName} (${upload.kind}, ${upload.rowCount} rows)`);
  console.log(`Remove ${remove.length} upload(s):`);
  for (const upload of remove) console.log(`  REMOVE ${upload.fileName} (${upload.kind}, ${upload.rowCount} rows)`);

  if (!execute) {
    console.log("No changes made. Run with --execute only after reviewing the list.");
    return;
  }

  const removeIds = remove.map((upload) => upload.id);
  await prisma.rigShiftPerformance.deleteMany({ where: { uploadId: { in: removeIds } } });
  for (const upload of remove) {
    if (upload.jobId) await prisma.job.delete({ where: { id: upload.jobId } }).catch(() => undefined);
    await prisma.excelUpload.delete({ where: { id: upload.id } });
  }

  const assignments = await prisma.crewAssignment.findMany({
    where: { source: "excel" },
    select: { id: true, rigId: true },
  });
  const staleAssignmentIds = assignments.filter((a) => !mvRigIds.has(a.rigId)).map((a) => a.id);
  if (staleAssignmentIds.length > 0) {
    await prisma.crewAssignment.deleteMany({ where: { id: { in: staleAssignmentIds } } });
  }

  await prisma.employeeWorkDay.deleteMany({
    where: { siteId: { not: null, notIn: [mv.id] } },
  });

  console.log(`Deleted ${remove.length} upload(s), ${staleAssignmentIds.length} non-Mantoverde Excel assignment(s), and stale non-Mantoverde workdays.`);
  console.log("Rebuild Work Days for the Mantoverde period after uploading any replacement files.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
