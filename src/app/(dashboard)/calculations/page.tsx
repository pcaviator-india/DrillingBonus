import Link from "next/link";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RunCalculationForm } from "./run-calculation-form";
import { CalculationTable } from "./calculation-table";
import { auth } from "@/lib/auth";

export default async function CalculationsPage() {
  const [sites, calculations, session] = await Promise.all([
    db.site.findMany({
      orderBy: { name: "asc" },
      include: { bonusRuleSets: { where: { isActive: true }, orderBy: { version: "desc" } } },
    }),
    db.bonusCalculation.findMany({
      orderBy: { createdAt: "desc" },
      include: { site: true, ruleSet: true, _count: { select: { comparisons: true } } },
      take: 50,
    }),
    auth(),
  ]);
  const isAdmin = session?.user.role === "admin";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Calculations</h1>
        <p className="text-sm text-muted-foreground">
          Run auditable bonus calculations per site and period.
        </p>
      </div>

      {sites.length > 0 ? (
        <RunCalculationForm
          sites={sites.map((s) => ({
            id: s.id,
            name: s.name,
            ruleSets: s.bonusRuleSets.map((rs) => ({
              id: rs.id,
              name: rs.name,
              version: rs.version,
            })),
          }))}
        />
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Calculation history</CardTitle>
            {calculations.length > 0 ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/api/calculations/export">Export all</Link>
              </Button>
            ) : null}
          </div>
          <CardDescription>{calculations.length} calculation(s)</CardDescription>
        </CardHeader>
        <CardContent>
          <CalculationTable
            calculations={calculations.map((c) => ({
              id: c.id,
              createdAt: c.createdAt,
              site: { name: c.site.name },
              source: c.source,
              ruleSet: { name: c.ruleSet.name, version: c.ruleSet.version },
              periodStart: c.periodStart,
              periodEnd: c.periodEnd,
              totalBonus: c.totalBonus,
              status: c.status,
            }))}
            isAdmin={isAdmin}
          />
        </CardContent>
      </Card>
    </div>
  );
}

