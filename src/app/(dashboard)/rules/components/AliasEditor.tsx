"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Editor for `depthScaleAliases` — maps a raw depth band emitted by the rig
 * report (e.g. "0-100") onto the tramo the rate table is authored with
 * (e.g. "0-200"). Both sides are free text with suggestions, so a project with
 * unusual bands can be configured without touching code.
 */
export function AliasEditor({
  label,
  description,
  value,
  onChange,
  targetOptions,
  sourcePlaceholder = "Report band, e.g. 0-100",
  targetPlaceholder = "Rate table tramo, e.g. 0-200",
}: {
  label: string;
  description?: string;
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  /** Suggested target values (the depth scales used by the rate table). */
  targetOptions: string[];
  sourcePlaceholder?: string;
  targetPlaceholder?: string;
}) {
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const entries = Object.entries(value);
  const listId = "alias-target-options";

  const add = () => {
    const s = source.trim();
    const t = target.trim();
    if (!s || !t) return;
    onChange({ ...value, [s]: t });
    setSource("");
    setTarget("");
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}

      {entries.length > 0 ? (
        <ul className="space-y-1">
          {entries.map(([from, to]) => (
            <li key={from} className="flex items-center gap-2 text-sm">
              <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">{from}</span>
              <span className="text-muted-foreground">→</span>
              <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">{to}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => {
                  const next = { ...value };
                  delete next[from];
                  onChange(next);
                }}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <Input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder={sourcePlaceholder}
          className="h-8 max-w-48 text-sm"
        />
        <span className="pb-1 text-muted-foreground">→</span>
        <Input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder={targetPlaceholder}
          list={listId}
          className="h-8 max-w-48 text-sm"
        />
        <datalist id={listId}>
          {targetOptions.map((opt) => (
            <option key={opt} value={opt} />
          ))}
        </datalist>
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={!source.trim() || !target.trim()}>
          Add alias
        </Button>
      </div>
    </div>
  );
}
