"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export type ColumnKey =
  | "date"
  | "employee"
  | "role"
  | "site"
  | "department"
  | "shift"
  | "timeIn"
  | "timeOut"
  | "hours"
  | "status"
  | "inDevice"
  | "outDevice"
  | "inOrigin"
  | "location"
  | "coords";

export const COLUMN_DEFS: { key: ColumnKey; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "employee", label: "Employee" },
  { key: "role", label: "Role (Cargo)" },
  { key: "site", label: "Site" },
  { key: "department", label: "Department" },
  { key: "shift", label: "Shift" },
  { key: "timeIn", label: "Time in" },
  { key: "timeOut", label: "Time out" },
  { key: "hours", label: "Hours" },
  { key: "status", label: "Status" },
  { key: "inDevice", label: "Clock-in device" },
  { key: "outDevice", label: "Clock-out device" },
  { key: "inOrigin", label: "Origin" },
  { key: "location", label: "Location" },
  { key: "coords", label: "GPS coords" },
];

const STORAGE_KEY = "attendance-columns";

/** Columns to show before hydration / when nothing saved. */
export function defaultColumns(): ColumnKey[] {
  return [
    "date",
    "employee",
    "role",
    "site",
    "shift",
    "timeIn",
    "timeOut",
    "hours",
    "status",
  ];
}

/** Load saved preference (client-only). If none saved, return defaults.
 *  Brand-new columns not present in a saved list are appended visible so users
 *  see them once. */
export function loadColumns(): ColumnKey[] {
  if (typeof window === "undefined") return defaultColumns();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultColumns();
    const parsed = JSON.parse(raw) as ColumnKey[];
    const known = new Set<string>(COLUMN_DEFS.map((c) => c.key));
    const saved = [...new Set(parsed.filter((k) => known.has(k)))];
    const savedSet = new Set(saved);
    const merged = [...saved];
    for (const c of COLUMN_DEFS) {
      if (!savedSet.has(c.key)) merged.push(c.key); // new/unselected -> default visible
    }
    return merged.length ? merged : defaultColumns();
  } catch {
    return defaultColumns();
  }
}

export function saveColumns(cols: ColumnKey[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cols));
  } catch {
    /* ignore – storage unavailable */
  }
}

export function ColumnPicker({
  visible,
  onChange,
}: {
  visible: ColumnKey[];
  onChange: (cols: ColumnKey[]) => void;
}) {
  const [open, setOpen] = useState(false);

  function toggle(key: ColumnKey) {
    const next = visible.includes(key)
      ? visible.filter((k) => k !== key)
      : [...visible, key];
    saveColumns(next);
    onChange(next);
  }

  return (
    <div className="relative inline-block">
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
        Columns
      </Button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-60 rounded-md border bg-background p-3 shadow-lg">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Show / hide columns</p>
          {COLUMN_DEFS.map((c) => (
            <label key={c.key} className="flex items-center gap-2 py-1 text-sm">
              <input
                type="checkbox"
                checked={visible.includes(c.key)}
                onChange={() => toggle(c.key)}
              />
              {c.label}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}