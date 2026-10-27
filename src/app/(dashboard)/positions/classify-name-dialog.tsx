"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  linkAliasToMainAction,
  promoteAliasToMainAction,
  dismissReviewAction,
  aiSuggestMainPositionsAction,
  type AiMainSuggestion,
} from "./actions";
import type { AliasWithGroup } from "@/lib/positions/registry";

type MainOption = { id: string; name: string; groupName: string | null };

/**
 * Modal to classify one cargo name: make it a Main Position,
 * link it as an alias of an existing main, or dismiss it.
 */
export function ClassifyNameDialog({
  alias,
  mainOptions,
  suggestions,
  triggerLabel,
  triggerVariant = "outline",
}: {
  alias: AliasWithGroup;
  mainOptions: MainOption[];
  suggestions: { main: MainOption; score: number }[];
  triggerLabel?: string;
  triggerVariant?: "outline" | "secondary" | "ghost";
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"main" | "alias">("alias");
  const [name, setName] = useState(alias.displayName);
  const [mainId, setMainId] = useState(suggestions[0]?.main.id ?? mainOptions[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const [aiState, setAiState] = useState<"idle" | "loading" | "done" | "none">("idle");
  const [aiSuggestions, setAiSuggestions] = useState<AiMainSuggestion[]>([]);

  const best = suggestions[0];

  /** Ask the AI ranker for MainPosition candidates; picking one only pre-fills the form. */
  function askAi() {
    setAiState("loading");
    startTransition(async () => {
      try {
        const res = await aiSuggestMainPositionsAction(alias.displayName);
        setAiSuggestions(res);
        setAiState(res.length > 0 ? "done" : "none");
        const top = res[0];
        if (top && top.confidence === "high") {
          setMode("alias");
          setMainId(top.id);
        }
      } catch {
        setAiState("none");
      }
    });
  }

  function submit() {
    startTransition(() => {
      if (mode === "main") {
        void promoteAliasToMainAction(alias.id);
      } else if (mainId) {
        void linkAliasToMainAction(alias.id, mainId);
      }
      setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setMode(best || mainOptions.length ? "alias" : "main");
          setName(alias.displayName);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant={triggerVariant}>
          {triggerLabel ?? "Classify"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Classify &quot;{alias.displayName}&quot;</DialogTitle>
          <DialogDescription>
            {alias.variants.length > 1 && <>Variants seen: {alias.variants.join(", ")}. </>}
            Source: {alias.source}
            {alias.groupName ? ` · currently in bonus group: ${alias.groupName}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`mode-${alias.id}`}
                checked={mode === "alias"}
                onChange={() => setMode("alias")}
              />
              Alias of an existing position
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`mode-${alias.id}`}
                checked={mode === "main"}
                onChange={() => setMode("main")}
              />
              Main Position
            </label>
          </div>

          {mode === "alias" ? (
            <div className="space-y-2">
              <Label htmlFor={`main-${alias.id}`}>Main position</Label>
              {best && (
                <p className="text-xs text-muted-foreground">
                  Suggested: {best.main.name} ({(best.score * 100).toFixed(0)}% match)
                </p>
              )}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending || aiState === "loading"}
                  onClick={askAi}
                  title="Let the AI rank likely main positions (you still confirm)"
                  className="border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-950"
                >
                  {aiState === "loading" ? "AI thinking…" : "✨ AI suggest"}
                </Button>
                {aiState === "none" && (
                  <span className="text-xs text-muted-foreground">
                    No plausible main position found
                  </span>
                )}
              </div>
              {aiState === "done" && (
                <div className="flex flex-wrap gap-1">
                  {aiSuggestions.map((sug) => (
                    <button
                      key={sug.id}
                      type="button"
                      onClick={() => setMainId(sug.id)}
                      disabled={pending}
                      title={
                        sug.confidence === "high"
                          ? "AI: very likely match"
                          : "AI: plausible — review carefully"
                      }
                      className={`rounded-full border px-2 py-0.5 text-xs ${
                        sug.id === mainId
                          ? "border-violet-500 bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200"
                          : "border-border bg-background text-muted-foreground hover:bg-muted/60"
                      }`}
                    >
                      {sug.confidence === "high" ? "✅" : "🟡"} {sug.name} ·{" "}
                      {(sug.score * 100).toFixed(0)}%
                    </button>
                  ))}
                </div>
              )}
              <select
                id={`main-${alias.id}`}
                value={mainId}
                onChange={(e) => setMainId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {mainOptions.length === 0 && <option value="">No main positions yet</option>}
                {mainOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.groupName ? ` — ${m.groupName}` : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor={`name-${alias.id}`}>Main position name</Label>
              <Input
                id={`name-${alias.id}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                The bonus group is assigned afterwards on the main position card.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(() => {
                  void dismissReviewAction(alias.id);
                  setOpen(false);
                })
              }
            >
              Dismiss (decide later)
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={pending || (mode === "alias" && (!mainId || mainOptions.length === 0))}
              onClick={submit}
            >
              {mode === "main" ? "Create Main Position" : "Link as alias"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}