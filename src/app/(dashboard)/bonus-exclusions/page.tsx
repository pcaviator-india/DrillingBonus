import { db } from "@/lib/db";
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
import { ExclusionForm } from "./exclusion-form";
import { DeleteButton } from "./delete-button";

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
  let employees: { id: string; fullName: string; rut: string | null }[] = [];
  let sites: { id: string; name: string }[] = [];

  try {
    [exclusions, employees, sites] = await Promise.all([
      db.bonusExclusion.findMany({
        include: { employee: true, site: true },
        orderBy: { createdAt: "desc" },
      }),
      db.employee.findMany({
        select: { id: true, fullName: true, rut: true },
        orderBy: { fullName: "asc" },
      }),
      db.site.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);
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
      <p className="text-sm text-muted-foreground">
        Employees listed here are automatically excluded from all bonus
        calculations. Use this for employees who do not receive bonus.
      </p>

      <ExclusionForm employees={employees} sites={sites} />

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
                    No exclusions yet. Add one above.
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
                          <DeleteButton id={ex.id} />
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

