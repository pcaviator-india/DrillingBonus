"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteUploadAction } from "./actions";

export function DeleteUploadButton({
  uploadId,
  fileName,
  redirectTo,
}: {
  uploadId: string;
  fileName: string;
  redirectTo?: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      variant="destructive"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (
          !window.confirm(
            `Delete upload "${fileName}"?\n\nPlanilla entries will be permanently removed. Rig shift records are kept but unlinked from this file.`,
          )
        ) {
          return;
        }
        startTransition(async () => {
          await deleteUploadAction(uploadId);
          if (redirectTo) router.push(redirectTo);
          router.refresh();
        });
      }}
    >
      {pending ? "Deleting…" : "Delete"}
    </Button>
  );
}
