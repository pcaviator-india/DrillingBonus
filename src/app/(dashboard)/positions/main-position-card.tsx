"use client";

import { useTransition, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Pencil, Trash2, X } from "lucide-react";
import {
  unlinkAliasFromMainAction,
  setMainPositionGroupAction,
  renameMainPositionAction,
  deleteMainPositionAction,
} from "./actions";
import type { MainPositionWithAliases } from "@/lib/positions/registry";

export function MainPositionCard({
  main,
  groups,
}: {
  main: MainPositionWithAliases;
  groups: { key: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(main.name);

  const saveName = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === main.name) {
      setName(main.name);
      setEditing(false);
      return;
    }
    startTransition(async () => {
      try {
        await renameMainPositionAction(main.id, trimmed);
        setEditing(false);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Rename failed.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border p-4">
      <div className="flex flex-wrap items-center gap-2">
        {editing ? (
          <>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
                if (e.key === "Escape") {
                  setName(main.name);
                  setEditing(false);
                }
              }}
              autoFocus
              className="h-8 w-64"
              disabled={pending}
            />
            <Button
              size="icon"
              type="button"
              title="Save name"
              aria-label="Save name"
              disabled={pending}
              onClick={saveName}
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              type="button"
              title="Cancel"
              aria-label="Cancel"
              disabled={pending}
              onClick={() => {
                setName(main.name);
                setEditing(false);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            <button
              type="button"
              title="Click to rename"
              disabled={pending}
              className="text-lg font-semibold hover:underline"
              onClick={() => setEditing(true)}
            >
              {main.name}
            </button>
            <Button
              size="icon"
              variant="ghost"
              type="button"
              title="Rename"
              aria-label="Rename"
              disabled={pending}
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </>
        )}
        <select
          value={main.groupKey ?? "none"}
          disabled={pending}
          className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
          onChange={(e) =>
            startTransition(() =>
              setMainPositionGroupAction(main.id, e.target.value === "none" ? null : e.target.value),
            )
          }
        >
          <option value="none">No bonus group</option>
          {groups.map((g) => (
            <option key={g.key} value={g.key}>
              {g.name}
            </option>
          ))}
        </select>
        <Badge variant="outline">
          {main.aliases.length} alias{main.aliases.length === 1 ? "" : "es"}
        </Badge>
        <Button
          size="icon"
          variant="ghost"
          type="button"
          title="Delete main position"
          aria-label="Delete main position"
          disabled={pending}
          className="ml-auto text-muted-foreground hover:text-destructive"
          onClick={() => {
            if (
              !confirm(
                `Delete main position "${main.name}"? Its aliases will stay but become unlinked.`,
              )
            ) {
              return;
            }
            startTransition(() => deleteMainPositionAction(main.id));
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {main.aliases.map((a) => (
          <span
            key={a.id}
            className="flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-sm"
          >
            {a.displayName}
            {a.normalized !== main.normalized && (
              <button
                type="button"
                title="Unlink alias"
                aria-label={`Unlink alias ${a.displayName}`}
                disabled={pending}
                className="ml-1 text-muted-foreground hover:text-destructive"
                onClick={() => startTransition(() => unlinkAliasFromMainAction(a.id))}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Aliases inherit this bonus group automatically. Use &quot;Classify&quot; on an unlinked name
        to add it here.
      </p>
    </div>
  );
}