import { db } from "@/lib/db";

export default async function BonusExclusionsPage() {
  try {
    const count = await db.bonusExclusion.count();
    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold">Bonus Exclusions (Minimal Test)</h1>
        <p>Table is reachable. Row count: <b>{count}</b></p>
      </div>
    );
  } catch (e: any) {
    return (
      <div className="p-4 text-red-900">
        <h2 className="text-xl font-bold">DB Query Error (Debug)</h2>
        <p className="mb-2">{String(e?.message ?? e)}</p>
        {e?.digest && <p className="mb-2 text-xs text-muted-foreground">Digest: {e.digest}</p>}
      </div>
    );
  }
}

