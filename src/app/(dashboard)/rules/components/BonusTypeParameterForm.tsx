"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AboveThresholdForm } from "./AboveThresholdForm";
import { DirectionalForm } from "./DirectionalForm";
import { EndOfSeasonForm } from "./EndOfSeasonForm";
import { HighAltitudeForm } from "./HighAltitudeForm";
import { MonthlyGoalForm } from "./MonthlyGoalForm";
import { ProductionMeterForm } from "./ProductionMeterForm";
import { RawJsonEditor } from "./RawJsonEditor";
import { TerminationForm } from "./TerminationForm";
import type { BonusParameterFormProps, GroupOption, PositionOption } from "./rule-form-shared";

/** Bonus types that have a guided form. Anything else falls back to raw JSON. */
const GUIDED: Record<string, (props: BonusParameterFormProps) => React.ReactElement> = {
  production_meter: ProductionMeterForm,
  above_threshold: AboveThresholdForm,
  monthly_goal: MonthlyGoalForm,
  high_altitude: HighAltitudeForm,
  end_of_season: EndOfSeasonForm,
  directional: DirectionalForm,
  termination_adjustment: TerminationForm,
};

/**
 * Dispatcher that renders the guided, structured editor for a bonus type.
 *
 * The generated object keeps the exact same shape that the engine and the Zod
 * schemas already expect, so nothing downstream changes; the raw-JSON editor
 * stays available as an escape hatch (and as the fallback for a bonus type with
 * no guided form yet).
 */
export function BonusTypeParameterForm({
  bonusTypeCode,
  label = "Rate configuration",
  value,
  onChange,
  positions,
  groups,
  positionFilter,
  onPositionFilterChange,
}: {
  bonusTypeCode: string;
  label?: string;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  positions: PositionOption[];
  groups: GroupOption[];
  positionFilter?: string[];
  onPositionFilterChange?: (next: string[]) => void;
}) {
  const [showJson, setShowJson] = useState(false);
  const Guided = GUIDED[bonusTypeCode];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>{label}</Label>
        <Button type="button" variant="outline" size="sm" onClick={() => setShowJson((v) => !v)}>
          {showJson ? "Hide raw JSON" : "Show raw JSON"}
        </Button>
      </div>

      {!Guided ? (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          No guided form for bonus type &quot;{bonusTypeCode}&quot; yet - edit its parameters as JSON below.
        </p>
      ) : null}

      {showJson ? (
        <RawJsonEditor value={value} onChange={onChange} />
      ) : Guided ? (
        <Guided
          value={value}
          onChange={onChange}
          positions={positions}
          groups={groups}
          positionFilter={positionFilter}
          onPositionFilterChange={onPositionFilterChange}
        />
      ) : (
        <RawJsonEditor value={value} onChange={onChange} />
      )}
    </div>
  );
}
