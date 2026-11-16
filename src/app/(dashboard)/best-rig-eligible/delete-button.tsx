"use client";

import { Button } from "@/components/ui/button";
import { deleteBestRigEligibleAction } from "./actions";

export function DeleteButton({ id }: { id: string }) {
  return (
    <Button
      size="sm"
      variant="destructive"
      onClick={async () => {
        await deleteBestRigEligibleAction(id);
      }}
    >
      Delete
    </Button>
  );
}