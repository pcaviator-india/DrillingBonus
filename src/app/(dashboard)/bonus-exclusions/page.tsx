import { db } from "@/lib/db";
import type { BonusExclusion } from "@prisma/client";

export default async function BonusExclusionsPage() {
  let exclusions: BonusExclusion[] = [];
  let dbError: string | null = null;

  try {
    exclusions = await db.bonusExclusion.findMany({
      include: { employee: true, site: true },
      orderBy: { createdAt: "desc" },
    });
  } catch (e: any) {
    dbError = String(e?.message ?? e);
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Bonus Exclusions (Data Test)</h1>
      {dbError && <p className="text-red-600">Query error: {dbError}</p>}
      {!dbError && (
        <>
          <p>Row count: <b>{exclusions.length}</b></p>
          <ul>
            {exclusions.map((ex) => (
              <li key={ex.id}>
                {ex.id} | {ex.employee?.fullName ?? "no employee"} |
                {ex.effectiveFrom?.toISOString?.() ?? "no date"}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

