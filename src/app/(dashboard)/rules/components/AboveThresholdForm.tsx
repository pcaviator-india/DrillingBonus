"use client";

import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { ChipPicker } from "./ChipPicker";
import { NumberField } from "./NumberField";
import { RateTableBuilder } from "./RateTableBuilder";
import { CheckboxField } from "./SelectField";
import {
  asBool,
  asNumber,
  asNumberMap,
  asRateTable,
  buildDrillingTypeChipOptions,
  buildRoleAndGroupChipOptions,
  tableScales,
  type BonusParameterFormProps,
  type ChipOption,
} from "./rule-form-shared";

/**
 * Guided form for `above_threshold` rules: metres drilled past a per-drilling-
 * type threshold are paid at a multiplied base rate.
 *
 * The threshold keys are chosen from the same configurable drilling types as
 * the rate table, so a new diameter only has to be enabled in one place.
 */
export function AboveThresholdForm({
  value,
  onChange,
  positions,
  groups,
}: BonusParameterFormProps) {
  const thresholds = useMemo(() => asNumberMap(value.thresholds), [value.thresholds]);
  const baseRateTable = useMemo(() => asRateTable(value.baseRateTable), [value.baseRateTable]);
  const roleOptions = useMemo(() => buildRoleAndGroupChipOptions(positions, groups), [positions, groups]);

  const thresholdOptions: ChipOption[] = buildDrillingTypeChipOptions();
  const availableThresholds = thresholdOptions.filter((o) => !(o.value in thresholds));

  const setThreshold = (key: string, n: number) =>
    onChange({ ...value, thresholds: { ...thresholds, [key]: n } });

  const removeThreshold = (key: string) => {
    const next = { ...thresholds };
    delete next[key];
    onChange({ ...value, thresholds: next });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>1. Monthly threshold per drilling type</Label>
        <p className="text-xs text-muted-foreground">
          Metres that must be drilled before the multiplier applies. Only metres above the threshold are paid.
        </p>
        {Object.keys(thresholds).length > 0 ? (
          <div className="space-y-2">
            {Object.entries(thresholds).map(([key, metres]) => (
              <div key={key} className="flex items-center gap-2">
                <span className="w-40 shrink-0 text-sm font-medium">{key}</span>
                <NumberField value={metres} onCommit={(n) => setThreshold(key, n)} className="h-8 max-w-40" />
                <span className="text-xs text-muted-foreground">metres / month</span>
                <button
                  type="button"
                  className="text-xs text-destructive underline-offset-4 hover:underline"
                  onClick={() => removeThreshold(key)}
                >
                  remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            No thresholds yet - pick a drilling type below.
          </p>
        )}
        <ChipPicker
          options={availableThresholds}
          selected={[]}
          onChange={(added) => {
            if (added.length === 0) return;
            const next = { ...thresholds };
            for (const k of added) next[k] = next[k] ?? 0;
            onChange({ ...value, thresholds: next });
          }}
          allowCustom
          customPlaceholder="Custom type, e.g. HQ…"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Multiplier</Label>
          <p className="text-xs text-muted-foreground">
            Factor applied to the base rate for metres above the threshold (for example 1.5).
          </p>
          <NumberField value={asNumber(value.multiplier, 1)} onCommit={(n) => onChange({ ...value, multiplier: n })} />
        </div>
        <div className="flex items-center">
          <CheckboxField
            label="Pay only the increment"
            description="Compute the bonus on the excess metres only, instead of all metres."
            checked={asBool(value.incrementOnly)}
            onChange={(on) => onChange({ ...value, incrementOnly: on })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>2. Base rates</Label>
        <p className="text-xs text-muted-foreground">
          Rates used before the multiplier is applied, by drilling type, depth range and role.
        </p>
        <RateTableBuilder
          value={baseRateTable}
          onChange={(next) => onChange({ ...value, baseRateTable: next })}
          roleOptions={roleOptions}
          hint={`Depth ranges currently used: ${tableScales(baseRateTable).join(", ") || "none yet"}`}
        />
      </div>
    </div>
  );
}
