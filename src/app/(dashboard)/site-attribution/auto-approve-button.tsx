"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runAutoApproveAction } from "./actions";
import { Button } from "@/components/ui/button";

/** Bulk-approves pending attendance marks whose GPS falls within a site range. */
export function AutoApproveButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const run = () => {
    setMessage(null);
    startTransition(async () => {
      const res = await runAutoApproveAction();
      if (res?.error) {
        setMessage(res.error);
        return;
      }
      setMessage(res.approved ? `Approved ${res.approved} mark(s) within range` : "Nothing new in range");
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={run}
        disabled={isPending || disabled}
      >
        {isPending ? "Approving…" : "Auto-approve within range"}
      </Button>
      {message ? (
        <span
          className={`text-xs ${message.startsWith("Approved") ? "text-green-600" : "text-muted-foreground"}`}
        >
          {message}
        </span>
      ) : null}
    </div>
  );
}