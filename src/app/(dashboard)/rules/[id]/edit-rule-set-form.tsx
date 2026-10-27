"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { updateRuleSetAction, type UpdateRuleSetState } from "../edit-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BonusTypeParameterForm } from "../components/BonusTypeParameterForm";
import { ChipPicker } from "../components/ChipPicker";
import {
  buildDrillingTypeChipOptions,
  buildRoleAndGroupChipOptions,
  defaultParametersFor,
  type GroupOption,
  type PositionOption,
} from "../components/rule-form-shared";
import Link from "next/link";

const initialState: UpdateRuleSetState = {};

interface RuleFormData {
  id?: string;
  bonusTypeId: string;
  bonusTypeCode: string;
  bonusTypeName: string;
  positionFilter: string[];
  drillingTypeFilter: string[];
  priority: number;
  minAttendanceDays: number | null;
  parameters: Record<string, unknown>;
  notes: string | null;
}

/**
 * Edit form for a rule set.
 *
 * Rules are edited through guided builders rather than a JSON textarea. The
 * structured state is still submitted as comma-separated hidden inputs plus a
 * `parametersJson` hidden input, so the existing server action and Zod schemas
 * keep working unchanged.
 */
export function EditRuleSetForm({
  ruleSet,
  bonusTypes,
  positions,
  groups,
}: {
  ruleSet: {
    id: string;
    name: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    isActive: boolean;
    rules: RuleFormData[];
  };
  bonusTypes: { id: string; code: string; name: string; description: string | null }[];
  positions: PositionOption[];
  groups: GroupOption[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(updateRuleSetAction, initialState);
  const [rules, setRules] = useState<RuleFormData[]>(ruleSet.rules);

  const roleAndGroupOptions = buildRoleAndGroupChipOptions(positions, groups);
  const drillingTypeOptions = buildDrillingTypeChipOptions();

  const addRule = () => {
    const defaultBt = bonusTypes[0];
    setRules([
      ...rules,
      {
        bonusTypeId: defaultBt.id,
        bonusTypeCode: defaultBt.code,
        bonusTypeName: defaultBt.name,
        positionFilter: [],
        drillingTypeFilter: [],
        priority: rules.length,
        minAttendanceDays: null,
        parameters: defaultParametersFor(defaultBt.code),
        notes: null,
      },
    ]);
  };

  const removeRule = (index: number) => setRules(rules.filter((_, i) => i !== index));

  const updateRule = (index: number, field: keyof RuleFormData, value: unknown) => {
    const updated = [...rules];
    if (field === "bonusTypeId") {
      const bt = bonusTypes.find((b) => b.id === value);
      if (bt) {
        updated[index] = {
          ...updated[index],
          bonusTypeId: bt.id,
          bonusTypeCode: bt.code,
          bonusTypeName: bt.name,
          parameters: defaultParametersFor(bt.code),
        };
      }
    } else {
      (updated[index] as unknown as Record<string, unknown>)[field] = value;
    }
    setRules(updated);
  };

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="ruleSetId" value={ruleSet.id} />
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Rule Set Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required defaultValue={ruleSet.name} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="isActive">Status</Label>
              <select
                id="isActive"
                name="isActive"
                defaultValue={String(ruleSet.isActive)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="effectiveFrom">Effective From</Label>
              <Input
                id="effectiveFrom"
                name="effectiveFrom"
                type="date"
                required
                defaultValue={ruleSet.effectiveFrom}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="effectiveTo">Effective To (optional)</Label>
              <Input id="effectiveTo" name="effectiveTo" type="date" defaultValue={ruleSet.effectiveTo ?? ""} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Bonus Rules ({rules.length})</p>
        <Button type="button" variant="outline" size="sm" onClick={addRule}>
          Add Rule
        </Button>
      </div>

      <div className="space-y-4">
        {rules.map((rule, i) => (
          <div key={i} className="rounded-md border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">
                Rule #{i + 1} - {rule.bonusTypeName}
              </p>
              <div className="flex items-center gap-2">
                {/* Always emitted (empty for new rules) so the per-rule arrays stay index-aligned. */}
                <input type="hidden" name="ruleId" value={rule.id ?? ""} />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRule(i)}
                  disabled={rules.length <= 1}
                  className="text-destructive"
                >
                  Remove
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Bonus Type</Label>
                <select
                  name="bonusTypeId"
                  value={rule.bonusTypeId}
                  onChange={(e) => updateRule(i, "bonusTypeId", e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {bonusTypes.map((bt) => (
                    <option key={bt.id} value={bt.id}>
                      {bt.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Input
                  name="priority"
                  type="number"
                  value={rule.priority}
                  onChange={(e) => updateRule(i, "priority", parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-2">
                <Label>Min Attendance Days</Label>
                <Input
                  name="minAttendanceDays"
                  type="number"
                  min="0"
                  value={rule.minAttendanceDays ?? ""}
                  onChange={(e) =>
                    updateRule(i, "minAttendanceDays", e.target.value ? parseInt(e.target.value) : null)
                  }
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Input
                  name="notes"
                  value={rule.notes ?? ""}
                  onChange={(e) => updateRule(i, "notes", e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>

            {/* Structured filters — submitted as comma-separated hidden inputs. */}
            <input type="hidden" name="positionFilter" value={rule.positionFilter.join(", ")} />
            <input type="hidden" name="drillingTypeFilter" value={rule.drillingTypeFilter.join(", ")} />
            <input type="hidden" name="parametersJson" value={JSON.stringify(rule.parameters)} />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label>Position / Group Filter</Label>
                <p className="text-xs text-muted-foreground">
                  Which cargos this rule applies to. Leave empty to apply to everyone.
                </p>
                <ChipPicker
                  options={roleAndGroupOptions}
                  selected={rule.positionFilter}
                  onChange={(next) => updateRule(i, "positionFilter", next)}
                  allowCustom
                  customPlaceholder="Other cargo…"
                  emptyHint="No cargos classified yet — add them on the Positions page."
                />
              </div>
              <div className="space-y-2">
                <Label>Drilling Type Filter</Label>
                <p className="text-xs text-muted-foreground">
                  Limit the rule to certain drilling types. Leave empty to allow all.
                </p>
                <ChipPicker
                  options={drillingTypeOptions}
                  selected={rule.drillingTypeFilter}
                  onChange={(next) => updateRule(i, "drillingTypeFilter", next)}
                  allowCustom
                  customPlaceholder="Other type…"
                />
              </div>
            </div>

            <div className="rounded-md bg-muted/40 p-3">
              <BonusTypeParameterForm
                bonusTypeCode={rule.bonusTypeCode}
                value={rule.parameters}
                onChange={(next) => updateRule(i, "parameters", next)}
                positions={positions}
                groups={groups}
                positionFilter={rule.positionFilter}
                onPositionFilterChange={(next) => updateRule(i, "positionFilter", next)}
              />
            </div>
          </div>
        ))}
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && <p className="text-sm text-green-600">{state.success}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save Changes"}
        </Button>
        <Button asChild variant="outline">
          <Link href="/rules">Cancel</Link>
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.refresh()}>
          Reload
        </Button>
      </div>
    </form>
  );
}
