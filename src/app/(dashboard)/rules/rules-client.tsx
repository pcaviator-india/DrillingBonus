"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { exportRulesAction } from "./actions";

export function RulesExportButton() {
  const [exportState, setExportState] = useState<{ data?: string; error?: string }>({});

  const handleExport = async () => {
    setExportState({ data: "loading" });
    const result = await exportRulesAction();
    setExportState(result);
    if (result.data && result.data !== "loading") {
      const blob = new Blob([result.data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `drilling-bonus-rules-export-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" onClick={handleExport} disabled={exportState.data === "loading"}>
        {exportState.data === "loading" ? "Exporting…" : "Export Rules (JSON)"}
      </Button>
      {exportState.error && <span className="text-sm text-destructive">{exportState.error}</span>}
    </div>
  );
}