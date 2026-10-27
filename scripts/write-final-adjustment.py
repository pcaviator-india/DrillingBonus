import os

dir_path = r'c:\Recon\DrillingBonus\src\app\(dashboard)\adjustments'
os.makedirs(dir_path, exist_ok=True)

content = '''import { useState, useEffect, useCallback } from "react";
import { Table, TableHeader, TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/use-toast";
import { resolveFinalRow } from "@/lib/calculations/final-resolution";
import type { ComparisonExportRow } from "@/lib/export/comparison-export";

type OnSaveCallback = (selections: Array<{ id: string; selection: "P" | "W" | "blank"; cargo: string; note?: string }>) => void;

export function AdjustmentTable({
  comparisonRows,
  onSave,
  chileLocoMultiplier = 2,
}: {
  comparisonRows: ComparisonExportRow[];
  onSave: OnSaveCallback;
  chileLocoMultiplier?: number;
}) {
  const [selections, setSelections] = useState<Map<string, "P" | "W" | "blank">>(new Map());
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const initialSelections = new Map<string, "P" | "W" | "blank">();
    comparisonRows.forEach(row => initialSelections.set(row.workeraCalculationId, "blank"));
    setSelections(initialSelections);
  }, [comparisonRows.length]);

  useEffect(() => {
    comparisonRows.forEach(row => {
      const selection = selections.get(row.workeraCalculationId) || "blank";
      const planillaBonus = row.planillaBonus || 0;
      const cargo = row.cargo || "Chofer";
      const mockRow = {
        id: row.workeraCalculationId,
        calculationId: row.workeraCalculationId,
        planillaCalculationId: row.planillaCalculationId,
        employeeId: row.employee,
        siteId: undefined,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        workeraDays: row.workeraDays,
        planillaDays: row.planillaDays,
        workeraBonus: row.workeraBonus,
        planillaBonus: row.planillaBonus,
        difference: (row.workeraBonus || 0) - (row.planillaBonus || 0),
        reviewStatus: row.reviewStatus || "pending",
        differenceFlags: undefined,
        sourceCalculationIds: undefined,
        sourceSiteIds: undefined,
      };
      try {
        const result = resolveFinalRow(mockRow, selection, cargo, planillaBonus);
      } catch (e) {}
    });
  }, [selections, comparisonRows, chileLocoMultiplier]);

  const handleSelectionChange = useCallback((rowCalcId: string, selection: "P" | "W" | "blank") => {
    setSelections(prev => {
      const newSelections = new Map(prev);
      newSelections.set(rowCalcId, selection);
      return newSelections;
    });
  }, []);

  const handleNoteChange = useCallback((rowCalcId: string, note: string) => {
    setNotes(prev => {
      const newNotes = new Map(prev);
      newNotes.set(rowCalcId, note);
      return newNotes;
    });
  }, []);

  const handleBulkApply = useCallback((selection: "P" | "W" | "blank") => {
    setSelections(prev => {
      const newSelections = new Map<string, "P" | "W" | "blank">();
      comparisonRows.forEach(row => newSelections.set(row.workeraCalculationId, selection));
      return newSelections;
    });
    setNotes(new Map());
  }, [comparisonRows]);

  const handleSave = useCallback(async () => {
    setLoading(true);
    const rowsToSave: Array<{ id: string; selection: "P" | "W" | "blank"; cargo: string; note?: string }> = [];
    comparisonRows.forEach(row => {
      const selection = selections.get(row.workeraCalculationId) || "blank";
      const note = notes.get(row.workeraCalculationId) || undefined;
      rowsToSave.push({ id: row.workeraCalculationId, selection, cargo: row.cargo || "Chofer", note });
    });
    try {
      onSave(rowsToSave);
      toast({ title: "Adjustments saved", description: rowsToSave.length + " rows resolved" });
    } catch (err) {
      toast({ title: "Error", description: "Failed to save", variant: "destructive" });
    } finally { setLoading(false); }
  }, [selections, notes, comparisonRows, onSave]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div><div className="font-medium">Total:</div> <div>{comparisonRows.length}</div></div>
        <div><div className="font-medium">P selected:</div> <div>{Array.from(selections.values()).filter(s => s === "P").length}</div></div>
        <div><div className="font-medium">W selected:</div> <div>{Array.from(selections.values()).filter(s => s === "W").length}</div></div>
        <div><div className="font-medium">Auto (blank):</div> <div>{Array.from(selections.values()).filter(s => s === "blank").length}</div></div>
      </div>
      <div className="flex gap-2 mb-3">
        <Button variant="outline" onClick={() => handleBulkApply("P")} disabled={Array.from(selections.values()).every(s => s === "P")}>P to all</Button>
        <Button variant="outline" onClick={() => handleBulkApply("W")} disabled={Array.from(selections.values()).every(s => s === "W")}>W to all</Button>
        <Button variant="outline" onClick={() => handleBulkApply("blank")} disabled={Array.from(selections.values()).every(s => s === "blank")}>Auto to all</Button>
      </div>
      <Table comparisonRows={comparisonRows} selections={selections} onSelectionChange={handleSelectionChange} onNoteChange={handleNoteChange} chileLocoMultiplier={chileLocoMultiplier} />
      <Button onClick={handleSave} disabled={loading} className="w-full">{loading ? "Saving..." : "Save All Adjustments"}</Button>
    </div>
  );
}
'''

file_path = os.path.join(dir_path, 'adjustment-table.tsx')
with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Written successfully:', file_path)