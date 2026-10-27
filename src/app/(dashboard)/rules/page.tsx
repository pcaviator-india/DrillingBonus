import { db } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateUtc } from "@/lib/datetime";
import { CreateRuleSetForm } from "./create-rule-set-form";
import type { GroupOption, PositionOption } from "./components/rule-form-shared";
import Link from "next/link";

export default async function RulesPage() {
  const [sites, bonusTypes, ruleSets, mainPositions, positionGroups] = await Promise.all([
    db.site.findMany({ orderBy: { name: "asc" } }),
    db.bonusType.findMany({ orderBy: { displayOrder: "asc" } }),
    db.bonusRuleSet.findMany({
      orderBy: { createdAt: "desc" },
      include: { site: true, rules: { include: { bonusType: true } } },
    }),
    db.mainPosition.findMany({ orderBy: { order: "asc" } }),
    db.positionGroup.findMany({ orderBy: { order: "asc" } }),
  ]);

  const groups: GroupOption[] = positionGroups.map((g) => ({ key: g.key, name: g.name }));
  const groupNameByKey = new Map(groups.map((g) => [g.key, g.name]));
  const positions: PositionOption[] = mainPositions.map((m) => ({
    name: m.name,
    groupKey: m.groupKey,
    groupName: m.groupKey ? (groupNameByKey.get(m.groupKey) ?? null) : null,
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Bonus Rules</h1>
        <p className="text-sm text-muted-foreground">
          Versioned, site-specific rule sets with configurable bonus types.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Existing rule sets</CardTitle>
          <CardDescription>{ruleSets.length} rule set(s)</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Effective from</TableHead>
                <TableHead>Rules</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ruleSets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No rule sets yet. Create one below.
                  </TableCell>
                </TableRow>
              ) : (
                ruleSets.map((rs) => (
                  <TableRow key={rs.id}>
                    <TableCell className="font-medium">{rs.name}</TableCell>
                    <TableCell>{rs.site.name}</TableCell>
                    <TableCell>v{rs.version}</TableCell>
                    <TableCell>{formatDateUtc(rs.effectiveFrom)}</TableCell>
                    <TableCell>
                      {rs.rules
                        .map((r) => `${r.bonusType.name}${r.positionFilter.length > 0 ? ` (${r.positionFilter.join(", ")})` : ""}`)
                        .join(" · ") || "—"}
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/rules/${rs.id}`}>Edit</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {sites.length > 0 ? (
        <CreateRuleSetForm
          sites={sites.map((s) => ({ id: s.id, name: s.name }))}
          bonusTypes={bonusTypes.map((bt) => ({ id: bt.id, code: bt.code, name: bt.name, description: bt.description }))}
          positions={positions}
          groups={groups}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Create a site first before configuring rules.
        </p>
      )}
    </div>
  );
}
