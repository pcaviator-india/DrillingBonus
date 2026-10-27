"use client";

import { AdjustmentTable } from "./adjustment-table";
import { ComparisonExportRow } from "@/lib/export/comparison-export";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { loadComparisonBatches, saveAdjustments, parseComparisonFile } from "./actions";

export default function AdjustmentsPage() {
  const [batches, setBatches] = useState<Array<{ key: string; label?: string; rows: ComparisonExportRow[] }>>([]);
  const [selectedBatches, setSelectedBatches] = useState<string[]>([]);
  const [comparisonRows, setComparisonRows] = useState<ComparisonExportRow[]>([]);
  const [chileLocoEnabled, setChileLocoEnabled] = useState<boolean>(true);
  const [chileLocoMultiplier, setChilleLocoMultiplier] = useState<number>(2);
  const [previewMode, setPreviewMode] = useState<boolean>(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [lastSavedCalcId, setLastSavedCalcId] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    loadComparisonBatches().then((data) => {
      setBatches(data);
      if (data.length > 0) {
        setSelectedBatches([data[0].key]);
      }
    });
  }, []);

  useEffect(() => {
    const rows = batches
      .filter((b) => selectedBatches.includes(b.key))
      .flatMap((b) => b.rows);
    setComparisonRows(rows);
  }, [selectedBatches, batches]);

  const handleSave = async (
    rowsToSave: Array<{ id: string; selection: "P" | "W" | "blank"; cargo: string; note?: string }>
  ) => {
    setSaving(true);
    try {
      const result = await saveAdjustments(
        rowsToSave,
        undefined,
        chileLocoEnabled ? chileLocoMultiplier : 1
      );
      if (result && result.length > 0) {
        setLastSavedCalcId(result[0].calculationId);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Bonus Adjustments</h1>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Upload Comparison Excel</label>
        <input
          type="file"
          accept=".xlsx,.xls,.xlsm"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setSelectedFile(file);
          }}
          className="border rounded px-2 py-1 w-full"
        />
        {selectedFile && (
          <p className="text-xs text-muted-foreground mt-1">{selectedFile.name}</p>
        )}
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Comparison Batch (select one or more)</label>
        <select
          multiple
          value={selectedBatches}
          onChange={(e) => {
            const opts = Array.from(e.target.selectedOptions).map((o) => o.value);
            setSelectedBatches(opts);
          }}
          className="border rounded px-2 py-1 w-full h-40"
        >
          {batches.map((b) => (
            <option key={b.key} value={b.key}>{b.label ?? b.key}</option>
          ))}
        </select>
      </div>

      <div className="mb-4 flex items-center gap-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={chileLocoEnabled}
            onChange={(e) => setChileLocoEnabled(e.target.checked)}
          />
          Chile Chico ×
        </label>
        <input
          type="number"
          min={1}
          max={5}
          step={0.5}
          value={chileLocoMultiplier}
          onChange={(e) => setChilleLocoMultiplier(Number(e.target.value))}
          disabled={!chileLocoEnabled}
          className="border rounded px-2 py-1 w-20"
        />
        <Button
          variant={previewMode ? "default" : "outline"}
          onClick={async () => {
            if (previewMode) {
              setPreviewMode(false);
              return;
            }
            if (selectedFile) {
              const formData = new FormData();
              formData.append("file", selectedFile);
              const data = await parseComparisonFile(formData);
              setBatches(data);
              if (data.length > 0) {
                setSelectedBatches([data[0].key]);
              }
            }
            setPreviewMode(true);
          }}
        >
          {previewMode ? "Hide Preview" : "Preview"}
        </Button>
      </div>

      {previewMode && comparisonRows.length > 0 && (
        <AdjustmentTable
          comparisonRows={comparisonRows}
          onSave={handleSave}
          chileLocoMultiplier={chileLocoMultiplier}
          saving={saving}
          initialSelections={new Map(
            comparisonRows.map((r) => [
              r.workeraCalculationId,
              (r.finalResolution as "P" | "W" | "blank") ?? "blank",
            ])
          )}
        />
      )}

      {lastSavedCalcId && (
        <div className="mt-4 p-4 border rounded bg-green-50">
          <p className="text-sm font-medium mb-2">Adjustments saved successfully!</p>
          <a
            href={`/api/calculations/${lastSavedCalcId}/export-super`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Download Super Detailed Export (Excel)
          </a>
        </div>
      )}
    </div>
  );
}