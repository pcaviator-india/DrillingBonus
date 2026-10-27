import Link from "next/link";
import { db } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  listMainPositionsWithAliases,
  listAliasesNeedingReview,
  listUnlinkedAliases,
  suggestMatches,
  type AliasWithGroup,
} from "@/lib/positions/registry";
import { reseedPositionsAction } from "./actions";
import { ReviewRow } from "./review-row";
import { MainPositionCard } from "./main-position-card";
import { NewMainPositionForm } from "./new-main-form";
import { ClassifyNameDialog } from "./classify-name-dialog";

export default async function PositionsPage({
  searchParams,
}: {
  searchParams: Promise<{ review?: string }>;
}) {
  const { review } = await searchParams;

  // Groups/aliases are seeded and refreshed by the upload pipeline
  // (lib/excel/process.ts) and the "Re-sync" button — not on every render.
  const groups = await db.positionGroup.findMany({ orderBy: { order: "asc" } });
  const mains = await listMainPositionsWithAliases();
  const toReview = await listAliasesNeedingReview();
  const unlinked = (await listUnlinkedAliases()).filter(
    (a) => !toReview.some((r) => r.id === a.id),
  );

  const groupOptions = groups.map((g) => ({ key: g.key, name: g.name }));
  const mainOptions = mains.map((m) => ({ id: m.id, name: m.name, groupName: m.groupName }));

  // Linked aliases power the similarity suggestions (only classified ones)
  const linkedAliases = mains.flatMap((m) => m.aliases);

  function mainSuggestions(alias: AliasWithGroup) {
    return suggestMatches(alias.normalized, linkedAliases)
      .map((s) => {
        const main = mains.find((m) => m.aliases.some((a) => a.id === s.alias.id));
        return main ? { main: { id: main.id, name: main.name, groupName: main.groupName }, score: s.score } : null;
      })
      .filter((s): s is { main: { id: string; name: string; groupName: string | null }; score: number } => !!s);
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Positions</h1>
          <p className="text-sm text-muted-foreground">
            Main positions are the canonical cargo names (e.g. &quot;Administrador de Contrato&quot;).
            Aliases like &quot;ADC&quot; are linked to their main position and inherit its bonus
            group automatically. Bonus groups are listed on the{" "}
            <Link href="/groups" className="underline">
              Bonus Groups
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

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            New position names to classify ({toReview.length})
          </CardTitle>
          <CardDescription>
            Found in recent uploads and not yet classified. Decide whether each is a Main Position
            or an alias of one.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {toReview.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing pending — all cargo names are classified.
            </p>
          ) : (
            toReview.map((alias: AliasWithGroup) => (
              <ReviewRow
                key={alias.id}
                alias={alias}
                mainOptions={mainOptions}
                suggestions={mainSuggestions(alias).map(({ main, score }) => ({
                  main: { id: main.id, name: main.name },
                  score,
                }))}
              />
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Unlinked cargo names ({unlinked.length})
          </CardTitle>
          <CardDescription>
            Existing names not assigned to any Main Position. Classify each one — its bonus group
            will follow from the main position.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {unlinked.length === 0 ? (
            <p className="text-sm text-muted-foreground">All cargo names are linked.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {unlinked.map((alias) => (
                <span
                  key={alias.id}
                  className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm"
                >
                  {alias.displayName}
                  {alias.groupName && (
                    <span className="text-xs text-muted-foreground">({alias.groupName})</span>
                  )}
                  <ClassifyNameDialog
                    alias={alias}
                    mainOptions={mainOptions}
                    suggestions={mainSuggestions(alias)}
                    triggerLabel="Classify"
                  />
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Create a Main Position</CardTitle>
        </CardHeader>
        <CardContent>
          <NewMainPositionForm groups={groupOptions} />
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {mains.map((main) => (
          <MainPositionCard key={main.id} main={main} groups={groupOptions} />
        ))}
      </div>

      {review && (
        <p className="text-xs text-muted-foreground">
          Reviewing new positions from upload{" "}
          <Link href={`/uploads/${review}`} className="underline">
            #{review}
          </Link>
          .
        </p>
      )}
    </div>
  );
}
