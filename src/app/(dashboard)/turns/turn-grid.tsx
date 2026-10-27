"use client";

import { useMemo, useState } from "react";
import { TurnToolbar, type TurnMap, type TurnGridEmployee, type TurnGridDay } from "./turn-toolbar";
import { TurnTable } from "./turn-table";

export type { TurnMap } from "./turn-toolbar";

interface Props {
  employees: TurnGridEmployee[];
  days: TurnGridDay[];
  initialTurns: TurnMap;
  planillaTurns?: TurnMap;
  siteId?: string;
}

export function TurnGrid({ employees, days, initialTurns, planillaTurns, siteId }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);

  const dayIndex = useMemo(() => {
    const m = new Map<string, number>();
    days.forEach((d, i) => m.set(d.date, i));
    return m;
  }, [days]);

  const key = (empId: string, date: string) => `${empId}|${date}`;

  const toggleCell = (empId: string, date: string): void => {
    const k = key(empId, date);
    const next = new Set(selected);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setSelected(next);
    setAnchor(k);
  };

  const onCellMouseDown = (e: React.MouseEvent, empId: string, date: string): void => {
    e.preventDefault();
    if (!e.shiftKey || !anchor) {
      toggleCell(empId, date);
      return;
    }
    const [anchorEmp, anchorDate] = anchor.split("|");
    if (anchorEmp !== empId) {
      toggleCell(empId, date);
      return;
    }
    const a = dayIndex.get(anchorDate);
    const b = dayIndex.get(date);
    if (a === undefined || b === undefined) return;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const next = new Set(selected);
    for (let i = lo; i <= hi; i++) next.add(key(empId, days[i].date));
    setSelected(next);
    setAnchor(key(empId, date));
  };

  const selectAllEmployeesOnDay = (date: string): void => {
    const next = new Set(selected);
    for (const emp of employees) next.add(key(emp.id, date));
    setSelected(next);
    setAnchor(`${employees[0]?.id ?? ""}|${date}`);
  };

  const selectEmployeeAllDays = (empId: string): void => {
    const next = new Set(selected);
    for (const d of days) next.add(key(empId, d.date));
    setSelected(next);
  };

  const onClear = (): void => {
    setSelected(new Set());
  };

  return (
    <div className="space-y-4">
      <TurnToolbar
        siteId={siteId}
        selected={selected}
        setSelected={setSelected}
        onClear={onClear}
        daysCount={days.length}
      />
      <TurnTable
        employees={employees}
        days={days}
        initialTurns={initialTurns}
        planillaTurns={planillaTurns}
        selected={selected}
        toggleCell={toggleCell}
        onCellMouseDown={onCellMouseDown}
        selectAllEmployeesOnDay={selectAllEmployeesOnDay}
        selectEmployeeAllDays={selectEmployeeAllDays}
      />
    </div>
  );
}