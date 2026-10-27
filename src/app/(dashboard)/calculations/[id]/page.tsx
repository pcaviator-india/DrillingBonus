import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDateUtc } from "@/lib/datetime";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { CalculationLinesClient, type LineRow } from "./calculation-lines";
import { DeleteCalculationButton } from "../delete-calculation-button";

export default async function CalculationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [calc, session] = await Promise.all([
    db.bonusCalculation.findUnique({
      where: { id },
      include: { site: true, ruleSet: true, lines: { include: { employee: true } } },
    }),
    auth(),
  ]);
  if (!calc) notFound();

  const lines: LineRow[] = calc.lines.map((line) => ({
    id: line.id,
    employeeName: line.employee.fullName,
    roleUsed: line.roleUsed,
    daysWorked: line.daysWorked,
    totalMeters: line.totalMeters,
    totalHours: line.totalHours,
    basePercentage: line.basePercentage,
    calculatedBonus: line.calculatedBonus,
    breakdown: (line.breakdown ?? null) as LineRow["breakdown"],
  }));

  const isAdmin = session?.user.role === "admin";

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link href="/calculations">← Back to calculations</Link>
        </Button>
        {isAdmin ? <DeleteCalculationButton calculationId={calc.id} /> : null}
      </div>

      <div>
        <h1 className="text-2xl font-bold">Calculation detail</h1>
        <p className="text-sm text-muted-foreground">
          {calc.site.name} · {calc.ruleSet.name} (v{calc.ruleSet.version}) ·{" "}
          {formatDateUtc(calc.periodStart)} → {formatDateUtc(calc.periodEnd)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="outline" size="sm">
          <Link href={`/api/calculations/${calc.id}/export`}>Export (summary)</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/api/calculations/${calc.id}/export?details=1`}>Export with details</Link>
        </Button>
        <Button asChild size="sm">
          <Link href={`/api/calculations/${calc.id}/export-super`}>Export super detailed (Excel)</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div>
            Total bonus: <strong>{calc.totalBonus}</strong>
          </div>
          <div>
            Status: <Badge variant="secondary">{calc.status}</Badge>
          </div>
          <div className="text-sm text-muted-foreground">
            Full input snapshot stored for audit: {calc.inputSnapshot ? "yes" : "no"} ·{" "}
            {calc.lines.length} line(s)
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Lines</CardTitle>
          <CardDescription>
            Click an employee name or &ldquo;Details&rdquo; to see their shift-by-shift breakdown.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CalculationLinesClient lines={lines} />
        </CardContent>
      </Card>
    </div>
  );
}
