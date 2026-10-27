import "dotenv/config";
import { db } from "../src/lib/db";

/**
 * Data fix: relink the PERFORISTA TRAINING alias from main position
 * "Perforista" to "Ayudante Perforista".
 *
 * Every MV/Fenix/Coipa rule script lists "Perforista Training" inside
 * AYUDANTE_FILTER (Tabla 2, @$500), but the alias resolved to main "Perforista",
 * injecting the token "Perforista" into matching employees and making BOTH
 * Bono Metro rules apply (Tabla 1 @$750 + Tabla 2 @$500 = same day paid twice).
 *
 * Group assignment is intentionally NOT touched (respects the manual
 * Perforista/Ayudante group exclusion on the Positions page).
 */
async function main() {
  const alias = await db.positionAlias.findUnique({
    where: { normalized: "PERFORISTA TRAINING" },
    include: { mainPosition: true },
  });
  if (!alias) throw new Error("Alias PERFORISTA TRAINING not found");
  const main = await db.mainPosition.findUnique({
    where: { normalized: "AYUDANTE PERFORISTA" },
  });
  if (!main) throw new Error("Main position AYUDANTE PERFORISTA not found");
  if (alias.mainPositionId === main.id) {
    console.log("Already linked to Ayudante Perforista — nothing to do.");
    return;
  }
  await db.positionAlias.update({
    where: { id: alias.id },
    data: { mainPositionId: main.id, needsReview: false },
  });
  console.log(
    `Relinked PERFORISTA TRAINING: main "${alias.mainPosition?.name ?? "-"}" -> "${main.name}" (groupId untouched: ${alias.groupId ?? "NONE"})`,
  );
}

main()
  .catch((e) => {
    console.error("FAILED:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
