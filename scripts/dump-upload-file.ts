import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { db } from "../src/lib/db";

/** Extracts the stored raw Excel bytes of uploads whose file name matches a pattern. */
async function main() {
  const pattern = process.argv[2] ?? "coipa";
  const outDir = process.argv[3] ?? "scripts/.tmp";
  await mkdir(outDir, { recursive: true });
  const uploads = await db.excelUpload.findMany({
    where: { fileName: { contains: pattern, mode: "insensitive" } },
    orderBy: { uploadedAt: "asc" },
  });
  for (const u of uploads) {
    if (!u.rawFile) {
      console.log(`SKIP (no rawFile) ${u.id} "${u.fileName}"`);
      continue;
    }
    const safe = u.fileName.replace(/[^\w.\-]+/g, "_");
    const out = `${outDir}/${u.id}_${safe}`;
    await writeFile(out, Buffer.from(u.rawFile));
    console.log(`WROTE ${out}  kind=${u.kind} status=${u.status} rows=${u.rowCount} sheets=${u.sheetCount} site=${u.siteId}`);
  }
}

main()
  .catch((e) => { console.error("FAILED:", e); process.exitCode = 1; })
  .finally(async () => { await db.$disconnect(); });