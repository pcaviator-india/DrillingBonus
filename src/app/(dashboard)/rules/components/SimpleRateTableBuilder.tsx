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
import { DRILLING_TYPES, DEPTH_SCALES, depthScaleLower } from "@/lib/bonus-engine/rate-config";
import { ChipPicker } from "./ChipPicker";
import { NumberField } from "./NumberField";
import {
  buildDepthScaleOptions,
  buildDrillingTypeChipOptions,
  countSimpleRates,
  drillingTypeLabel,
  getSimpleRate,
  pruneSimpleDrillingType,
  pruneSimpleScale,
  setSimpleRate,
  type SimpleRateTable,
} from "./rule-form-shared";

/**
 * Guided editor for the 2-level rate table used by directional rules
 * (`rateTable[drillingType][depthScale] = rate`), where the rate does not vary
 * by cargo. Same pick-then-type flow as RateTableBuilder, minus the roles step.
 */
export function SimpleRateTableBuilder({
  value,
  onChange,
  rateLabel = "Rate per hour",
  hint,
}: {
  value: SimpleRateTable;
  onChange: (next: SimpleRateTable) => void;
  rateLabel?: string;
  hint?: string;
}) {
  const [drillingTypes, setDrillingTypes] = useState<string[]>(() => Object.keys(value));
  const [depthScales, setDepthScales] = useState<string[]>(() => {
    const found = new Set<string>();
    for (const scales of Object.values(value)) for (const key of Object.keys(scales)) found.add(key);
    return [...found];
  });

  const handleDrillingTypesChange = (next: string[]) => {
    let table = value;
    let changed = false;
    for (const dt of drillingTypes) {
      if (!next.includes(dt)) {
        table = pruneSimpleDrillingType(table, dt);
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
        table = pruneSimpleScale(table, scale);
        changed = true;
      }
    }
    if (changed) onChange(table);
    setDepthScales(next);
  };

  const orderedTypes = useMemo(() => {
    const order = DRILLING_TYPES.map((d) => d.code);
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

  const rateCount = countSimpleRates(value);
  const hasGrid = orderedTypes.length > 0 && orderedScales.length > 0;

  return (
    <div className="space-y-5">
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
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>3. {rateLabel}</Label>
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
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-40">Range (m)</TableHead>
                      <TableHead className="min-w-32">{rateLabel}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderedScales.map((scale) => (
                      <TableRow key={scale}>
                        <TableCell className="font-medium text-muted-foreground">{scale}</TableCell>
                        <TableCell>
                          <NumberField
                            value={getSimpleRate(value, dt, scale)}
                            onCommit={(n) => onChange(setSimpleRate(value, dt, scale, n))}
                            placeholder="—"
                            className="h-8"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Select at least one drilling type and one depth range to start entering rates.
          </p>
        )}
      </div>
    </div>
  );
}
