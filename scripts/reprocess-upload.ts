import "dotenv/config";
import { db } from "../src/lib/db";
import { processExcelUpload } from "../src/lib/excel/process";
import { rebuildWorkDays } from "../src/lib/matching";

/**
 * Re-parses stored uploads with the CURRENT parser (fixes rows parsed before a
 * parser fix) and then rebuilds the EmployeeWorkDay table for the given period.
 *
 * Usage: npx tsx scripts/reprocess-upload.ts <uploadId|name-pattern> [from] [to]
 */
async function main() {
  const key = process.argv[2];
  const from = process.argv[3] ?? "2026-08-01";
  const to = process.argv[4] ?? "2026-08-31";
  if (!key) throw new Error("Provide an upload id or file-name pattern");

  const uploads = await db.excelUpload.findMany({
    where: key.length < 6
      ? { fileName: { contains: key, mode: "insensitive" } }
      : { OR: [{ id: key }, { fileName: { contains: key, mode: "insensitive" } }] },
  });
  for (const u of uploads) {
    console.log(`Reprocessing "${u.fileName}" (${u.id})...`);
    const res = await processExcelUpload(u.id);
    console.log("  ->", res.message);
  }
  console.log("Rebuilding work days", from, "..", to, "...");
  const r = await rebuildWorkDays(from, to);
  console.log("done:", JSON.stringify(r.flagged), "workDays:", r.workDays);
}

main()
  .catch((e) => { console.error("FAILED:", e); process.exitCode = 1; })
  .finally(async () => { await db.$disconnect(); });
