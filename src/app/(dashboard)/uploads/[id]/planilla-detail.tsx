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

function boolMark(v: boolean | null): string {
  if (v === null) return "—";
  return v ? "Sí" : "No";
}

export async function PlanillaDetail({ uploadId }: { uploadId: string }) {
  const entries = await db.dailyCrewEntry.findMany({
    where: { uploadId },
    orderBy: [{ date: "asc" }, { orderNumber: "asc" }],
  });

  const byDate = new Map<string, typeof entries>();
  for (const e of entries) {
    const key = e.date.toISOString().slice(0, 10);
    const list = byDate.get(key) ?? [];
    list.push(e);
    byDate.set(key, list);
  }

  return (
    <div className="space-y-6">
      {[...byDate.entries()].map(([date, rows]) => (
        <Card key={date}>
          <CardHeader>
            <CardTitle className="text-lg">{date}</CardTitle>
            <CardDescription>
              {rows[0]?.projectName ?? "—"} · {rows.length} worker(s)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>RUT</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Turno A/B</TableHead>
                  <TableHead>Day/Night</TableHead>
                  <TableHead>Machine</TableHead>
                  <TableHead>Ø</TableHead>
                  <TableHead>Escala</TableHead>
                  <TableHead className="text-right">Metros</TableHead>
                  <TableHead className="text-right">H.Extras</TableHead>
                  <TableHead>W. In</TableHead>
                  <TableHead>W. Out</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{e.orderNumber ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{e.rut}</TableCell>
                    <TableCell className="max-w-48 truncate">{e.fullName}</TableCell>
                    <TableCell>{e.cargoRaw || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={e.turnoAB === "A" ? "default" : "outline"}>
                        {e.turnoAB ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={e.shiftDayNight === "day" ? "secondary" : "outline"}>
                        {e.shiftDayNight}
                      </Badge>
                    </TableCell>
                    <TableCell>{e.machine ?? "—"}</TableCell>
                    <TableCell>{e.diameter ?? "—"}</TableCell>
                    <TableCell>{e.escala ?? "—"}</TableCell>
                    <TableCell className="text-right">{e.metros ?? "—"}</TableCell>
                    <TableCell className="text-right">{e.horasExtras ?? "—"}</TableCell>
                    <TableCell>{boolMark(e.workeraMarkedIn)}</TableCell>
                    <TableCell>{boolMark(e.workeraMarkedOut)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
      {entries.length === 0 && (
        <p className="text-sm text-muted-foreground">No parsed rows stored for this upload.</p>
      )}
    </div>
  );
}
