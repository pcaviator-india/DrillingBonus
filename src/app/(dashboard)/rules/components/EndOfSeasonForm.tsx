"use client";

import { Label } from "@/components/ui/label";
import { NumberField } from "./NumberField";
import { asNumber, withoutKey, type BonusParameterFormProps } from "./rule-form-shared";

/**
 * Guided form for `end_of_season` rules: the season-end payment, with optional
 * excellence / attendance weighting factors.
 *
 * `baseSalary` is a fallback used when no salary is available from attendance;
 * it can be left at 0 to always use the payroll figure.
 */
export function EndOfSeasonForm({ value, onChange }: BonusParameterFormProps) {
  const excellence = value.excellenceWeight;
  const attendance = value.attendanceWeight;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Salary multiplier</Label>
          <p className="text-xs text-muted-foreground">Months of salary paid at season end.</p>
          <NumberField
            value={asNumber(value.salaryMultiplier, 1)}
            onCommit={(n) => onChange({ ...value, salaryMultiplier: n })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Total days</Label>
          <p className="text-xs text-muted-foreground">Days the season is pro-rated over.</p>
          <NumberField
            value={asNumber(value.totalDays, 30)}
            zeroAsEmpty={false}
            onCommit={(n) => {
              if (n < 1) return;
              onChange({ ...value, totalDays: Math.trunc(n) });
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Base salary (fallback)</Label>
          <p className="text-xs text-muted-foreground">Used only when attendance has no salary figure.</p>
          <NumberField value={asNumber(value.baseSalary)} onCommit={(n) => onChange({ ...value, baseSalary: n })} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Excellence weight (0 to 1, optional)</Label>
          <p className="text-xs text-muted-foreground">
            Share of the payment driven by the excellence factor. Leave empty when the memo does not use it.
          </p>
          <NumberField
            value={typeof excellence === "number" ? excellence : 0}
            onCommit={(n) =>
              onChange(
                n > 0
                  ? { ...value, excellenceWeight: Math.min(1, n) }
                  : withoutKey(value, "excellenceWeight"),
              )
            }
            placeholder="not used"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Attendance weight (0 to 1, optional)</Label>
          <p className="text-xs text-muted-foreground">
            Share of the payment driven by attendance. Leave empty when the memo does not use it.
          </p>
          <NumberField
            value={typeof attendance === "number" ? attendance : 0}
            onCommit={(n) =>
              onChange(
                n > 0 ? { ...value, attendanceWeight: Math.min(1, n) } : withoutKey(value, "attendanceWeight"),
              )
            }
            placeholder="not used"
          />
        </div>
      </div>
    </div>
  );
}
