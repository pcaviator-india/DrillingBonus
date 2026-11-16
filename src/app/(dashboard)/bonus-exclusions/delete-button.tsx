"use client";

import { Button } from "@/components/ui/button";
import { deleteExclusionAction } from "./actions";
import { revalidatePath } from "next/cache";

export function DeleteButton({ id }: { id: string }) {
  return (
    <Button
      size="sm"
      variant="destructive"
      onClick={async () => {
        await deleteExclusionAction(id);
        revalidatePath("/bonus-exclusions");
      }}
    >
      Delete
    </Button>
  );
}