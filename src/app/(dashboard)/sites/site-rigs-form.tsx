"use client";

import { useRef, useState, useTransition } from "react";
import {
  assignRigToSiteAction,
  removeRigFromSiteAction,
  deleteRigAction,
  updateRigTypeAction,
  updateSiteRigTypeAction,
  type RigActionState,
  addRigAliasAction,
} from "./actions";
import { Button } from "@/components/ui/button";

export type RigOption = {
  id: string;
  name: string;
  code: string | null;
  rigType: string;
  effectiveType?: string | null;
  aliases?: string[];
};

/**
 * Per-site rig/machine manager. Shows the rigs already assigned to the site and
 * lets the admin add unassigned rigs or remove/reassign existing ones. If a
 * rig is removed from this site it becomes "unassigned" (available to assign
 * elsewhere) rather than deleted.
 */
export function SiteRigsForm({
  siteId,
  assignedRigs,
  unassignedRigs,
}: {
  siteId: string;
  assignedRigs: RigOption[];
  unassignedRigs: RigOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [open, setOpen] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);
  const effectiveRef = useRef<HTMLSelectElement>(null);
  const aliasRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const typeLabel = (t: string) =>
    t === "AIRE_REVERSO" ? "Aire Reverso" : t === "MULTIPROPOSITO" ? "Multipropósito" : "Diamantina";

  function run(action: () => Promise<RigActionState>) {
    startTransition(async () => {
      const res = await action();
      setMsg(
        res.error
          ? { type: "err", text: res.error }
          : { type: "ok", text: res.success ?? "Done" },
      );
    });
  }

  function handleAssign() {
    const rigId = selectRef.current?.value;
    if (!rigId) return;
    const selected = unassignedRigs.find((r) => r.id === rigId);
    const eff = effectiveRef.current?.value || undefined;
    if (selected?.rigType === "MULTIPROPOSITO" && !eff) {
      setMsg({ type: "err", text: "Choose Diamantina or Aire Reverso for this multipurpose rig" });
      return;
    }
    run(() => assignRigToSiteAction(rigId, siteId, eff));
    if (selectRef.current) selectRef.current.value = "";
    if (effectiveRef.current) effectiveRef.current.value = "";
  }

  return (
    <div>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
        {open ? "Close rigs" : `Rigs (${assignedRigs.length})`}
      </Button>

      {open ? (
        <div className="mt-3 space-y-3 rounded-md border p-4 text-sm">
          {msg ? (
            <p
              className={`rounded px-2 py-1 ${
                msg.type === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
              }`}
            >
              {msg.text}
            </p>
          ) : null}

          <div>
            <p className="mb-2 font-medium">Rigs / machines on this site</p>
            {assignedRigs.length === 0 ? (
              <p className="text-muted-foreground">No rigs assigned yet.</p>
            ) : (
              <ul className="space-y-1">
                {assignedRigs.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-col gap-2 rounded bg-muted/40 px-2 py-1.5"
                  >
                    <span className="flex items-center justify-between">
                      <span>
                        <span className="font-medium">{r.name}</span>
                        {r.code ? (
                          <span className="ml-1 text-xs text-muted-foreground">({r.code})</span>
                        ) : null}
                        <span className="ml-2 rounded bg-background px-1.5 py-0.5 text-xs">
                          {typeLabel(r.rigType)}
                          {r.rigType === "MULTIPROPOSITO"
                            ? ` → ${r.effectiveType ? typeLabel(r.effectiveType) : "sin tipo en faena"}`
                            : ""}
                          {r.aliases?.length ? ` · aliases: ${r.aliases.join(", ")}` : ""}
                        </span>
                      </span>
                    <span className="flex items-center gap-2">
                      <select
                        aria-label="Rig type"
                        defaultValue={r.rigType}
                        disabled={isPending}
                        onChange={(e) => run(() => updateRigTypeAction(r.id, e.target.value))}
                        className="rounded border px-1 py-0.5 text-xs"
                      >
                        <option value="DIAMANTINA">Diamantina</option>
                        <option value="AIRE_REVERSO">Aire Reverso</option>
                        <option value="MULTIPROPOSITO">Multipropósito</option>
                      </select>
                      {r.rigType === "MULTIPROPOSITO" ? (
                        <select
                          aria-label="Site drilling type"
                          value={r.effectiveType ?? ""}
                          disabled={isPending}
                          onChange={(e) => run(() => updateSiteRigTypeAction(r.id, e.target.value))}
                          className="rounded border px-1 py-0.5 text-xs"
                        >
                          <option value="">En faena: …</option>
                          <option value="DIAMANTINA">En faena: Diamantina</option>
                          <option value="AIRE_REVERSO">En faena: Aire Reverso</option>
                        </select>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => run(() => removeRigFromSiteAction(r.id))}
                        disabled={isPending}
                        className="text-xs text-destructive hover:underline disabled:opacity-50"
                      >
                        Remove
                      </button>
                      <button
                        type="button"
                        onClick={() => run(() => deleteRigAction(r.id))}
                        disabled={isPending}
                        className="text-xs text-muted-foreground hover:underline disabled:opacity-50"
                        title="Permanently delete this rig"
                      >
                        Delete
                      </button>
                    </span>
                    <span className="flex items-center gap-2">
                      <input
                        ref={(el) => { aliasRefs.current[r.id] = el; }}
                        placeholder="Add machine alias"
                        className="min-w-0 flex-1 rounded border px-2 py-1 text-xs"
                        disabled={isPending}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => {
                          const input = aliasRefs.current[r.id];
                          if (!input?.value.trim()) return;
                          run(() => addRigAliasAction(r.id, input.value));
                          input.value = "";
                        }}
                      >
                        Add alias
                      </Button>
                    </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {unassignedRigs.length > 0 ? (
            <div className="border-t pt-3">
              <p className="mb-2 font-medium">Add from unassigned rigs</p>
              <div className="flex items-center gap-2">
                <select ref={selectRef} className="rounded border px-2 py-1 text-sm">
                  <option value="">Select rig…</option>
                  {unassignedRigs.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.code ? ` (${r.code})` : ""} — {typeLabel(r.rigType)}
                    </option>
                  ))}
                </select>
                <select ref={effectiveRef} className="rounded border px-2 py-1 text-sm" title="Site drilling type (for multipurpose rigs)">
                  <option value="">En faena: …</option>
                  <option value="DIAMANTINA">En faena: Diamantina</option>
                  <option value="AIRE_REVERSO">En faena: Aire Reverso</option>
                </select>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAssign}
                  disabled={isPending}
                >
                  Add
                </Button>
              </div>
            </div>
          ) : (
            <p className="border-t pt-3 text-xs text-muted-foreground">
              All rigs are assigned to a site.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}