"use client";

import { Label } from "@/components/ui/label";
import { NumberField } from "./NumberField";
import { asNumber, type BonusParameterFormProps } from "./rule-form-shared";

/**
 * Guided form for `high_altitude` rules: a monthly climate bonus, either
 * divided across the days of the month and paid per day worked (prorated,
 * the default) or paid in full to anyone with daysWorked >= 1 (Coipa).
 */
export function HighAltitudeForm({ value, onChange }: BonusParameterFormProps) {
  const payMode = value.payMode === "full" ? "full" : "prorated";
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Monthly amount (CLP)</Label>
        <p className="text-xs text-muted-foreground">
          Full monthly climate bonus for a worker with complete attendance.
        </p>
        <NumberField value={asNumber(value.monthlyAmount)} onCommit={(n) => onChange({ ...value, monthlyAmount: n })} />
      </div>
      <div className="space-y-1.5">
        <Label>Payment mode</Label>
        <p className="text-xs text-muted-foreground">
          Prorated pays per day worked; full pays the whole amount to anyone with at least 1 day worked.
        </p>
        <select
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={payMode}
          onChange={(e) => onChange({ ...value, payMode: e.target.value })}
        >
          <option value="prorated">Prorated (per day worked)</option>
          <option value="full">Full (daysWorked ≥ 1)</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <Label>Days in month (divisor)</Label>
        <p className="text-xs text-muted-foreground">
          Number of days the monthly amount is divided by. Defaults to 30. Only used in prorated mode.
        </p>
        <NumberField
          value={asNumber(value.daysInMonth, 30)}
          zeroAsEmpty={false}
          onCommit={(n) => {
            if (n < 1) return; // the schema requires a positive integer
            onChange({ ...value, daysInMonth: Math.trunc(n) });
          }}
        />
      </div>
      <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
        {payMode === "full"
          ? `Full payment: $${asNumber(value.monthlyAmount).toLocaleString("es-CL")} CLP for anyone with ≥ 1 day worked.`
          : `Daily rate: ${(asNumber(value.monthlyAmount) / (asNumber(value.daysInMonth, 30) || 30)).toFixed(2)} CLP per day worked.`}
      </p>
    </div>
  );
}
