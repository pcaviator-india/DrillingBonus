"use client";

import { Label } from "@/components/ui/label";
import { NumberField } from "./NumberField";
import { SimpleRateTableBuilder } from "./SimpleRateTableBuilder";
import { asNumber, asSimpleRateTable, type BonusParameterFormProps } from "./rule-form-shared";

/**
 * Guided form for `directional` rules.
 *
 * The rate does not vary by cargo, so this uses the 2-level matrix
 * (drilling type x depth range) and a single hours multiplier.
 */
export function DirectionalForm({ value, onChange }: BonusParameterFormProps) {
  const rateTable = asSimpleRateTable(value.rateTable);

  return (
    <div className="space-y-6">
      <SimpleRateTableBuilder
        value={rateTable}
        onChange={(next) => onChange({ ...value, rateTable: next })}
        rateLabel="Rate per hour"
        hint="Rate paid per directional drilling hour, by drilling type and depth range."
      />
      <div className="space-y-1.5">
        <Label>Hours factor</Label>
        <p className="text-xs text-muted-foreground">
          Multiplier applied to the hours taken from the report (for example 1 for straight hours).
        </p>
        <NumberField
          value={asNumber(value.hoursFactor, 1)}
          zeroAsEmpty={false}
          onCommit={(n) => {
            if (n <= 0) return; // the schema requires a positive factor
            onChange({ ...value, hoursFactor: n });
          }}
        />
      </div>
    </div>
  );
}
