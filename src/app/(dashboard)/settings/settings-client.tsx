"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { exportDatabaseAction, saveSettingsAction } from "./actions";

export function SettingsClient({ initialSettings }: { initialSettings: Awaited<ReturnType<typeof import("@/lib/settings").getSettings>> }) {
  const [exportState, setExportState] = useState<{ data?: string; error?: string }>({});

  const handleExport = async () => {
    setExportState({ data: "loading" }); // Use a marker to show loading
    const result = await exportDatabaseAction();
    setExportState(result);
    if (result.data && result.data !== "loading") {
      const blob = new Blob([result.data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `drilling-bonus-export-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <form action={saveSettingsAction as any} className="space-y-6">
        <div className="rounded border p-4 space-y-3">
          <h2 className="font-semibold">Clock upload to Workera</h2>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="autoUploadClocksToWorkera" defaultChecked={initialSettings.autoUploadClocksToWorkera} />
            Auto-upload biometric punches to Workera
          </label>
          <p className="text-sm text-muted-foreground">When off, automatic upload is disabled. There is no manual upload button on the Sync page.</p>
        </div>
        <div className="rounded border p-4 space-y-3">
          <h2 className="font-semibold">Workera → DB sync</h2>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="autoSyncWorkeraToDb" defaultChecked={initialSettings.autoSyncWorkeraToDb} />
            Auto-sync Workera attendance into our database
          </label>
          <div>
            <label className="block text-sm mb-1">Frequency</label>
            <select name="autoSyncWorkeraFrequency" defaultValue={initialSettings.autoSyncWorkeraFrequency} className="border rounded p-1">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="10days">Every 10 days</option>
            </select>
          </div>
        </div>
        <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded">Save</button>
      </form>

      <div className="rounded border p-4 space-y-3">
        <h2 className="font-semibold">Database Export</h2>
        <p className="text-sm text-muted-foreground">Export all database data as JSON (admin only). Includes all tables: sites, employees, rules, calculations, positions, uploads, etc.</p>
        <Button variant="outline" onClick={handleExport} disabled={exportState.data === "loading"}>
          {exportState.data === "loading" ? "Exporting…" : "Export Database (JSON)"}
        </Button>
        {exportState.error && <p className="text-sm text-destructive">{exportState.error}</p>}
      </div>
    </div>
  );
}