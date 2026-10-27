import { db } from "@/lib/db";
import { workeraClient } from "@/lib/workera/client";
import { SyncForms, ScopeSelector } from "./sync-forms";

export default async function SyncPage() {
  const [branches, departments] = await Promise.all([
    db.branchOffice.findMany({ orderBy: { code: "asc" } }),
    db.department.findMany({ orderBy: { code: "asc" } }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Sync</h1>
        <p className="text-sm text-muted-foreground">
          Pull data from Workera into the normalized database models.
        </p>
      </div>
      <ScopeSelector
        branches={branches.map((b) => ({ code: b.code, name: b.name, selected: b.selected }))}
        departments={departments.map((d) => ({ code: d.code, name: d.name, selected: d.selected }))}
      />
      <SyncForms mockMode={workeraClient.isMock()} />
    </div>
  );
}
