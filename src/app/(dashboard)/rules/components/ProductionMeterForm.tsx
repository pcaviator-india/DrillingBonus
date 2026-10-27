"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AliasEditor } from "./AliasEditor";
import { ChipPicker } from "./ChipPicker";
import { CheckboxField, SelectField } from "./SelectField";
import { NumberField } from "./NumberField";
import { RateTableBuilder } from "./RateTableBuilder";
import {
  asNumber,
  asRateTable,
  asRecord,
  asString,
  asStringMap,
  buildRoleAndGroupChipOptions,
  tableRoles,
  tableScales,
  withoutKey,
  type BonusParameterFormProps,
  type ChipOption,
} from "./rule-form-shared";

const BEST_RIG_MODES: ChipOption[] = [
  { value: "employee_rig_month", label: "Own rig of the month (employee_rig_month)" },
  { value: "employee_rig", label: "Rig worked, per shift (employee_rig)" },
  { value: "best_rig_month", label: "Best rig of the month (best_rig_month)" },
];

const DIVISOR_MODES: ChipOption[] = [
  { value: "days_in_month", label: "Standard fixed month (30 days)" },
  { value: "fixed", label: "Custom fixed number of days" },
];

/**
 * Guided form for `production_meter` rules.
 *
 * Covers the whole memo structure with no JSON: the rate matrix
 * (drilling type x depth range x role) plus the MEJOR MAQUINA block, which is
 * where "best rig for Group 1 / Group 2" is configured by choosing the bonus
 * group (position filter) and the rate column (rateKey) the group is paid on.
 */
export function ProductionMeterForm({
  value,
  onChange,
  positions,
  groups,
  positionFilter,
  onPositionFilterChange,
}: BonusParameterFormProps) {
  const rateTable = useMemo(() => asRateTable(value.rateTable), [value.rateTable]);
  const bestRigSelection = asString(value.bestRigSelection) || "employee_rig_month";
  const isBestRig = bestRigSelection === "best_rig_month";
  const bestRigRule = asRecord(value.bestRigRule);
  const prorate = asRecord(value.attendanceProrate);
  const divisorMode = asString(prorate.divisor) === "days_in_month" ? "days_in_month" : "fixed";

  const roleOptions = buildRoleAndGroupChipOptions(positions, groups);

  /** Roles available as the best-rig rate column: whatever the table prices. */
  const rateColumnOptions: ChipOption[] = useMemo(() => {
    const priced = tableRoles(rateTable);
    if (priced.length > 0) return priced.map((r) => ({ value: r, label: r, groupLabel: "Priced roles" }));
    return groups.map((g) => ({ value: g.key, label: `${g.name} (${g.key})`, groupLabel: "Bonus groups" }));
  }, [rateTable, groups]);

  const patch = (partial: Record<string, unknown>) => onChange({ ...value, ...partial });

  return (
    <div className="space-y-6">
      <RateTableBuilder
        value={rateTable}
        onChange={(next) => patch({ rateTable: next })}
        roleOptions={roleOptions}
        hint="Rate per metre paid to each role, by drilling type and depth range (tramo)."
      />

      <div className="space-y-4 rounded-md border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>Meter counting basis</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(withoutKey(value, "depthScaleAliases"))}
            disabled={!value.depthScaleAliases}
          >
            Clear aliases
          </Button>
        </div>
        <SelectField
          label="Best rig selection"
          value={bestRigSelection}
          onChange={(v) => patch({ bestRigSelection: v })}
          options={BEST_RIG_MODES}
        />
        <details className="rounded-md border p-2">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            Depth band aliases (report band to tramo)
          </summary>
          <div className="pt-3">
            <AliasEditor
              label="Depth scale aliases"
              description="Map the drilling bands of the source report onto the tramos used in the rate table."
              value={asStringMap(value.depthScaleAliases)}
              onChange={(next) =>
                onChange(Object.keys(next).length > 0 ? { ...value, depthScaleAliases: next } : withoutKey(value, "depthScaleAliases"))
              }
              targetOptions={tableScales(rateTable)}
            />
          </div>
        </details>
      </div>

      {isBestRig ? (
        <div className="space-y-4 rounded-md border border-primary/40 bg-muted/30 p-3">
          <div className="space-y-1">
            <Label>Best rig of the month (MEJOR MAQUINA)</Label>
            <p className="text-xs text-muted-foreground">
              Everyone in the selected group is paid on the rig with the best monthly performance. Group 1
              (supervision and staff) is normally paid on the driller column and Group 2 (drilling crew) on the
              helper column; both are configured here as separate rules.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Bonus group this rule applies to</Label>
            {onPositionFilterChange && groups.length > 0 ? (
              <ChipPicker
                options={groups.map((g) => ({
                  value: g.key,
                  label: `${g.name} (${g.key})`,
                  groupLabel: "Bonus groups",
                }))}
                selected={positionFilter ?? []}
                onChange={onPositionFilterChange}
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                Set the rule&apos;s position filter to a bonus group (for example group1 or group2) to scope this
                rule.
              </p>
            )}
          </div>

          <SelectField
            label="Rate column used for this group (rateKey)"
            description="Which priced role column of the rate matrix above this group is paid on."
            value={asString(value.rateKey)}
            onChange={(v) => patch(v ? { rateKey: v } : { rateKey: undefined })}
            options={rateColumnOptions}
            placeholder="- employee's own role -"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>AR threshold (metres)</Label>
              <p className="text-xs text-muted-foreground">
                The top aire-reverso rig wins only when it exceeds this monthly total; otherwise the top
                diamantina rig wins.
              </p>
              <NumberField
                value={asNumber(bestRigRule.arThresholdMeters)}
                onCommit={(n) => patch({ bestRigRule: { ...bestRigRule, arThresholdMeters: n } })}
                placeholder="e.g. 2500"
              />
            </div>
            <div className="space-y-2">
              <CheckboxField
                label="Prorate by attendance"
                description="Pay the group's share in proportion to days worked."
                checked={Object.keys(prorate).length > 0}
                onChange={(on) =>
                  on
                    ? patch({ attendanceProrate: { divisor: "days_in_month" } })
                    : onChange(withoutKey(value, "attendanceProrate"))
                }
              />
              {Object.keys(prorate).length > 0 ? (
                <div className="space-y-2 pl-6">
                  <SelectField
                    label="Divisor"
                    value={divisorMode}
                    onChange={(v) =>
                      patch({
                        attendanceProrate: v === "days_in_month" ? { divisor: "days_in_month" } : { divisor: 30 },
                      })
                    }
                    options={DIVISOR_MODES}
                  />
                  {divisorMode === "fixed" ? (
                    <div className="space-y-1.5">
                      <Label>Fixed number of days</Label>
                      <NumberField
                        value={typeof prorate.divisor === "number" ? prorate.divisor : 30}
                        zeroAsEmpty={false}
                        onCommit={(n) => {
                          if (n < 1) return; // the schema requires a positive integer
                          patch({ attendanceProrate: { divisor: Math.trunc(n) } });
                        }}
                      />
                    </div>
                  ) : null}
                  <div className="space-y-1.5 pt-2">
                    <Label>Shift split factor (optional)</Label>
                    <p className="text-xs text-muted-foreground">
                      Divide the total production before prorating (e.g. 2 for Chile Chico / Dos Amigos where day+night production is divided by 2).
                    </p>
                    <NumberField
                      value={asNumber(value.splitFactor)}
                      placeholder="1 (no division)"
                      onCommit={(n) =>
                        onChange(n > 1 ? { ...value, splitFactor: n } : withoutKey(value, "splitFactor"))
                      }
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label>Max metres per shift (optional)</Label>
        <p className="text-xs text-muted-foreground">
          Cap applied to a single shift before the rate is calculated.
        </p>
        <NumberField
          value={asNumber(value.maxMetersPerShift)}
          onCommit={(n) =>
            onChange(n > 0 ? { ...value, maxMetersPerShift: n } : withoutKey(value, "maxMetersPerShift"))
          }
          placeholder="no cap"
        />
      </div>
    </div>
  );
}
