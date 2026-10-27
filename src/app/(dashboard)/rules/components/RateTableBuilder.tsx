"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DRILLING_TYPES, ALL_DRILLING_TYPES, DEPTH_SCALES, depthScaleLower } from "@/lib/bonus-engine/rate-config";
import { ChipPicker } from "./ChipPicker";
import { NumberField } from "./NumberField";
import {
  buildDepthScaleOptions,
  buildDrillingTypeChipOptions,
  countRates,
  drillingTypeLabel,
  getRate,
  pruneDrillingType,
  pruneRole,
  pruneScale,
  setRate,
  tableRoles,
  tableScales,
  type ChipOption,
  type RateTable,
} from "./rule-form-shared";

/**
 * Guided editor for the 3-level rate table used by `production_meter` and
 * `above_threshold` rules.
 *
 * This is the "select, don't type JSON" flow: the user picks the drilling types
 * (HQ/NQ/PQ/RC/...), the depth ranges (tramos) and the roles/cargos, then types
 * a rate into the resulting grid. Deselecting a chip prunes the matching rates,
 * so the saved JSON only ever contains what the grid shows.
 *
 * The option selections live in component state (seeded from whatever the rule
 * already contains) while the rates themselves are owned by the parent, which
 * keeps the emitted JSON identical to the format the engine already expects.
 */
export function RateTableBuilder({
  value,
  onChange,
  roleOptions,
  rolesLabel = "Roles / Cargos",
  hint,
}: {
  value: RateTable;
  onChange: (next: RateTable) => void;
  /** Available roles/cargos, optionally grouped by bonus group. */
  roleOptions: ChipOption[];
  rolesLabel?: string;
  hint?: string;
}) {
  const [drillingTypes, setDrillingTypes] = useState<string[]>(() => {
    const fromTable = Object.keys(value);
    return fromTable.length > 0 ? fromTable : [DRILLING_TYPES[0].code];
  });
  const [depthScales, setDepthScales] = useState<string[]>(() => {
    const fromTable = tableScales(value);
    return fromTable.length > 0 ? fromTable : [...DEPTH_SCALES];
  });
  const [roles, setRoles] = useState<string[]>(() => tableRoles(value));

  const handleDrillingTypesChange = (next: string[]) => {
    let table = value;
    let changed = false;
    for (const dt of drillingTypes) {
      if (!next.includes(dt)) {
        table = pruneDrillingType(table, dt);
        changed = true;
      }
    }
    if (changed) onChange(table);
    setDrillingTypes(next);
  };

  const handleDepthScalesChange = (next: string[]) => {
    let table = value;
    let changed = false;
    for (const scale of depthScales) {
      if (!next.includes(scale)) {
        table = pruneScale(table, scale);
        changed = true;
      }
    }
    if (changed) onChange(table);
    setDepthScales(next);
  };

  const handleRolesChange = (next: string[]) => {
    let table = value;
    let changed = false;
    for (const role of roles) {
      if (!next.includes(role)) {
        table = pruneRole(table, role);
        changed = true;
      }
    }
    if (changed) onChange(table);
    setRoles(next);
  };

  const orderedTypes = useMemo(() => {
    const order = ALL_DRILLING_TYPES.map((d) => d.code);
    return [...drillingTypes].sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  }, [drillingTypes]);

  const orderedScales = useMemo(
    () => [...depthScales].sort((a, b) => depthScaleLower(a) - depthScaleLower(b) || a.localeCompare(b)),
    [depthScales],
  );

  const rateCount = countRates(value);
  const hasGrid = orderedTypes.length > 0 && orderedScales.length > 0 && roles.length > 0;

  return (
    <div className="space-y-5">
      {/* 1. Drilling types */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>1. Drilling types</Label>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleDrillingTypesChange(DRILLING_TYPES.map((d) => d.code))}
            >
              Select all
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleDrillingTypesChange([])}
              disabled={drillingTypes.length === 0}
            >
              Clear
            </Button>
          </div>
        </div>
        <ChipPicker
          options={buildDrillingTypeChipOptions()}
          selected={drillingTypes}
          onChange={handleDrillingTypesChange}
          allowCustom
          customPlaceholder="Add custom type, e.g. HQ, N1…"
        />
        <p className="text-xs text-muted-foreground">
          Type your own code and press Add — custom types (HQ, N1, …) work everywhere standard ones do.
          Use “Remove type” on a grid below to delete a type and its rates.
        </p>
      </div>

      {/* 2. Depth ranges */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>2. Depth ranges (tramos, metres)</Label>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleDepthScalesChange(DEPTH_SCALES.slice())}
            >
              Standard
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleDepthScalesChange([])}
              disabled={depthScales.length === 0}
            >
              Clear
            </Button>
          </div>
        </div>
        <ChipPicker
          options={buildDepthScaleOptions(orderedScales)}
          selected={depthScales}
          onChange={handleDepthScalesChange}
          allowCustom
          customPlaceholder="e.g. 0-200"
        />
        <p className="text-xs text-muted-foreground">
          Add your own ranges when a contract pays different tramos (for example 0-200 / 200-400 / 400-600).
        </p>
      </div>

      {/* 3. Roles / cargos */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>3. {rolesLabel}</Label>
          {roles.length > 0 ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => handleRolesChange([])}>
              Clear
            </Button>
          ) : null}
        </div>
        <ChipPicker
          options={roleOptions}
          selected={roles}
          onChange={handleRolesChange}
          allowCustom
          customPlaceholder="Other cargo..."
          emptyHint="No cargos classified yet - add them on the Positions page."
        />
      </div>

      {/* 4. Rates */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>4. Rates per metre</Label>
          <Badge variant="secondary">{rateCount} rate(s) configured</Badge>
        </div>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}

        {hasGrid ? (
          <div className="space-y-4">
            {orderedTypes.map((dt) => (
              <div key={dt} className="space-y-2 rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{drillingTypeLabel(dt)}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => handleDrillingTypesChange(drillingTypes.filter((x) => x !== dt))}
                  >
                    Remove type
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-28">Range (m)</TableHead>
                        {roles.map((role) => (
                          <TableHead key={role} className="min-w-28">
                            {role}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orderedScales.map((scale) => (
                        <TableRow key={scale}>
                          <TableCell className="font-medium text-muted-foreground">{scale}</TableCell>
                          {roles.map((role) => (
                            <TableCell key={role}>
                              <NumberField
                                value={getRate(value, dt, scale, role)}
                                onCommit={(n) => onChange(setRate(value, dt, scale, role, n))}
                                placeholder="-"
                                className="h-8"
                              />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            {roles.length === 0
              ? "Select at least one role/cargo in step 3 to start entering rates."
              : "Select at least one drilling type (step 1) and one depth range (step 2)."}
          </p>
        )}
      </div>
    </div>
  );
}
