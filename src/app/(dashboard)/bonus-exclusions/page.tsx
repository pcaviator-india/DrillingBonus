import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateUtc } from "@/lib/datetime";
import type { BonusExclusion, Employee, Site } from "@prisma/client";

type ExclusionRow = BonusExclusion & {
  employee: Employee | null;
  site: Site | null;
};

function renderDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  try {
    return formatDateUtc(value as Date);
  } catch {
    return String(value);
  }
}

export default async function BonusExclusionsPage() {
  let exclusions: ExclusionRow[] = [];

  try {
    exclusions = await db.bonusExclusion.findMany({
      include: { employee: true, site: true },
      orderBy: { createdAt: "desc" },
    });
  } catch (e: any) {
    return (
      <div className="p-4 text-red-900">
        <h2 className="text-xl font-bold">DB Query Error (Debug)</h2>
        <p className="mb-2">{String(e?.message ?? e)}</p>
        {e?.digest && <p className="mb-2 text-xs text-muted-foreground">Digest: {e.digest}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-8 p-4">
      <h1 className="text-2xl font-bold">Bonus Exclusions</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Exclusion list</CardTitle>
          <CardDescription>{exclusions.length} exclusion(s)</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Effective From</TableHead>
                <TableHead>Effective To</TableHead>
                <TableHead className="w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exclusions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No exclusions yet.
                  </TableCell>
                </TableRow>
              ) : (
                exclusions.map((ex) => {
                  try {
                    return (
                      <TableRow key={ex.id}>
                        <TableCell className="font-medium">
                          {ex.employee
                            ? `${ex.employee.fullName}${ex.employee.rut ? ` (${ex.employee.rut})` : ""}`
                            : <em className="text-muted-foreground">Unknown employee</em>}
                        </TableCell>
                        <TableCell>
                          {ex.site?.name ?? <em className="text-muted-foreground">All sites</em>}
                        </TableCell>
                        <TableCell className="text-sm">{ex.reason ?? "—"}</TableCell>
                        <TableCell className="text-sm">{renderDate(ex.effectiveFrom)}</TableCell>
                        <TableCell className="text-sm">
                          {ex.effectiveTo ? renderDate(ex.effectiveTo) : <em className="text-muted-foreground">Ongoing</em>}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              void 0;
                            }}
                          >
                            Delete
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  } catch {
                    return (
                      <TableRow key={ex.id}>
                        <TableCell colSpan={6} className="text-muted-foreground">
                          Error rendering row.
                        </TableCell>
                      </TableRow>
                    );
                  }
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

