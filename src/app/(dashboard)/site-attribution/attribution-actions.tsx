"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAttributionStatusAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface AttributionSiteOption {
  id: string;
  name: string;
}

interface Props {
  recordId: string;
  status: string; // pending | approved | rejected
  approvedSiteId: string | null;
  autoSiteId: string | null; // nearest site from live attribution
  note: string | null;
  sites: AttributionSiteOption[];
}

const statusBadgeClass: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  approved: "bg-green-600 text-white",
  rejected: "bg-red-600 text-white",
};

/**
 * Per-row control for reviewing a site attribution.
 * Offers Approve / Reject / Reset-to-pending. Any status can move to any other
 * (e.g. a rejected mark can be re-approved once the employee provides proof).
 * Approving stores an explicit site (defaults to the nearest auto-match).
 */
export function AttributionActions({
  recordId,
  status,
  approvedSiteId,
  autoSiteId,
  note,
  sites,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [noteValue, setNoteValue] = useState(note ?? "");
  const siteRef = useRef<HTMLSelectElement>(null);

  const effectiveSiteId = approvedSiteId ?? autoSiteId ?? sites[0]?.id ?? "";

  const run = (nextStatus: "approved" | "rejected" | "pending") => {
    setError(null);
    const form = new FormData();
    form.set("attendanceRecordId", recordId);
    form.set("status", nextStatus);
    form.set("siteId", nextStatus === "approved" ? (siteRef.current?.value ?? "") : "");
    form.set("note", noteValue);
    startTransition(async () => {
      const res = await setAttributionStatusAction({}, form);
      if (res?.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <select
        ref={siteRef}
        defaultValue={effectiveSiteId}
        className="h-8 w-full max-w-52 rounded-md border border-input bg-transparent px-2 text-xs"
        aria-label="Approved site"
      >
        {sites.length === 0 ? (
          <option value="">No site</option>
        ) : (
          sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))
        )}
      </select>

      <div className="flex flex-wrap gap-1">
        <Button
          type="button"
          size="sm"
          variant="default"
          className="h-7"
          disabled={isPending || status === "approved"}
          title={status === "approved" ? "Already approved" : "Approve this mark"}
          onClick={() => run("approved")}
        >
          Approve
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          className="h-7"
          disabled={isPending}
          onClick={() => run("rejected")}
        >
          Reject
        </Button>
        {status !== "pending" && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7"
            disabled={isPending}
            onClick={() => run("pending")}
          >
            Pending
          </Button>
        )}
      </div>

      <Input
        value={noteValue}
        onChange={(e) => setNoteValue(e.target.value)}
        placeholder="Note (e.g. proof ref)"
        className="h-7 max-w-52 text-xs"
      />

      {isPending ? (
        <p className="text-xs text-muted-foreground">Saving…</p>
      ) : error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}

export function AttributionStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusBadgeClass[status] ?? statusBadgeClass.pending}`}
    >
      {status}
    </span>
  );
}