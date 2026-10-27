/**
 * One-time backfill for RigShiftPerformance.siteId (rig-site history fix).
 *
 * For each performance row with siteId null:
 *   1. upload.siteId (the site chosen at upload time) → evidence "upload"
 *   2. else rig.siteId (rig never moved OK; moved rigs need review) → "rig-current"
 *
 * Then runs the planilla cross-check over ALL performances and prints every
 * conflict (stamped site vs planilla crew site) for human review.
 *
 * Idempotent. Usage:  npx tsx scripts/backfill-perf-sites.ts
 */
import "dotenv/config";
import { db } from "../src/lib/db";
import { flagPerformanceSiteConflicts, listPerformanceSiteConflicts } from "../src/lib/rigs/site-evidence";

async function main() {
  const missing = await db.rigShiftPerformance.findMany({
    where: { siteId: null },
    select: { id: true, rigId: true, uploadId: true },
  });
  console.log(`Performances missing siteId: ${missing.length}`);

  if (missing.length > 0) {
    const [uploads, rigs] = await Promise.all([
      db.excelUpload.findMany({
        where: { id: { in: [...new Set(missing.map((p) => p.uploadId).filter((x): x is string => !!x))] } },
        select: { id: true, siteId: true },
      }),
      db.rig.findMany({
        where: { id: { in: [...new Set(missing.map((p) => p.rigId))] } },
        select: { id: true, siteId: true, name: true },
      }),
    ]);
    const uploadSiteById = new Map(uploads.map((u) => [u.id, u.siteId]));
    const rigById = new Map(rigs.map((r) => [r.id, r]));

    let byUpload = 0;
    let byRig = 0;
    let unresolved = 0;
    const unresolvedRigs = new Set<string>();
    for (const p of missing) {
      const uploadSite = p.uploadId ? (uploadSiteById.get(p.uploadId) ?? null) : null;
      const rigSite = rigById.get(p.rigId)?.siteId ?? null;
      if (uploadSite) {
        await db.rigShiftPerformance.update({
          where: { id: p.id },
          data: { siteId: uploadSite, siteEvidence: "upload" },
        });
        byUpload++;
      } else if (rigSite) {
        await db.rigShiftPerformance.update({
          where: { id: p.id },
          data: { siteId: rigSite, siteEvidence: "rig-current" },
        });
        byRig++;
        unresolvedRigs.add(rigById.get(p.rigId)?.name ?? p.rigId);
      } else {
        unresolved++;
      }
    }
    console.log(`  → ${byUpload} from upload site, ${byRig} from rig's current site, ${unresolved} unresolved`);
    if (byRig > 0) {
      console.log(
        `  ⚠ Rows stamped from the rig's CURRENT site assume the rig never moved. Rigs involved: ${[...unresolvedRigs].join(", ")}`,
      );
    }
  }

  console.log("→ Cross-checking all stamped shifts against planilla crew evidence...");
  const conflicts = await flagPerformanceSiteConflicts(new Date("2000-01-01"), new Date("2100-01-01"));
  console.log(`  → ${conflicts} conflicted shift(s)`);

  const report = await listPerformanceSiteConflicts();
  for (const r of report) {
    console.log(
      `  ⚠ ${r.date} ${r.shift.padEnd(5)} rig ${r.rigName}: stamped "${r.stampedSiteName ?? "?"}" but planilla crew says "${r.planillaSiteName ?? "?"}" (${r.evidenceRows} crew rows)`,
    );
  }
  if (report.length === 0) console.log("✅ No rig-site conflicts found.");
}

main()
  .catch((err: unknown) => {
    console.error("❌ Backfill failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
