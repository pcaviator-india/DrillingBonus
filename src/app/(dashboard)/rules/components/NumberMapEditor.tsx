"use client";

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
import { ChipPicker } from "./ChipPicker";
import { NumberField } from "./NumberField";
import type { ChipOption } from "./rule-form-shared";

/**
 * Editor for flat number maps such as `thresholds` (drilling type → metres),
 * `goals` (drilling type → metres) and `amounts` (role → CLP).
 *
 * Keys are added from the suggested chips (or typed freely when allowed), then
 * each row gets a numeric value. Removing a row removes the key entirely.
 */
export function NumberMapEditor({
  label,
  description,
  value,
  onChange,
  keyOptions,
  unit,
  addLabel = "Add",
  allowCustomKey = true,
  customKeyPlaceholder = "Custom key…",
}: {
  label: string;
  description?: string;
  value: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
  keyOptions: ChipOption[];
  unit?: string;
  addLabel?: string;
  allowCustomKey?: boolean;
  customKeyPlaceholder?: string;
}) {
  const keys = Object.keys(value);
  const available = keyOptions.filter((o) => !(o.value in value));

  const add = (key: string) => onChange({ ...value, [key]: value[key] ?? 0 });
  const remove = (key: string) => {
    const next = { ...value };
    delete next[key];
    onChange(next);
  };
  const setVal = (key: string, v: number) => onChange({ ...value, [key]: v });

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}

      {keys.length > 0 ? (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead className="min-w-32">{unit ? `Value (${unit})` : "Value"}</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => (
                <TableRow key={key}>
                  <TableCell className="font-medium">{key}</TableCell>
                  <TableCell>
                    <NumberField value={value[key] ?? 0} onCommit={(n) => setVal(key, n)} className="h-8" />
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => remove(key)}
                    >
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          No entries yet — pick one below. {addLabel}
        </p>
      )}

      {available.length > 0 || allowCustomKey ? (
        <details className="rounded-md border p-2">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            Add entry
          </summary>
          <div className="pt-2">
            <ChipPicker
              options={available}
              selected={[]}
              onChange={(next) => {
                const added = next.filter((v) => !(v in value));
                if (added.length === 0) return;
                const merged = { ...value };
                for (const key of added) merged[key] = merged[key] ?? 0;
                onChange(merged);
              }}
              allowCustom={allowCustomKey}
              customPlaceholder={customKeyPlaceholder}
            />
          </div>
        </details>
      ) : null}
    </div>
  );
}
