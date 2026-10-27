"use client";

import { useEffect, useState, useTransition } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ColumnPicker, loadColumns, type ColumnKey } from "./column-picker";
import { correctAttendanceRecord, reviewAttendanceRecord } from "./actions";

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  present: "secondary",
  absent: "destructive",
  late: "default",
  leave: "outline",
};

function fmtHours(maybeHours: number | null): string {
  if (maybeHours === null || Number.isNaN(maybeHours)) return "\u2014";
  const totalMin = Math.round(maybeHours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export interface AttendanceRow {
  id: string;
  date: string;
  employeeName: string;
  role: string | null;
  site: string | null;
  department: string | null;
  shift: string | null;
  timeIn: string | null;
  timeOut: string | null;
  hours: number | null;
  status: string;
  corrected: boolean;
  needsReview: boolean;
  correctedById: string | null;
  correctedAt: string | null;
  correctionReason: string | null;
  originalTimeIn: string | null;
  originalTimeOut: string | null;
  reviewStatus: string | null;
  reviewNote: string | null;
  inDevice: string | null;
  employeeWorkeraId: string | null;
  rut: string | null;
  outDevice: string | null;
  inOrigin: string | null;
  inAddress: string | null;
  inCoordinates: string | null;
}

const HEADER_LABEL: Record<ColumnKey, string> = {
  date: "Date",
  employee: "Employee",
  role: "Role (Cargo)",
  site: "Site",
  department: "Department",
  shift: "Shift",
  timeIn: "Time in",
  timeOut: "Time out",
  hours: "Hours",
  status: "Status",
  inDevice: "Clock-in device",
  outDevice: "Clock-out device",
  inOrigin: "Origin",
  location: "Location",
  coords: "GPS coords",
};

// Default visible columns (server + first client render match -> no hydration issue)
const DEFAULT_COLUMNS: ColumnKey[] = [
  "date",
  "employee",
  "role",
  "site",
  "shift",
  "timeIn",
  "timeOut",
  "hours",
  "status",
];

export function AttendanceTable({ rows }: { rows: AttendanceRow[] }) {
  const [visible, setVisible] = useState<ColumnKey[]>(DEFAULT_COLUMNS);
  const [pending, startTransition] = useTransition();
  const [correcting, setCorrecting] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState<Set<string>>(new Set());

  // On mount, apply any saved preference (client-only, after hydration).
  useEffect(() => {
    setVisible(loadColumns());
  }, []);

  async function handleCorrect(id: string, formData: FormData) {
    setCorrecting((prev) => new Set([...prev, id]));
    startTransition(async () => {
      const res = await correctAttendanceRecord(undefined as any, formData);
      setCorrecting((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (!res.error) {
        window.dispatchEvent(new CustomEvent("attendance-updated"));
      }
    });
  }

  async function handleReview(id: string, formData: FormData) {
    setReviewing((prev) => new Set([...prev, id]));
    startTransition(async () => {
      const res = await reviewAttendanceRecord(undefined as any, formData);
      setReviewing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (!res.error) {
        window.dispatchEvent(new CustomEvent("attendance-updated"));
      }
    });
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <ColumnPicker visible={visible} onChange={setVisible} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            {visible.map((key) => (
              <TableHead key={key}>{HEADER_LABEL[key]}</TableHead>
            ))}
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={visible.length + 1} className="text-center text-muted-foreground">
                No attendance records match these filters.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={r.id}>
                {visible.includes("date") && (
                  <TableCell>{r.date}</TableCell>
                )}
                {visible.includes("employee") && (
                  <TableCell className="font-medium">{r.employeeName}</TableCell>
                )}
                {visible.includes("role") && (
                  <TableCell>{r.role ?? "\u2014"}</TableCell>
                )}
                {visible.includes("site") && (
                  <TableCell>{r.site ?? "\u2014"}</TableCell>
                )}
                {visible.includes("department") && (
                  <TableCell>{r.department ?? "\u2014"}</TableCell>
                )}
                {visible.includes("shift") && (
                  <TableCell>
                    {r.shift ? (
                      <Badge variant={r.shift === "night" ? "outline" : "secondary"}>
                        {r.shift}
                      </Badge>
                    ) : (
                      "\u2014"
                    )}
                  </TableCell>
                )}
                {visible.includes("timeIn") && (
                  <TableCell>{r.timeIn ?? "\u2014"}</TableCell>
                )}
                {visible.includes("timeOut") && (
                  <TableCell>{r.timeOut ?? "\u2014"}</TableCell>
                )}
                {visible.includes("hours") && (
                  <TableCell>{fmtHours(r.hours)}</TableCell>
                )}
                {visible.includes("status") && (
                  <TableCell>
                    <Badge variant={statusVariant[r.status] ?? "outline"}>
                      {r.status}
                    </Badge>
                    {r.needsReview && (
                      <span
                        className="ml-2 inline-block h-2 w-2 rounded-full bg-amber-500 align-middle"
                        title="Needs review — missing punch or duplicate cleaned"
                      />
                    )}
                    {!r.needsReview && r.corrected && (
                      <span
                        className="ml-2 inline-block h-2 w-2 rounded-full bg-blue-500 align-middle"
                        title="Corrected — original values preserved in audit"
                      />
                    )}
                    {r.corrected && r.originalTimeIn && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        Orig IN: {r.originalTimeIn}
                        {r.originalTimeOut ? ` · Orig OUT: ${r.originalTimeOut}` : ""}
                      </div>
                    )}
                  </TableCell>
                )}
                {visible.includes("inDevice") && (
                  <TableCell>{r.inDevice ?? "\u2014"}</TableCell>
                )}
                {visible.includes("outDevice") && (
                  <TableCell>{r.outDevice ?? "\u2014"}</TableCell>
                )}
                {visible.includes("inOrigin") && (
                  <TableCell>{r.inOrigin ?? "\u2014"}</TableCell>
                )}
                {visible.includes("location") && (
                  <TableCell className="max-w-56 truncate" title={r.inAddress ?? ""}>
                    {r.inAddress ?? "\u2014"}
                  </TableCell>
                )}
                {visible.includes("coords") && (
                  <TableCell className="font-mono text-xs">{r.inCoordinates ?? "\u2014"}</TableCell>
                )}
                <TableCell className="text-right">
                  {correcting.has(r.id) ? (
                    <CorrectForm row={r} onSave={(fd) => handleCorrect(r.id, fd)} pending={pending} />
                  ) : reviewing.has(r.id) ? (
                    <ReviewForm row={r} onSave={(fd) => handleReview(r.id, fd)} pending={pending} />
                  ) : (
                    <div className="flex gap-1">
                      {r.needsReview && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setCorrecting((prev) => new Set([...prev, r.id]))}
                          disabled={pending}
                        >
                          Correct
                        </Button>
                      )}
                      {r.needsReview && r.reviewStatus === "pending" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setReviewing((prev) => new Set([...prev, r.id]))}
                          disabled={pending}
                        >
                          Approve
                        </Button>
                      )}
                      {r.corrected && !r.needsReview && (
                        <Button size="sm" variant="ghost" onClick={() => {}}>
                          History
                        </Button>
                      )}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </>
  );
}

function CorrectForm({
  row,
  onSave,
  pending,
}: {
  row: AttendanceRow;
  onSave: (formData: FormData) => void;
  pending: boolean;
}) {
  return (
    <TableCell colSpan={999} className="p-3 bg-muted/50 border-t">
      <form action={onSave} className="grid grid-cols-2 gap-3 sm:grid-cols-4 items-end">
        <div className="col-span-2 sm:col-span-1">
          <Label className="text-xs text-muted-foreground">Time in</Label>
          <Input
            name="timeIn"
            defaultValue={row.timeIn ?? ""}
            placeholder="HH:mm"
            className="text-xs"
          />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <Label className="text-xs text-muted-foreground">Time out</Label>
          <Input
            name="timeOut"
            defaultValue={row.timeOut ?? ""}
            placeholder="HH:mm"
            className="text-xs"
          />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <Label className="text-xs text-muted-foreground">Shift</Label>
          <select
            name="shift"
            defaultValue={row.shift ?? "day"}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="day">Day</option>
            <option value="night">Night</option>
          </select>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <Label className="text-xs text-muted-foreground">Hours</Label>
          <Input
            name="hoursWorked"
            type="number"
            step="0.5"
            defaultValue={row.hours ?? ""}
            className="text-xs"
          />
        </div>
        <div className="col-span-4">
          <Label className="text-xs text-muted-foreground mb-1">Reason (required)</Label>
          <Textarea
            name="correctionReason"
            rows={2}
            placeholder="e.g. worker forgot clock-out, approved from timesheet"
            className="text-xs"
          />
          <Input type="hidden" name="id" defaultValue={row.id} />
        </div>
        <div className="col-span-4 flex items-end gap-2">
          <Button type="submit" size="sm" variant="secondary" disabled={pending}>
            Save correction
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => {}}>
            Cancel
          </Button>
        </div>
      </form>
    </TableCell>
  );
}

function ReviewForm({
  row,
  onSave,
  pending,
}: {
  row: AttendanceRow;
  onSave: (formData: FormData) => void;
  pending: boolean;
}) {
  return (
    <TableCell colSpan={999} className="p-3 bg-muted/50 border-t">
      <form action={onSave} className="grid grid-cols-2 gap-3 sm:grid-cols-4 items-end">
        <div className="col-span-4">
          <Label className="text-xs text-muted-foreground mb-1">Review note</Label>
          <Textarea
            name="reviewNote"
            rows={2}
            placeholder="e.g. verified against gate log / timesheet"
            className="text-xs"
          />
          <Input type="hidden" name="id" defaultValue={row.id} />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <Label className="text-xs text-muted-foreground">Decision</Label>
          <select
            name="reviewStatus"
            defaultValue="approved"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="approved">Approve</option>
            <option value="rejected">Reject</option>
          </select>
        </div>
        <div className="col-span-4 flex items-end gap-2">
          <Button type="submit" size="sm" variant="secondary" disabled={pending}>
            Save decision
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => {}}>
            Cancel
          </Button>
        </div>
      </form>
    </TableCell>
  );
}