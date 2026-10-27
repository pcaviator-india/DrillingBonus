"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberField } from "./NumberField";
import { CheckboxField } from "./SelectField";
import { asBool, asNumber, asString, withoutKey, type BonusParameterFormProps } from "./rule-form-shared";

/**
 * Guided form for `termination_adjustment` rules.
 *
 * This rule acts as a gate: the multiplier scales every other bonus for the
 * employee (0 = everything withheld, 1 = no adjustment).
 */
export function TerminationForm({ value, onChange }: BonusParameterFormProps) {
  const multiplier = asNumber(value.terminationMultiplier, 1);

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label>Termination multiplier (0 to 1)</Label>
        <p className="text-xs text-muted-foreground">
          Scales all other bonuses for this employee. 0 withholds everything, 1 leaves them untouched, 0.5 pays
          half.
        </p>
        <NumberField
          value={multiplier}
          zeroAsEmpty={false}
          onCommit={(n) => onChange({ ...value, terminationMultiplier: Math.max(0, Math.min(1, n)) })}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Reason</Label>
        <p className="text-xs text-muted-foreground">
          Shown in the audit trail of every calculation that used this rule.
        </p>
        <Input
          value={asString(value.reason)}
          onChange={(e) => onChange({ ...value, reason: e.target.value })}
          placeholder="For example: resignation mid-season"
        />
      </div>

      <div className="space-y-3">
        <CheckboxField
          label="Witness orientation OK"
          description="Confirmation that the handover orientation was witnessed."
          checked={asBool(value.witnessOrientationOk)}
          onChange={(on) =>
            onChange(on ? { ...value, witnessOrientationOk: true } : withoutKey(value, "witnessOrientationOk"))
          }
        />
        <CheckboxField
          label="Equipment notification OK"
          description="Confirmation that equipment was returned / notified."
          checked={asBool(value.equipmentNotificationOk)}
          onChange={(on) =>
            onChange(on ? { ...value, equipmentNotificationOk: true } : withoutKey(value, "equipmentNotificationOk"))
          }
        />
      </div>
    </div>
  );
}
