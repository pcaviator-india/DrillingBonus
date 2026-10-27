import Link from "next/link";
import { db } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listMainPositionsWithAliases } from "@/lib/positions/registry";
import { reseedPositionsAction } from "../positions/actions";

export default async function GroupsPage() {
  // Groups/aliases are seeded and refreshed by the upload pipeline
  // (lib/excel/process.ts) and the "Re-sync" button — not on every render.
  const groups = await db.positionGroup.findMany({ orderBy: { order: "asc" } });
  const mains = await listMainPositionsWithAliases();

  const unclassified = await db.positionAlias.count({
    where: { mainPositionId: null, groupId: null },
  });

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bonus Groups</h1>
          <p className="text-sm text-muted-foreground">
            How cargo names map to bonus calculation groups. A name&apos;s group comes from its Main
            Position — assign names and aliases on the{" "}
            <Link href="/positions" className="underline">
              Positions
            </Link>{" "}
            page.
          </p>
        </div>
        <form action={reseedPositionsAction}>
          <Button variant="outline" size="sm" type="submit">
            Re-sync from config & sheets
          </Button>
        </form>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {groups.map((g) => {
          const groupMains = mains.filter((m) => m.groupKey === g.key);
          const aliasCount = groupMains.reduce((n, m) => n + m.aliases.length, 0);
          return (
            <Card key={g.id}>
              <CardHeader>
                <CardTitle className="text-lg">{g.name}</CardTitle>
                <CardDescription>
                  {groupMains.length} main position(s) · {aliasCount} alias(es)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {groupMains.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No main positions assigned yet.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {groupMains.map((m) => (
                      <li key={m.id}>
                        <span className="font-medium">{m.name}</span>
                        {m.aliases.length > 0 && (
                          <span className="text-muted-foreground">
                            {" "}
                            — {m.aliases.map((a) => a.displayName).join(", ")}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {unclassified > 0 && (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardContent className="flex items-center justify-between py-4">
            <p className="text-sm">
              {unclassified} cargo name(s) still have no bonus group — they are not yet classified
              as a Main Position or alias.
            </p>
            <Button asChild size="sm">
              <Link href="/positions">Classify now</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}