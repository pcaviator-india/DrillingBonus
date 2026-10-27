"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteCalculationAction } from "./actions";

export function DeleteCalculationButton({
  calculationId,
  label = "Delete",
  redirectTo,
}: {
  calculationId: string;
  label?: string;
  redirectTo?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={() => {
          setError(null);
          if (
            !window.confirm(
              "Delete this calculation? This permanently removes the result and its per-employee lines.",
            )
          ) {
            return;
          }
          startTransition(async () => {
            const res = await deleteCalculationAction(calculationId);
            if (res.error) {
              setError(res.error);
              return;
            }
            if (redirectTo) router.push(redirectTo);
            router.refresh();
          });
        }}
      >
        {pending ? "Deleting…" : label}
      </Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}