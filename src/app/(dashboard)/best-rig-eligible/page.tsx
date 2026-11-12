import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
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
import { BestRigForm } from "./best-rig-form";
import { deleteBestRigEligibleAction } from "./actions";
import { formatDateUtc } from "@/lib/datetime";

export default async function BestRigEligiblePage() {
  const [list, employees, sites] = await Promise.all([
    db.bestRigEligibleEmployee.findMany({
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Best Rig Eligibility</h1>
        <p className="text-sm text-muted-foreground">
          Employees listed here always receive Best Rig bonus, even when their
          role is Driller or Driller Helper. Overrides the rule-level
          bestRigSelection.
        </p>
      </div>

      <BestRigForm employees={employees} sites={sites} />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Best Rig eligible list</CardTitle>
          <CardDescription>{list.length} employee(s)</CardDescription>
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
              {list.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No best rig eligible employees yet. Add one above.
                  </TableCell>
                </TableRow>
              ) : (
                list.map((ex) => (
                  <TableRow key={ex.id}>
                    <TableCell className="font-medium">
                      {ex.employee.fullName}{ex.employee.rut ? ` (${ex.employee.rut})` : ""}
                    </TableCell>
                    <TableCell>
                      {ex.site?.name ?? <em className="text-muted-foreground">All sites</em>}
                    </TableCell>
                    <TableCell className="text-sm">{ex.reason ?? "—"}</TableCell>
                    <TableCell className="text-sm">{formatDateUtc(ex.effectiveFrom)}</TableCell>
                    <TableCell className="text-sm">
                      {ex.effectiveTo ? formatDateUtc(ex.effectiveTo) : <em className="text-muted-foreground">Ongoing</em>}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          void deleteBestRigEligibleAction(ex.id);
                        }}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}