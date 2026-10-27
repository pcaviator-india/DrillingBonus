import { db } from "@/lib/db";
import { getWorkDays } from "../actions";
import { formatDateUtc } from "@/lib/datetime";
import type { WorkDayRow } from "@/lib/matching/build";

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export default async function EmployeeReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const today = new Date();
  const lastMonthFirst = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthLast = new Date(today.getFullYear(), today.getMonth(), 0);
  const from = sp.from ?? toYMD(lastMonthFirst);
  const to = sp.to ?? toYMD(lastMonthLast);

  const [employee, workDays] = await Promise.all([
    db.employee.findUnique({ where: { id } }),
    getWorkDays({ from, to, employeeId: id }),
  ]);

  const totalMeters = workDays.reduce((n, w) => n + (w.metersAttributed ?? 0), 0);
  const totalHours = workDays.reduce((n, w) => n + (w.workeraHours ?? 0), 0);
  const presentDays = workDays.filter(
    (w) => w.workeraStatus && w.workeraStatus !== "absent",
  ).length;
  const flaggedDays = workDays.filter((w) => w.flags.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <a href={`/reports?from=${from}&to=${to}`} className="text-sm text-primary hover:underline">
          ← Back to summary
        </a>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{employee?.fullName ?? "Unknown employee"}</h1>
          <p className="text-sm text-muted-foreground">
            RUT: {employee?.rut ?? "—"} · Period: {from} → {to}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-4">
        <div className="rounded border p-4">
          <div className="text-sm text-muted-foreground">Days worked</div>
          <div className="text-2xl font-bold">{workDays.length}</div>
        </div>
        <div className="rounded border p-4">
          <div className="text-sm text-muted-foreground">Days present</div>
          <div className="text-2xl font-bold">{presentDays}</div>
        </div>
        <div className="rounded border p-4">
          <div className="text-sm text-muted-foreground">Total meters</div>
          <div className="text-2xl font-bold">{totalMeters.toFixed(1)}</div>
        </div>
        <div className="rounded border p-4">
          <div className="text-sm text-muted-foreground">Total hours</div>
          <div className="text-2xl font-bold">{totalHours.toFixed(1)}</div>
        </div>
        <div className="rounded border p-4">
          <div className="text-sm text-muted-foreground">Flagged days</div>
          <div className="text-2xl font-bold">{flaggedDays.length}</div>
        </div>
      </div>

      <div className="rounded border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Site</th>
              <th className="px-4 py-2">Shift</th>
              <th className="px-4 py-2">Turno</th>
              <th className="px-4 py-2">Group</th>
              <th className="px-4 py-2">Workera</th>
              <th className="px-4 py-2">Rig</th>
              <th className="px-4 py-2">Machine</th>
              <th className="px-4 py-2">Escala</th>
              <th className="px-4 py-2 text-right">Rig meters</th>
              <th className="px-4 py-2 text-right">Credited</th>
              <th className="px-4 py-2 text-right">Hours</th>
              <th className="px-4 py-2">Flags</th>
            </tr>
          </thead>
          <tbody>
            {workDays.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-4 py-8 text-center text-muted-foreground">
                  No work days for this employee in the selected period.
                </td>
              </tr>
            ) : (
              workDays.map((w) => (
                <tr
                  key={w.id}
                  className={`border-b hover:bg-muted/30 ${w.flags.length > 0 ? "bg-yellow-50/50" : ""}`}
                >
                  <td className="px-4 py-2">{w.date}</td>
                  <td className="px-4 py-2">{w.siteName ?? "—"}</td>
                  <td className="px-4 py-2">{w.shiftDayNight}</td>
                  <td className="px-4 py-2">{w.turnoAB ?? "—"}</td>
                  <td className="px-4 py-2">{w.positionGroup ?? "—"}</td>
                  <td className="px-4 py-2">{w.workeraStatus ?? "—"}</td>
                  <td className="px-4 py-2">{w.rigName ?? "—"}</td>
                  <td className="px-4 py-2">{w.machineRaw ?? "—"}</td>
                  <td className="px-4 py-2">{w.escala ?? "—"}</td>
                  <td className="px-4 py-2 text-right">{(w.rigMeters ?? 0).toFixed(1)}</td>
                  <td className="px-4 py-2 text-right font-medium">
                    {(w.metersAttributed ?? 0).toFixed(1)}
                  </td>
                  <td className="px-4 py-2 text-right">{(w.workeraHours ?? 0).toFixed(1)}</td>
                  <td className="px-4 py-2 text-xs">
                    {w.flags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {w.flags.map((f) => (
                          <span
                            key={f}
                            className="rounded bg-yellow-100 px-1.5 py-0.5 text-yellow-800"
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
