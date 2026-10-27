"use client";

import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clearEmployeeTurnsAction, setEmployeeTurnsAction } from "./actions";

export interface TurnGridEmployee {
  id: string;
  fullName: string;
  roleName: string | null;
  siteName: string | null;
}

export interface TurnGridDay {
  date: string; // yyyy-MM-dd
  dayOfMonth: number;
  weekday: string;
}

/** employeeId -> date -> turn */
export type TurnMap = Record<string, Record<string, "A" | "B">>;

interface Props {
  siteId?: string;
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  onClear: () => void;
  daysCount: number;
}

export function TurnToolbar({ siteId, selected, setSelected, onClear, daysCount }: Props) {
  const [note, setNote] = useState("");
  const [setState, setAction, setPending] = useActionState(setEmployeeTurnsAction, {});
  const [clearState, clearAction, clearPending] = useActionState(clearEmployeeTurnsAction, {});

  const selectedEmployeeIds = [...new Set([...selected].map((k) => k.split("|")[0]))];
  const selectedDates = [...new Set([...selected].map((k) => k.split("|")[1]))];
  const selectedCount = selected.size;

  const buildForm = (): FormData => {
    const fd = new FormData();
    fd.set("employeeIds", selectedEmployeeIds.join(","));
    fd.set("dates", selectedDates.join(","));
    if (siteId) fd.set("siteId", siteId);
    if (note.trim()) fd.set("note", note.trim());
    return fd;
  };

  const applyTurn = (turn: "A" | "B") => {
    const fd = buildForm();
    fd.set("turn", turn);
    setAction(fd);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 border rounded-lg p-3 bg-muted/40">
        <span className="text-sm font-medium">
          {selectedCount > 0
            ? `${selectedCount} cell(s) — ${selectedEmployeeIds.length} emp × ${selectedDates.length} day`
            : "Click a day cell to select. Shift-click selects a range, day-header selects a whole column, employee name selects all days."}
        </span>
        {selectedCount > 0 && (
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={() => applyTurn("A")} disabled={setPending}>
              Mark A
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => applyTurn("B")}
              disabled={setPending}
            >
              Mark B
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onClear} disabled={clearPending}>
              Clear
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setSelected(new Set())}>
              Deselect
            </Button>
            <div className="flex items-center gap-1.5">
              <Label htmlFor="turnNote" className="text-xs text-muted-foreground">
                Note
              </Label>
              <Input
                id="turnNote"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="optional"
                className="h-7 w-44"
              />
            </div>
            <span className="text-xs text-muted-foreground">{daysCount} day(s) in view</span>
          </div>
        )}
      </div>
      {(setState.error || clearState.error) && (
        <p className="text-sm text-red-600">{setState.error ?? clearState.error}</p>
      )}
      {(setState.success || clearState.success) && (
        <p className="text-sm text-green-700">{setState.success ?? clearState.success}</p>
      )}
    </div>
  );
}