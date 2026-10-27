import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const AR_2500 = { arThresholdMeters: 2500 };

async function main() {
  const p = new PrismaClient();

  // ---------- 1. Patch active rule sets: add bestRigRule to best_rig_month rules ----------
  const activeSets = await p.bonusRuleSet.findMany({
    where: { isActive: true },
    include: { site: true, rules: true },
  });
  for (const rs of activeSets) {
    let patched = 0;
    for (const r of rs.rules) {
      const params = r.parameters as Record<string, unknown>;
      if (params?.bestRigSelection === "best_rig_month") {
        const rule = (params as { bestRigRule?: unknown }).bestRigRule as { arThresholdMeters?: number } | undefined;
        if (!rule || typeof rule.arThresholdMeters !== "number") {
          await p.bonusRule.update({
            where: { id: r.id },
            data: { parameters: { ...(params as object), bestRigRule: AR_2500 } },
          });
          patched++;
        }
      }
    }
    console.log(`RULESET ${rs.site.name} ${rs.name} v${rs.version}: patched ${patched} best_rig_month rule(s)`);
  }

  // ---------- 2. Clean rig data (testing phase) ----------
  // Both rows of each duplicated name carry real data, so merge into the
  // site-assigned row: move performances (skip date+shift collisions),
  // crew assignments, aliases, workdays from the unassigned duplicate,
  // then delete the duplicate.
  const pairs: Array<[string, string]> = [
    ["1200-1", "AIRE_REVERSO"], // keep AR-typed row on Mantoverde
    ["740-07", "DIAMANTINA"],
    ["740-14", "DIAMANTINA"],
  ];
  for (const [name, keepType] of pairs) {
    const rows = await p.rig.findMany({ where: { name }, include: { site: true } });
    if (rows.length < 2) {
      console.log(`RIG ${name}: ${rows.length} row(s), nothing to merge`);
      continue;
    }
    const keep = rows.find((r) => r.siteId && r.rigType === keepType) ?? rows.find((r) => r.siteId) ?? rows[0];
    const dupes = rows.filter((r) => r.id !== keep.id);
    for (const dupe of dupes) {
      // performances: keep-row wins on (date, shift) collision.
      // Re-pointing collides with the @@unique([rigId, date, shift]) key, so
      // delete-then-move: drop keep-row losers first? No — keep-row wins:
      // delete the dupe's colliding rows, move the rest.
      const perfs = await p.rigShiftPerformance.findMany({ where: { rigId: dupe.id } });
      let movedP = 0;
      let skippedP = 0;
      for (const perf of perfs) {
        const clash = await p.rigShiftPerformance.findUnique({
          where: { rigId_date_shift: { rigId: keep.id, date: perf.date, shift: perf.shift } },
        });
        if (clash) {
          await p.rigShiftPerformance.delete({ where: { id: perf.id } });
          skippedP++;
          continue;
        }
        await p.rigShiftPerformance.update({ where: { id: perf.id }, data: { rigId: keep.id, uploadId: null } });
        movedP++;
      }
      // crew assignments: dupe-row (employeeId, rigId, date, shift) -> keep rigId
      const assigns = await p.crewAssignment.findMany({ where: { rigId: dupe.id } });
      let movedA = 0;
      for (const a of assigns) {
        const clash = await p.crewAssignment.findFirst({
          where: { employeeId: a.employeeId, rigId: keep.id, date: a.date, shift: a.shift },
        });
        if (clash) {
          await p.crewAssignment.delete({ where: { id: a.id } });
          continue;
        }
        await p.crewAssignment.update({ where: { id: a.id }, data: { rigId: keep.id } });
        movedA++;
      }
      const aliasMoved = await p.rigAlias.updateMany({ where: { rigId: dupe.id }, data: { rigId: keep.id } }).catch(() => ({ count: 0 }));
      const wdMoved = await p.employeeWorkDay.updateMany({ where: { rigId: dupe.id }, data: { rigId: keep.id } }).catch(() => ({ count: 0 }));
      await p.rig.delete({ where: { id: dupe.id } });
      console.log(
        `RIG ${name}: merged ${dupe.id} -> ${keep.id} (perfs moved=${movedP} skipped=${skippedP}, assigns moved=${movedA}, aliases=${aliasMoved.count}, workdays=${wdMoved.count})`,
      );
    }
  }

  // Backfill SiteRig rows for assigned rigs missing one (keeps run.ts + UI consistent)
  const assigned = await p.rig.findMany({ where: { siteId: { not: null } }, include: { siteRigs: true } });
  for (const r of assigned) {
    if (r.siteRigs.length === 0) {
      await p.siteRig.create({ data: { siteId: r.siteId!, rigId: r.id, effectiveType: null } });
      console.log(`SITERIG created for ${r.name} (${r.rigType})`);
    }
  }
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
