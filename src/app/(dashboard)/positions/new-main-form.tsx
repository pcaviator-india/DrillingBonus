"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createMainPositionAction } from "./actions";

export function NewMainPositionForm({ groups }: { groups: { key: string; name: string }[] }) {
  const [name, setName] = useState("");
  const [groupKey, setGroupKey] = useState<string>("none");
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        startTransition(() => {
          void createMainPositionAction(name.trim(), groupKey === "none" ? null : groupKey);
          setName("");
        });
      }}
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New main position name…"
        className="w-72"
      />
      <select
        value={groupKey}
        onChange={(e) => setGroupKey(e.target.value)}
        className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
      >
        <option value="none">No bonus group</option>
        {groups.map((g) => (
          <option key={g.key} value={g.key}>
            {g.name}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" disabled={pending || !name.trim()}>
        Create
      </Button>
    </form>
  );
}