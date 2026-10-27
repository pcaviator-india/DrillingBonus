"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { bulkSetAttributionStatusAction } from "./actions";
import { AttributionActions, AttributionStatusBadge, type AttributionSiteOption } from "./attribution-actions";

export interface AttributionRow {
  id: string;
  date: string; // yyyy-MM-dd
  employeeName: string;
  assignedSite: string | null;
  device: string | null;
  coordinates: string | null;
  parsed: string | null;
  effectiveSiteName: string | null;
  approvedSiteName: string | null;
  nearestSiteName: string | null;
  distanceKm: string | null;
  verdict: "matched" | "outOfRange" | "noCoords";
  reviewStatus: "pending" | "approved" | "rejected";
  note: string | null;
  reviewerName: string | null;
  approvedSiteId: string | null;
  autoSiteId: string | null;
}

interface Props {
  rows: AttributionRow[];
  sites: AttributionSiteOption[];
  canReview: boolean;
}

const STATUSES = ["all", "pending", "approved", "rejected"] as const;
const VERDICTS = ["all", "matched", "outOfRange", "noCoords"] as const;

const verdictLabel: Record<string, string> = {
  matched: "Matched",
  outOfRange: "Out of range",
  noCoords: "No coords",
};

export function AttributionTable({ rows, sites, canReview }: Props) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [site, setSite] = useState("all");
  const [verdict, setVerdict] = useState<(typeof VERDICTS)[number]>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const siteOptions = useMemo(() => {
    const names = new Set<string>();
    for (const r of rows) {
      if (r.effectiveSiteName) names.add(r.effectiveSiteName);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "all" && r.reviewStatus !== status) return false;
      if (site !== "all" && r.effectiveSiteName !== site) return false;
      if (verdict !== "all" && r.verdict !== verdict) return false;
      if (from && r.date < from) return false;
      if (to && r.date > to) return false;
      if (q) {
        const haystack = [
          r.employeeName,
          r.assignedSite,
          r.device,
          r.coordinates,
          r.parsed,
          r.effectiveSiteName,
          r.nearestSiteName,
          r.note,
          r.reviewerName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, status, site, verdict, from, to]);

  const hasActiveFilters =
    search || status !== "all" || site !== "all" || verdict !== "all" || from || to;

  const clear = () => {
    setSearch("");
    setStatus("all");
    setSite("all");
    setVerdict("all");
    setFrom("");
    setTo("");
  };

  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const headerRef = useRef<HTMLInputElement>(null);

  const filteredIds = filtered.map((r) => r.id);
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));
  const someSelected = filteredIds.some((id) => selected.has(id));

  useEffect(() => {
    if (headerRef.current) {
      headerRef.current.indeterminate = someSelected && !allFilteredSelected;
    }
  }, [someSelected, allFilteredSelected]);

  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) =>
      allFilteredSelected ? new Set() : new Set(filteredIds),
    );

  const bulk = async (status: "approved" | "rejected" | "pending") => {
    if (selected.size === 0) return;
    setBulkMessage(null);
    const ids = [...selected];
    setBulkPending(true);
    try {
      const res = await bulkSetAttributionStatusAction({ recordIds: ids, status });
      if (res?.error) {
        setBulkMessage(res.error);
      } else {
        setBulkMessage(
          `Updated ${res.changed} mark(s)` +
            (res.skipped > 0 ? `, ${res.skipped} skipped (no site resolvable)` : ""),
        );
        setSelected(new Set());
        router.refresh();
      }
    } catch {
      setBulkMessage("Failed to update");
    } finally {
      setBulkPending(false);
    }
  };
return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
        <div className="min-w-52 flex-1">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Search
          </label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, device, note, coords…"
            className="h-9"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as (typeof STATUSES)[number])}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All statuses" : s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Site</label>
          <select
            value={site}
            onChange={(e) => setSite(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="all">All sites</option>
            {siteOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Verdict</label>
          <select
            value={verdict}
            onChange={(e) => setVerdict(e.target.value as (typeof VERDICTS)[number])}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            {VERDICTS.map((v) => (
              <option key={v} value={v}>
                {v === "all" ? "All verdicts" : verdictLabel[v]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">From</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">To</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={clear} disabled={!hasActiveFilters}>
          Clear
        </Button>

        {canReview && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {selected.size} selected
            </span>
            <Button
              type="button"
              size="sm"
              className="h-9"
              disabled={!someSelected || bulkPending}
              title="Approve all selected marks to their nearest auto-attributed site"
              onClick={() => bulk("approved")}
            >
              Approve selected
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="h-9"
              disabled={!someSelected || bulkPending}
              onClick={() => bulk("rejected")}
            >
              Reject selected
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9"
              disabled={!someSelected || bulkPending}
              onClick={() => bulk("pending")}
            >
              Reset
            </Button>
          </div>
        )}
      </div>

      {bulkMessage ? (
        <p className="text-xs text-muted-foreground">{bulkMessage}</p>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {rows.length} mark(s)
        {hasActiveFilters ? " (filtered)" : ""}
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              {canReview ? (
                <input
                  ref={headerRef}
                  type="checkbox"
                  aria-label="Select all filtered rows"
                  checked={allFilteredSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-input accent-primary"
                />
              ) : null}
            </TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Employee</TableHead>
            <TableHead>Assigned site (Workera)</TableHead>
            <TableHead>Device</TableHead>
            <TableHead>Coordinates</TableHead>
            <TableHead>Parsed (lat, lon)</TableHead>
            <TableHead>Site</TableHead>
            <TableHead>Distance</TableHead>
            <TableHead>Verdict</TableHead>
            <TableHead>Review</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={12} className="text-center text-muted-foreground">
                No attendance marks with GPS coordinates found yet.
              </TableCell>
            </TableRow>
          ) : filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={12} className="text-center text-muted-foreground">
                No records match these filters.
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((r) => (
              <TableRow key={r.id} data-selected={selected.has(r.id) || undefined} className={selected.has(r.id) ? "bg-muted/40" : undefined}>
                <TableCell>
                  {canReview ? (
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.employeeName} on ${r.date}`}
                      checked={selected.has(r.id)}
                      onChange={() => toggleRow(r.id)}
                      className="h-4 w-4 rounded border-input accent-primary"
                    />
                  ) : null}
                </TableCell>
                <TableCell>{r.date}</TableCell>
                <TableCell className="font-medium">{r.employeeName}</TableCell>
                <TableCell>{r.assignedSite ?? "—"}</TableCell>
                <TableCell className="text-xs">{r.device ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{r.coordinates ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{r.parsed ?? "—"}</TableCell>
                <TableCell>
                  {r.effectiveSiteName ?? "—"}
                  {r.reviewStatus === "approved" && r.approvedSiteName ? (
                    <span className="text-muted-foreground"> (approved)</span>
                  ) : null}
                </TableCell>
                <TableCell>{r.distanceKm ?? "—"}</TableCell>
                <TableCell>
                  {r.verdict === "matched" ? (
                    <Badge variant="secondary">Matched</Badge>
                  ) : r.verdict === "outOfRange" ? (
                    <Badge variant="outline">Out of range</Badge>
                  ) : (
                    <Badge variant="destructive">No coords</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <AttributionStatusBadge status={r.reviewStatus} />
                    {r.note ? (
                      <span className="max-w-40 truncate text-xs text-muted-foreground" title={r.note}>
                        {r.note}
                      </span>
                    ) : null}
                    {r.reviewerName ? (
                      <span className="text-xs text-muted-foreground">by {r.reviewerName}</span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  {canReview ? (
                    <AttributionActions
                      recordId={r.id}
                      status={r.reviewStatus}
                      approvedSiteId={r.approvedSiteId}
                      autoSiteId={r.autoSiteId}
                      note={r.note}
                      sites={sites}
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}