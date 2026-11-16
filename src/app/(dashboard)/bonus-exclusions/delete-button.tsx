"use client";

import { Button } from "@/components/ui/button";
import { deleteExclusionAction } from "./actions";

export function DeleteButton({ id }: { id: string }) {
  return (
    <Button
      size="sm"
      variant="destructive"
      onClick={async () => {
        await deleteExclusionAction(id);
      }}
    >
      Delete
    </Button>
  );
}