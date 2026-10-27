"use client";

import { useTransition } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { retryUploadAction } from "./actions";

export function RetryUploadButton({ uploadId, label }: { uploadId: string; label?: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const text = label ?? "Re-parse";

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            setError(null);
            const result = await retryUploadAction(uploadId);
            if (result.error) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        <RotateCcw className="mr-1 h-3.5 w-3.5" />
        {pending ? `${text}…` : text}
      </Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </span>
  );
}