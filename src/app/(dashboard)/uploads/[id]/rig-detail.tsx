import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type IntervalRow = { band?: string; escala?: string | null; diameter?: string | null; meters?: number };

function formatIntervals(intervals: unknown): string {
  if (!Array.isArray(intervals) || intervals.length === 0) return "—";
  return (intervals as IntervalRow[])
    .map((i) => `${i.escala ?? i.band ?? "?"}: ${i.meters ?? 0}`)
    .join(", ");
}

export async function RigDetail({ uploadId }: { uploadId: string }) {
  const performances = await db.rigShiftPerformance.findMany({
    where: { uploadId },
    orderBy: [{ rigId: "asc" }, { date: "asc" }, { shift: "asc" }],
    include: { rig: true },
  });

  const byRig = new Map<string, typeof performances>();
  for (const p of performances) {
    const list = byRig.get(p.rig.name) ?? [];
    list.push(p);
    byRig.set(p.rig.name, list);
  }

  return (
    <div className="space-y-6">
      {[...byRig.entries()].map(([rigName, rows]) => (
        <Card key={rigName}>
          <CardHeader>
            <CardTitle className="text-lg">{rigName}</CardTitle>
            <CardDescription>{rows.length} shift record(s)</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Shift</TableHead>
                  <TableHead>Hole</TableHead>
                  <TableHead className="text-right">Meters</TableHead>
                  <TableHead>Intervals (escala)</TableHead>
                  <TableHead className="text-right">Hours (all activities)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.date.toISOString().slice(0, 10)}</TableCell>
                    <TableCell>
                      <Badge variant={p.shift === "day" ? "secondary" : "outline"}>{p.shift}</Badge>
                    </TableCell>
                    <TableCell>{p.hole ?? "—"}</TableCell>
                    <TableCell className="text-right">{p.metersDrilled}</TableCell>
                    <TableCell className="max-w-64 text-xs">
                      {formatIntervals(p.intervals)}
                    </TableCell>
                    <TableCell className="text-right">{p.hoursSpent ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
      {performances.length === 0 && (
        <p className="text-sm text-muted-foreground">No parsed rows stored for this upload.</p>
      )}
    </div>
  );
}
