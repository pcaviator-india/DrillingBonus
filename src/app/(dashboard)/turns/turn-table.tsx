"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TurnGridEmployee, TurnGridDay, TurnMap } from "./turn-toolbar";

const DAYS = ["D", "L", "M", "X", "J", "V", "S"];

interface Props {
  employees: TurnGridEmployee[];
  days: TurnGridDay[];
  initialTurns: TurnMap;
  /** Turns auto-derived from the uploaded planilla, shown as the editable default. */
  planillaTurns?: TurnMap;
  selected: Set<string>;
  toggleCell: (empId: string, date: string) => void;
  onCellMouseDown: (e: React.MouseEvent, empId: string, date: string) => void;
  selectAllEmployeesOnDay: (date: string) => void;
  selectEmployeeAllDays: (empId: string) => void;
}

export function TurnTable(props: Props) {
  const {
    employees,
    days,
    initialTurns,
    planillaTurns,
    selected,
    toggleCell,
    onCellMouseDown,
    selectAllEmployeesOnDay,
    selectEmployeeAllDays,
  } = props;

  // Keep a stable view of cell values (from server). The parent owns selection.
  // Cells show their saved turn value when not selected; when selected they are
  // highlighted so the admin can see what will be changed.
  const key = (empId: string, date: string) => `${empId}|${date}`;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-max">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 bg-background">Employee</TableHead>
              {days.map((d) => (
                <TableHead
                  key={d.date}
                  className="px-1 text-center"
                  title={format(new Date(`${d.date}T00:00:00Z`), "EEE d MMM")}
                >
                  <button
                    type="button"
                    className="block w-8 cursor-pointer hover:bg-muted rounded"
                    onClick={() => selectAllEmployeesOnDay(d.date)}
                    title={`Select all on ${d.date}`}
                  >
                    <span className="block text-[10px] text-muted-foreground">
                      {DAYS[new Date(`${d.date}T00:00:00Z`).getUTCDay()]}
                    </span>
                    <span className="block font-medium text-xs">{d.dayOfMonth}</span>
                  </button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((emp) => (
              <TableRow key={emp.id}>
                <TableCell className="sticky left-0 bg-background font-medium min-w-[180px]">
                  <button
                    type="button"
                    onClick={() => selectEmployeeAllDays(emp.id)}
                    className="text-left hover:underline"
                    title="Select all days for this employee"
                  >
                    {emp.fullName}
                  </button>
                  <span className="block text-xs text-muted-foreground">
                    {emp.roleName ?? "—"}
                    {emp.siteName ? ` · ${emp.siteName}` : ""}
                  </span>
                </TableCell>
                {days.map((d) => {
                  const manual = initialTurns[emp.id]?.[d.date];
                  const fromPlanilla = planillaTurns?.[emp.id]?.[d.date];
                  // Manual schedule wins; otherwise fall back to the planilla-derived
                  // turn as an editable default (a dashed underline marks auto cells).
                  const t = manual ?? fromPlanilla;
                  const isPlanilla = !manual && fromPlanilla !== undefined;
                  const isSel = selected.has(key(emp.id, d.date));
                  const box = isSel
                    ? "ring-2 ring-offset-1 ring-blue-400 font-bold text-black"
                    : t === "A"
                      ? "bg-green-100 text-green-800"
                      : t === "B"
                        ? "bg-violet-100 text-violet-800"
                        : "text-muted-foreground";
                  return (
                    <TableCell key={d.date} className="p-0 text-center">
                      <button
                        type="button"
                        onMouseDown={(e) => onCellMouseDown(e, emp.id, d.date)}
                        className={`inline-flex h-8 w-8 items-center justify-center rounded text-xs font-semibold ${box}${
                          isPlanilla ? " underline decoration-dotted decoration-2 underline-offset-4" : ""
                        }`}
                        title={
                          format(new Date(`${d.date}T00:00:00Z`), "EEE d MMM") +
                          (isPlanilla ? " — from planilla (click to override)" : "")
                        }
                      >
                        {t || ""}
                      </button>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}