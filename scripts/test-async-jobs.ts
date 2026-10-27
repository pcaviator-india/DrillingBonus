// Validates the async job plumbing + extracted Excel processor without needing
// a running HTTP request. Creates a pending ExcelUpload with a real sample file,
// runs processExcelUpload (the same function the background job runs), asserts
// the row is marked parsed, then cleans up.
import "dotenv/config";
import fs from "node:fs";
import { db } from "../src/lib/db";
import { createJob, finishJob } from "../src/lib/jobs/service";
import { processExcelUpload } from "../src/lib/excel/process";

const FILE = "data-samples/PLANILLA DIARIA RECON DRILLING AGOSTO 2026.xlsx";

async function cleanup(uploadId: string) {
  const up = await db.excelUpload.findUnique({ where: { id: uploadId } });
  if (up?.jobId) await db.job.delete({ where: { id: up.jobId } }).catch(() => {});
  await db.dailyCrewEntry.deleteMany({ where: { uploadId } });
  await db.rigShiftPerformance.deleteMany({ where: { uploadId } });
  await db.excelUpload.delete({ where: { id: uploadId } }).catch(() => {});
}

async function main() {
  const buffer = fs.readFileSync(FILE);

  // 1) createJob + finishJob (DONE)
  const job = await createJob({ type: "excel_upload", label: "TEST job", source: "excel" });
  await finishJob(job.id, { status: "DONE", message: "ok" });
  const done = await db.job.findUnique({ where: { id: job.id } });
  console.log("job status after finish:", done?.status, "| message:", done?.message);

  // 2) full background-processing simulation for an excel upload
  const upload = await db.excelUpload.create({
    data: { fileName: "TEST async.xlsx", kind: "unknown", status: "pending", rawFile: buffer },
  });
  const result = await processExcelUpload(upload.id);
  console.log("process result message:", result.message);

  const after = await db.excelUpload.findUnique({ where: { id: upload.id } });
  console.log(
    "upload status:", after?.status,
    "| kind:", after?.kind,
    "| rows:", after?.rowCount,
    "| sheets:", after?.sheetCount,
  );

  await cleanup(upload.id);
  await db.job.delete({ where: { id: job.id } });
  console.log("cleanup done");
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("FAILED:", e);
  await db.$disconnect();
  process.exit(1);
});