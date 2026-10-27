"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

/** Accepts only a partial decimal number while typing (digits, one dot, sign). */
const PARTIAL_NUMBER = /^-?\d*\.?\d*$/;

/**
 * Numeric input that keeps the raw typed text in local state so intermediate
 * values like "12." or "-" are not destroyed by a re-render, while committing
 * the parsed number to the parent on every valid keystroke.
 */
export function NumberField({
  value,
  onCommit,
  id,
  className,
  placeholder,
  /** When true (default) a committed 0 renders as an empty box. */
  zeroAsEmpty = true,
}: {
  value: number;
  onCommit: (next: number) => void;
  id?: string;
  className?: string;
  placeholder?: string;
  zeroAsEmpty?: boolean;
}) {
  const format = (v: number) => (zeroAsEmpty && v === 0 ? "" : String(v));
  const [text, setText] = useState(() => format(value));

  useEffect(() => {
    const parsed = text.trim() === "" ? 0 : Number(text);
    if (Number.isNaN(parsed) || parsed !== value) {
      setText(zeroAsEmpty && value === 0 ? "" : String(value));
    }
    // Intentionally only re-sync when the committed value changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Input
      id={id}
      className={className}
      placeholder={placeholder}
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const t = e.target.value;
        if (!PARTIAL_NUMBER.test(t)) return;
        setText(t);
        if (t.trim() === "" || t.trim() === "-" || t.trim() === ".") {
          onCommit(0);
          return;
        }
        const n = Number(t);
        if (!Number.isNaN(n)) onCommit(n);
      }}
    />
  );
}
