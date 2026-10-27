"use client";

import { Label } from "@/components/ui/label";
import { NumberField } from "./NumberField";
import { ChipPicker } from "./ChipPicker";
import {
  asNumber,
  asNumberMap,
  buildDrillingTypeChipOptions,
  buildRoleAndGroupChipOptions,
  type BonusParameterFormProps,
} from "./rule-form-shared";

/**
 * Guided form for `monthly_goal` rules: a fixed amount paid to a role when the
 * group reaches a monthly metre goal.
 *
 * Goals are keyed by drilling type (configurable codes) and amounts by role, so
 * a new cargo or a new diameter needs no code change.
 */
export function MonthlyGoalForm({ value, onChange, positions, groups }: BonusParameterFormProps) {
  const goals = asNumberMap(value.goals);
  const amounts = asNumberMap(value.amounts);

  const goalOptions = buildDrillingTypeChipOptions().filter((o) => !(o.value in goals));
  const roleOptions = buildRoleAndGroupChipOptions(positions, groups).filter((o) => !(o.value in amounts));

  const setGoal = (key: string, n: number) => onChange({ ...value, goals: { ...goals, [key]: n } });
  const removeGoal = (key: string) => {
    const next = { ...goals };
    delete next[key];
    onChange({ ...value, goals: next });
  };
  const setAmount = (key: string, n: number) => onChange({ ...value, amounts: { ...amounts, [key]: n } });
  const removeAmount = (key: string) => {
    const next = { ...amounts };
    delete next[key];
    onChange({ ...value, amounts: next });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>1. Monthly goal per drilling type</Label>
        <p className="text-xs text-muted-foreground">
          The metre target that unlocks the fixed amount (use the actual rig goal from the contract).
        </p>
        {Object.keys(goals).length > 0 ? (
          <div className="space-y-2">
            {Object.entries(goals).map(([key, metres]) => (
              <div key={key} className="flex items-center gap-2">
                <span className="w-40 shrink-0 text-sm font-medium">{key}</span>
                <NumberField value={metres} onCommit={(n) => setGoal(key, n)} className="h-8 max-w-40" />
                <span className="text-xs text-muted-foreground">metres / month</span>
                <button
                  type="button"
                  className="text-xs text-destructive underline-offset-4 hover:underline"
                  onClick={() => removeGoal(key)}
                >
                  remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            No goals yet - pick a drilling type below.
          </p>
        )}
        <ChipPicker
          options={goalOptions}
          selected={[]}
          onChange={(added) => {
            if (added.length === 0) return;
            const next = { ...goals };
            for (const k of added) next[k] = next[k] ?? 0;
            onChange({ ...value, goals: next });
          }}
          allowCustom
          customPlaceholder="Custom type, e.g. HQ…"
        />
      </div>

      <div className="space-y-2">
        <Label>2. Amount paid per role</Label>
        <p className="text-xs text-muted-foreground">
          Fixed amount in CLP for each role when the goal is reached.
        </p>
        {Object.keys(amounts).length > 0 ? (
          <div className="space-y-2">
            {Object.entries(amounts).map(([role, amount]) => (
              <div key={role} className="flex items-center gap-2">
                <span className="w-48 shrink-0 text-sm font-medium">{role}</span>
                <NumberField value={amount} onCommit={(n) => setAmount(role, n)} className="h-8 max-w-40" />
                <span className="text-xs text-muted-foreground">CLP</span>
                <button
                  type="button"
                  className="text-xs text-destructive underline-offset-4 hover:underline"
                  onClick={() => removeAmount(role)}
                >
                  remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            No roles yet - pick one below.
          </p>
        )}
        <ChipPicker
          options={roleOptions}
          selected={[]}
          onChange={(added) => {
            if (added.length === 0) return;
            const next = { ...amounts };
            for (const k of added) next[k] = next[k] ?? 0;
            onChange({ ...value, amounts: next });
          }}
          allowCustom
          customPlaceholder="Other cargo..."
        />
        <p className="text-xs text-muted-foreground">
          Total configured: {Object.values(amounts).reduce((a, b) => a + asNumber(b), 0)} CLP
        </p>
      </div>
    </div>
  );
}
