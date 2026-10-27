"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { mapMachineToRigAction, aiSuggestRigMatchesAction, type AiRigSuggestion } from "../actions";

/**
 * Inline MAQUINA → rig mapping for the lines the comparison could not resolve.
 * Writes through the same matching registry the engine uses, then refreshes the
 * page so the row is included next time.
 */
export function RigMappingControl({
  machine,
  rigs,
}: {
  machine: string;
  rigs: { id: string; name: string; siteName: string | null }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rigId, setRigId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aiState, setAiState] = useState<"idle" | "loading" | "done" | "none">("idle");
  const [aiSuggestions, setAiSuggestions] = useState<AiRigSuggestion[]>([]);

  /** Ask the AI ranker; clicking a chip only pre-fills the select — the user still saves. */
  function askAi() {
    setError(null);
    setAiState("loading");
    startTransition(async () => {
      try {
        const res = await aiSuggestRigMatchesAction(machine);
        setAiSuggestions(res);
        setAiState(res.length > 0 ? "done" : "none");
        // Pre-select only a high-confidence top hit; keep human confirmation.
        const top = res[0];
        if (top && top.confidence === "high") setRigId(top.rigId);
      } catch {
        setAiState("none");
        setError("AI suggestion failed — map manually");
      }
    });
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await mapMachineToRigAction({ machine, rigId });
      if (res?.error) {
        setError(res.error);
        return;
      }
      setRigId("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={rigId}
        disabled={pending}
        onChange={(e) => setRigId(e.target.value)}
        aria-label={`Map ${machine} to a rig`}
        className="h-8 min-w-44 rounded-md border border-input bg-background px-2 text-xs"
      >
        <option value="">Map to rig…</option>
        {rigs.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
            {r.siteName ? ` — ${r.siteName}` : ""}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={pending || aiState === "loading"}
        onClick={askAi}
        title="Let the AI rank likely rigs for this machine name (you still confirm)"
        className="rounded border border-violet-300 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-300"
      >
        {aiState === "loading" ? "AI…" : "✨ AI"}
      </button>
      <button
        type="button"
        disabled={pending || !rigId}
        onClick={save}
        className="rounded border px-2 py-1 text-xs font-medium hover:bg-muted/60 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {aiState === "done"
        ? aiSuggestions.map((sug) => (
            <button
              key={sug.rigId}
              type="button"
              onClick={() => setRigId(sug.rigId)}
              disabled={pending}
              title={sug.confidence === "high" ? "AI: very likely match" : "AI: plausible — review carefully"}
              className={`rounded-full border px-2 py-0.5 text-xs ${
                sug.rigId === rigId
                  ? "border-violet-500 bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200"
                  : "border-border bg-background text-muted-foreground hover:bg-muted/60"
              }`}
            >
              {sug.confidence === "high" ? "✅" : "🟡"} {sug.label} · {(sug.score * 100).toFixed(0)}%
            </button>
          ))
        : null}
      {aiState === "none" ? (
        <span className="text-xs text-muted-foreground">AI found no plausible rig</span>
      ) : null}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}