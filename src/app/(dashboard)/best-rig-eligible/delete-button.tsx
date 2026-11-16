"use client";

import { Button } from "@/components/ui/button";
import { deleteBestRigEligibleAction } from "./actions";
import { revalidatePath } from "next/cache";

export function DeleteButton({ id }: { id: string }) {
  return (
    <Button
      size="sm"
      variant="destructive"
      onClick={async () => {
        await deleteBestRigEligibleAction(id);
        revalidatePath("/best-rig-eligible");
      }}
    >
      Delete
    </Button>
  );
}