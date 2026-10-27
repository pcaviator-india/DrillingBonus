"use client";

import { Label } from "@/components/ui/label";
import type { ChipOption } from "./rule-form-shared";

/**
 * Native single-select with a label, used for the small enumerated choices in
 * the rule forms (best-rig mode, divisor, group, rate column).
 *
 * A native `<select>` is used rather than a Radix component because the rest of
 * this dashboard already relies on native selects and no Select primitive is
 * installed.
 */
export function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  placeholder = "- select -",
  description,
  disabled = false,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: ChipOption[];
  placeholder?: string;
  description?: string;
  disabled?: boolean;
}) {
  const groups: { label: string | null; items: ChipOption[] }[] = [];
  for (const o of options) {
    const label = o.groupLabel ?? null;
    let bucket = groups.find((g) => g.label === label);
    if (!bucket) {
      bucket = { label, items: [] };
      groups.push(bucket);
    }
    bucket.items.push(o);
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="">{placeholder}</option>
        {groups.length > 1
          ? groups.map((g) => (
              <optgroup key={g.label ?? "__ungrouped"} label={g.label ?? "Other"}>
                {g.items.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ))
          : groups[0]?.items.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
      </select>
    </div>
  );
}

/** Native checkbox with label + optional help text. */
export function CheckboxField({
  id,
  label,
  checked,
  onChange,
  description,
}: {
  id?: string;
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  description?: string;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
      />
      <span className="space-y-0.5">
        <span className="block text-sm font-medium leading-none">{label}</span>
        {description ? <span className="block text-xs text-muted-foreground">{description}</span> : null}
      </span>
    </label>
  );
}
