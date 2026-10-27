"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChipOption } from "./rule-form-shared";

/**
 * Multi-select rendered as toggleable chips.
 *
 * Used everywhere a comma-separated text box used to be (position filter,
 * drilling type filter, roles in a rate table, drilling types, depth scales).
 * Any value already present in `selected` but missing from `options` is merged
 * in under an "Existing" heading so editing a rule can never silently drop
 * configuration that is not in the current option list.
 */
export function ChipPicker({
  options,
  selected,
  onChange,
  allowCustom = false,
  customPlaceholder = "Add…",
  emptyHint,
}: {
  options: ChipOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  allowCustom?: boolean;
  customPlaceholder?: string;
  emptyHint?: string;
}) {
  const [custom, setCustom] = useState("");
  const selectedSet = new Set(selected);

  const toggle = (value: string) => {
    if (selectedSet.has(value)) onChange(selected.filter((v) => v !== value));
    else onChange([...selected, value]);
  };

  // Merge options with anything already selected.
  const merged: ChipOption[] = [...options];
  for (const v of selected) {
    if (!merged.some((o) => o.value === v)) {
      merged.push({ value: v, label: v, groupLabel: "Existing (not in config)" });
    }
  }

  // Group preserving insertion order.
  const groupOrder: (string | null)[] = [];
  const byGroup = new Map<string | null, ChipOption[]>();
  for (const o of merged) {
    const label = o.groupLabel ?? null;
    if (!byGroup.has(label)) {
      byGroup.set(label, []);
      groupOrder.push(label);
    }
    byGroup.get(label)?.push(o);
  }

  const addCustom = () => {
    const v = custom.trim();
    if (!v) return;
    if (!selectedSet.has(v)) onChange([...selected, v]);
    setCustom("");
  };

  return (
    <div className="space-y-3">
      {groupOrder.map((label) => (
        <div key={label ?? "__ungrouped"} className="space-y-1.5">
          {label ? (
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {(byGroup.get(label) ?? []).map((o) => {
              const isOn = selectedSet.has(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  title={o.hint}
                  aria-pressed={isOn}
                  onClick={() => toggle(o.value)}
                  className={
                    "rounded-full border px-2.5 py-1 text-xs transition-colors " +
                    (isOn
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background hover:bg-muted")
                  }
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {merged.length === 0 && emptyHint ? (
        <p className="text-xs text-muted-foreground">{emptyHint}</p>
      ) : null}

      {allowCustom ? (
        <div className="flex gap-2">
          <Input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder={customPlaceholder}
            className="h-8 max-w-56 text-sm"
          />
          <Button type="button" variant="outline" size="sm" onClick={addCustom} disabled={!custom.trim()}>
            Add
          </Button>
        </div>
      ) : null}
    </div>
  );
}
