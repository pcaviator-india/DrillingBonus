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
            `Delete upload "${fileName}"?\n\nAll parsed data will be permanently removed: planilla entries, rig shift records (meters, drilling type, depth scale), and crew assignments. This cannot be undone.`,
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
