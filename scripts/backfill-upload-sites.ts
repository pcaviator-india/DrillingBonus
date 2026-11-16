import { PrismaClient } from "@prisma/client";
import { normalizeText, rigKeyOf } from "../src/lib/excel/normalize";

const p = new PrismaClient();

async function main() {
  console.log("=== Backfilling null siteIds on uploads, rigs, and performances ===\n");

  // ---------------------------------------------------------------
  // 1. Backfill excelUpload.siteId for rig_intervals uploads
  // ---------------------------------------------------------------
  const uploadsWithoutSite = await p.excelUpload.findMany({
    where: { kind: "rig_intervals", siteId: null },
    select: { id: true, fileName: true },
  });
  console.log(`Found ${uploadsWithoutSite.length} rig_intervals upload(s) without siteId.`);

  let uploadBackfilled = 0;
  for (const u of uploadsWithoutSite) {
    // 1a: From rigShiftPerformance rows → rig.siteId (majority vote)
    const perfs = await p.rigShiftPerformance.findMany({
      where: { uploadId: u.id },
      include: { rig: { select: { siteId: true, name: true } } },
    });
    const perfSiteVotes = new Map<string, number>();
    for (const perf of perfs) {
      if (perf.rig?.siteId) {
        perfSiteVotes.set(perf.rig.siteId, (perfSiteVotes.get(perf.rig.siteId) ?? 0) + 1);
      }
    }
    const perfWinner = perfSiteVotes.size > 0
      ? [...perfSiteVotes.entries()].sort((a, b) => b[1] - a[1])[0][0]
      : null;

    // 1b: From dailyCrewEntry → projectName → siteAlias → siteId
    const entries = await p.dailyCrewEntry.findMany({
      where: { uploadId: u.id, machine: { not: null }, projectName: { not: null } },
      select: { machine: true, projectName: true },
    });
    const aliases = await p.siteAlias.findMany({ select: { normalized: true, siteId: true } });
    const siteByProject = new Map(aliases.map((a) => [a.normalized, a.siteId]));
    const entrySiteVotes = new Map<string, number>();
    for (const e of entries) {
      const siteId = siteByProject.get(normalizeText(e.projectName ?? ""));
      if (siteId) {
        entrySiteVotes.set(siteId, (entrySiteVotes.get(siteId) ?? 0) + 1);
      }
    }
    const entryWinner = entrySiteVotes.size > 0
      ? [...entrySiteVotes.entries()].sort((a, b) => b[1] - a[1])[0][0]
      : null;

    // Prefer crew-entry evidence (direct from the file), fall back to rig.siteId
    const resolved = entryWinner ?? perfWinner;
    if (resolved) {
      await p.excelUpload.update({
        where: { id: u.id },
        data: { siteId: resolved },
      });
      uploadBackfilled++;
      console.log(
        `  Upload ${u.id} "${u.fileName}": siteId=${resolved} ` +
          `(crew=${entryWinner ?? "none"}, perf=${perfWinner ?? "none"})`
      );
    } else {
      console.log(`  Upload ${u.id} "${u.fileName}": NO site could be resolved.`);
    }
  }

  // ---------------------------------------------------------------
  // 2. Backfill rigShiftPerformance.siteId for null rows
  // ---------------------------------------------------------------
  const perfsWithoutSite = await p.rigShiftPerformance.findMany({
    where: { siteId: null },
    include: {
      rig: { select: { siteId: true } },
      upload: { select: { siteId: true } },
    },
  });
  console.log(`\nFound ${perfsWithoutSite.length} performance row(s) without siteId.`);

  let perfBackfilled = 0;
  for (const perf of perfsWithoutSite) {
    const fromUpload = perf.upload?.siteId ?? null;
    const fromRig = perf.rig?.siteId ?? null;
    const resolved = fromUpload ?? fromRig;
    if (resolved) {
      await p.rigShiftPerformance.update({
        where: { id: perf.id },
        data: { siteId: resolved, siteEvidence: fromUpload ? "upload" : "rig-current" },
      });
      perfBackfilled++;
    } else {
      console.log(
        `  Performance ${perf.id} (rig ${perf.rigId}, upload ${perf.uploadId}): NO site could be resolved.`
      );
    }
  }
  console.log(`Backfilled ${perfBackfilled} performance row(s).`);

  // ---------------------------------------------------------------
  // 3. Backfill Rig.siteId for null rigs
  // ---------------------------------------------------------------
  const rigsWithoutSite = await p.rig.findMany({
    where: { siteId: null, isActive: true },
    include: {
      performances: { select: { siteId: true } },
    },
  });
  console.log(`\nFound ${rigsWithoutSite.length} active rig(s) without siteId.`);

  let rigBackfilled = 0;
  for (const rig of rigsWithoutSite) {
    const votes = new Map<string, number>();
    for (const perf of rig.performances) {
      if (perf.siteId) {
        votes.set(perf.siteId, (votes.get(perf.siteId) ?? 0) + 1);
      }
    }
    if (votes.size === 1) {
      const siteId = [...votes.entries()][0][0];
      await p.rig.update({ where: { id: rig.id }, data: { siteId } });
      rigBackfilled++;
      console.log(`  Rig ${rig.id} "${rig.name}": siteId=${siteId} (from performances)`);
    } else if (votes.size > 1) {
      const winner = [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
      await p.rig.update({ where: { id: rig.id }, data: { siteId: winner } });
      rigBackfilled++;
      console.log(`  Rig ${rig.id} "${rig.name}": siteId=${winner} (majority vote from performances)`);
    } else {
      console.log(`  Rig ${rig.id} "${rig.name}": NO site could be resolved.`);
    }
  }

  // ---------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------
  console.log(
    `\n=== Done. Uploads backfilled: ${uploadBackfilled}, ` +
      `Performances backfilled: ${perfBackfilled}, Rigs backfilled: ${rigBackfilled} ===\n`
  );

  const remainingUploads = await p.excelUpload.count({ where: { kind: "rig_intervals", siteId: null } });
  const remainingPerfs = await p.rigShiftPerformance.count({ where: { siteId: null } });
  const remainingRigs = await p.rig.count({ where: { siteId: null, isActive: true } });
  console.log(`Remaining nulls: uploads=${remainingUploads}, performances=${remainingPerfs}, rigs=${remainingRigs}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());

