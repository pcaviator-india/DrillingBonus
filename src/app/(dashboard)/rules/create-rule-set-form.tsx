"use client";

import { useState } from "react";
import { useActionState } from "react";
import { createRuleSetAction, type CreateRuleSetState } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BonusTypeParameterForm } from "./components/BonusTypeParameterForm";
import { ChipPicker } from "./components/ChipPicker";
import {
  buildDrillingTypeChipOptions,
  buildRoleAndGroupChipOptions,
  defaultParametersFor,
  type GroupOption,
  type PositionOption,
} from "./components/rule-form-shared";

const initialState: CreateRuleSetState = {};

interface NewRuleFormData {
  bonusTypeId: string;
  bonusTypeCode: string;
  bonusTypeName: string;
  positionFilter: string[];
  drillingTypeFilter: string[];
  priority: number;
  minAttendanceDays: number | null;
  parameters: Record<string, unknown>;
  notes: string;
}

export function CreateRuleSetForm({
  sites,
  bonusTypes,
  positions,
  groups,
}: {
  sites: { id: string; name: string }[];
  bonusTypes: { id: string; code: string; name: string; description: string | null }[];
  positions: PositionOption[];
  groups: GroupOption[];
}) {
  const [state, formAction, pending] = useActionState(createRuleSetAction, initialState);
  const [rules, setRules] = useState<NewRuleFormData[]>(() => [
    {
      bonusTypeId: bonusTypes[0]?.id ?? "",
      bonusTypeCode: bonusTypes[0]?.code ?? "",
      bonusTypeName: bonusTypes[0]?.name ?? "",
      positionFilter: [],
      drillingTypeFilter: [],
      priority: 0,
      minAttendanceDays: null,
      parameters: defaultParametersFor(bonusTypes[0]?.code ?? ""),
      notes: "",
    },
  ]);

  const roleAndGroupOptions = buildRoleAndGroupChipOptions(positions, groups);
  const drillingTypeOptions = buildDrillingTypeChipOptions();

  const addRule = () => {
    const defaultBt = bonusTypes[0];
    if (!defaultBt) return;
    setRules((prev) => [
      ...prev,
      {
        bonusTypeId: defaultBt.id,
        bonusTypeCode: defaultBt.code,
        bonusTypeName: defaultBt.name,
        positionFilter: [],
        drillingTypeFilter: [],
        priority: prev.length,
        minAttendanceDays: null,
        parameters: defaultParametersFor(defaultBt.code),
        notes: "",
      },
    ]);
  };

  const removeRule = (index: number) =>
    setRules((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));

  const updateRule = (index: number, patch: Partial<NewRuleFormData>) => {
    setRules((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const changeBonusType = (index: number, bonusTypeId: string) => {
    const bt = bonusTypes.find((b) => b.id === bonusTypeId);
    if (!bt) return;
    updateRule(index, {
      bonusTypeId: bt.id,
      bonusTypeCode: bt.code,
      bonusTypeName: bt.name,
      parameters: defaultParametersFor(bt.code),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">New Rule Set</CardTitle>
        <CardDescription>
          Add bonus type rules for a site. Each rule references a bonus type with its own parameters.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="siteId">Site</Label>
              <select
                id="siteId"
                name="siteId"
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Rule set name</Label>
              <Input id="name" name="name" placeholder="e.g. 2026 Q3 Rules" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="effectiveFrom">Effective from</Label>
              <Input id="effectiveFrom" name="effectiveFrom" type="date" required />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              Bonus Rules <span className="text-muted-foreground">({rules.length})</span>
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => removeRule(rules.length - 1)}
                disabled={rules.length <= 1}
              >
                Remove last
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addRule}
                disabled={bonusTypes.length === 0}
              >
                Add Rule
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            {rules.map((rule, i) => (
              <div key={i} className="space-y-3 rounded-md border p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Rule #{i + 1} - {rule.bonusTypeName}</p>
                  <input type="hidden" name="bonusTypeId" value={rule.bonusTypeId} />
                  <input type="hidden" name="positionFilter" value={rule.positionFilter.join(", ")} />
                  <input
                    type="hidden"
                    name="drillingTypeFilter"
                    value={rule.drillingTypeFilter.join(", ")}
                  />
                  <input type="hidden" name="parametersJson" value={JSON.stringify(rule.parameters)} />
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
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Bonus Type</Label>
                    <select
                      value={rule.bonusTypeId}
                      onChange={(e) => changeBonusType(i, e.target.value)}
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
                      type="number"
                      value={rule.priority}
                      onChange={(e) => updateRule(i, { priority: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Position Filter</Label>
                    <ChipPicker
                      options={roleAndGroupOptions}
                      selected={rule.positionFilter}
                      onChange={(next) => updateRule(i, { positionFilter: next })}
                      emptyHint="Leave empty to apply to all positions."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Drilling Type Filter</Label>
                    <ChipPicker
                      options={drillingTypeOptions}
                      selected={rule.drillingTypeFilter}
                      onChange={(next) => updateRule(i, { drillingTypeFilter: next })}
                      emptyHint="Leave empty to apply to all drilling types."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Min Attendance Days</Label>
                    <Input
                      type="number"
                      min="0"
                      value={rule.minAttendanceDays ?? ""}
                      onChange={(e) =>
                        updateRule(i, {
                          minAttendanceDays: e.target.value ? parseInt(e.target.value) : null,
                        })
                      }
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Input
                      value={rule.notes}
                      onChange={(e) => updateRule(i, { notes: e.target.value })}
                      placeholder="Optional"
                    />
                  </div>
                </div>
                <input type="hidden" name="positionFilter" value={rule.positionFilter.join(",")} />
                <input type="hidden" name="drillingTypeFilter" value={rule.drillingTypeFilter.join(",")} />
                <input type="hidden" name="parametersJson" value={JSON.stringify(rule.parameters)} />
                <BonusTypeParameterForm
                  bonusTypeCode={rule.bonusTypeCode}
                  value={rule.parameters}
                  onChange={(next) => updateRule(i, { parameters: next })}
                  positions={positions}
                  groups={groups}
                  positionFilter={rule.positionFilter}
                  onPositionFilterChange={(next) => updateRule(i, { positionFilter: next })}
                />
              </div>
            ))}
          </div>

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          {state.success && <p className="text-sm text-green-600">{state.success}</p>}

          <Button type="submit" disabled={pending}>
            {pending ? "Creating..." : "Create Rule Set"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
