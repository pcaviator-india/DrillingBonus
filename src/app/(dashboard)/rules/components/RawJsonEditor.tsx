"use client";

import { useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";

/**
 * Escape hatch: edit the rule's `parameters` as raw JSON.
 *
 * Kept for advanced users and for bonus types that do not have a guided form
 * yet, so no configuration is ever unreachable from the UI. Invalid JSON is
 * reported and simply not committed.
 */
export function RawJsonEditor({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const pretty = (v: unknown) => JSON.stringify(v, null, 2);
  const [text, setText] = useState(() => pretty(value));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return; // leave the user's (invalid) text alone
    }
    if (JSON.stringify(parsed) !== JSON.stringify(value)) setText(pretty(value));
    // Intentionally only re-sync when the committed value changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="space-y-2">
      <Textarea
        rows={12}
        value={text}
        className="font-mono text-sm"
        spellCheck={false}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          try {
            const parsed: unknown = JSON.parse(next);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              setError(null);
              onChange(parsed as Record<string, unknown>);
            } else {
              setError("Parameters must be a JSON object.");
            }
          } catch {
            setError("Invalid JSON — these edits are not saved until it parses.");
          }
        }}
      />
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        <p className="text-xs text-muted-foreground">Valid JSON.</p>
      )}
    </div>
  );
}
