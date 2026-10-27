"use client";

import { useState, useEffect } from "react";
import type { ComparisonExportRow } from "@/lib/export/comparison-export";
import { Button } from "@/components/ui/button";

export function AdjustmentTable({
  comparisonRows,
  onSave,
  chileLocoMultiplier = 2,
  initialSelections,
  saving = false,
}: {
  comparisonRows: ComparisonExportRow[];
  onSave: (
    selections: Array<{ id: string; selection: "P" | "W" | "blank"; cargo: string; note?: string }>
  ) => void | Promise<void>;
  chileLocoMultiplier?: number;
  initialSelections?: Map<string, "P" | "W" | "blank">;
  saving?: boolean;
}) {
  const [selections, setSelections] = useState<Map<string, "P" | "W" | "blank">>(new Map(initialSelections ?? []));
  useEffect(() => {
    if (initialSelections) {
      setSelections(new Map(initialSelections));
    }
  }, [comparisonRows]);
  const [notes, setNotes] = useState<Map<string, string>>(new Map());

  const handleSelectionChange = (rowId: string, selection: "P" | "W" | "blank") => {
    setSelections((prev) => {
      const next = new Map(prev);
      next.set(rowId, selection);
      return next;
    });
  };

  const handleNoteChange = (rowId: string, note: string) => {
    setNotes((prev) => {
      const next = new Map(prev);
      next.set(rowId, note);
      return next;
    });
  };

  const handleSaveClick = async () => {
    const rowsToSave = comparisonRows.map((row) => ({
      id: row.workeraCalculationId,
      selection: selections.get(row.workeraCalculationId) || "blank",
      cargo: row.cargo,
      note: notes.get(row.workeraCalculationId),
    }));
    await onSave(rowsToSave);
  };

  return (
    <div className="space-y-4">
      <table className="w-full border-collapse border border-gray-300">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-2">Employee</th>
            <th className="border p-2">Cargo</th>
            <th className="border p-2">Workera Days</th>
            <th className="border p-2">Planilla Days</th>
            <th className="border p-2">Selection</th>
            <th className="border p-2">Note</th>
          </tr>
        </thead>
        <tbody>
          {comparisonRows.map((row, index) => (
            <tr key={`${row.workeraCalculationId}-${index}`}>
              <td className="border p-2">{row.employee}</td>
              <td className="border p-2">{row.cargo}</td>
              <td className="border p-2">{row.workeraDays}</td>
              <td className="border p-2">{row.planillaDays}</td>
              <td className="border p-2">
                <select
                  value={selections.get(row.workeraCalculationId) || "blank"}
                  onChange={(e) => handleSelectionChange(row.workeraCalculationId, e.target.value as "P" | "W" | "blank")}
                  className="border rounded px-2 py-1"
                >
                  <option value="P">P (Planilla)</option>
                  <option value="W">W (Workera)</option>
                  <option value="blank">Auto</option>
                </select>
              </td>
              <td className="border p-2">
                <input
                  type="text"
                  value={notes.get(row.workeraCalculationId) || ""}
                  onChange={(e) => handleNoteChange(row.workeraCalculationId, e.target.value)}
                  className="border rounded px-2 py-1 w-full"
                  placeholder="Optional note"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Button onClick={handleSaveClick} disabled={saving || comparisonRows.length === 0}>
        {saving ? "Saving…" : "Save All Adjustments"}
      </Button>
    </div>
  );
}