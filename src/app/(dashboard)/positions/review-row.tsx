"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  linkAliasToMainAction,
  promoteAliasToMainAction,
  dismissReviewAction,
  aiSuggestMainPositionsAction,
  type AiMainSuggestion,
} from "./actions";
import type { AliasWithGroup } from "@/lib/positions/registry";

type MainOption = { id: string; name: string };

/**
 * Review row for a newly seen cargo name: is it a Main Position,
 * an alias of one, or should the prompt be dismissed?
 */
export function ReviewRow({
  alias,
  mainOptions,
  suggestions,
}: {
  alias: AliasWithGroup;
  mainOptions: MainOption[];
  suggestions: { main: MainOption; score: number }[];
}) {
  const [pending, startTransition] = useTransition();
  const [aiState, setAiState] = useState<"idle" | "loading" | "done" | "none">("idle");
  const [aiSuggestions, setAiSuggestions] = useState<AiMainSuggestion[]>([]);
  const best = suggestions[0];

  /** AI-ranked MainPosition candidates; each chip links with one click (same as manual buttons). */
  function askAi() {
    setAiState("loading");
    startTransition(async () => {
      try {
        const res = await aiSuggestMainPositionsAction(alias.displayName);
        setAiSuggestions(res);
        setAiState(res.length > 0 ? "done" : "none");
      } catch {
        setAiState("none");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50/50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{alias.displayName}</span>
        <Badge variant="outline">{alias.source}</Badge>
        <Badge variant="secondary">Needs review</Badge>
      </div>
      {alias.variants.length > 1 && (
        <p className="text-xs text-muted-foreground">Variants seen: {alias.variants.join(", ")}</p>
      )}
      {best && (
        <p className="text-xs text-muted-foreground">
          Suggested: alias of <strong>{best.main.name}</strong> (
          {(best.score * 100).toFixed(0)}% match)
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(() => promoteAliasToMainAction(alias.id))
          }
        >
          Main Position
        </Button>
        {mainOptions.map((m) => (
          <Button
            key={m.id}
            size="sm"
            variant={best?.main.id === m.id ? "default" : "outline"}
            disabled={pending}
            onClick={() => startTransition(() => linkAliasToMainAction(alias.id, m.id))}
          >
            Alias of {m.name}
          </Button>
        ))}
        <Button
          size="sm"
          variant="outline"
          disabled={pending || aiState === "loading"}
          onClick={askAi}
          title="Let the AI rank likely main positions (one-click to apply)"
          className="border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-950"
        >
          {aiState === "loading" ? "AI thinking…" : "✨ AI"}
        </Button>
        {aiState === "done"
          ? aiSuggestions.map((sug) => (
              <Button
                key={sug.id}
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => startTransition(() => linkAliasToMainAction(alias.id, sug.id))}
                title={
                  sug.confidence === "high"
                    ? "AI: very likely match — click to link"
                    : "AI: plausible — review carefully before clicking"
                }
                className="border-violet-300 bg-violet-50/60 text-violet-800 hover:bg-violet-100 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-200"
              >
                {sug.confidence === "high" ? "✅" : "🟡"} {sug.name} ·{" "}
                {(sug.score * 100).toFixed(0)}%
              </Button>
            ))
          : null}
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => startTransition(() => dismissReviewAction(alias.id))}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}