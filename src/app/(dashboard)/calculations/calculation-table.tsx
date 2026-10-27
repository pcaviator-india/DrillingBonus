"use client";

import { useActionState, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatDateTimeChile, formatDateUtc } from "@/lib/datetime";
import { Badge } from "@/components/ui/badge";
import {
  bulkRecalculateAction,
  recalculateCalculationAction,
  type RecalcState,
} from "./actions";
import Link from "next/link";
import { Download } from "lucide-react";
import { DeleteCalculationButton } from "./delete-calculation-button";

const initialState: RecalcState = {};

function RecalculateButton({ calculationId }: { calculationId: string }) {
  const [state, formAction, pending] = useActionState(
    recalculateCalculationAction,
    initialState,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="calculationId" value={calculationId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Recalculating…" : "Recalculate"}
      </Button>
      {state.error ? (
        <span className="ml-2 text-xs text-destructive">{state.error}</span>
      ) : null}
      {state.success ? (
        <span className="ml-2 text-xs text-green-600">{state.success}</span>
      ) : null}
    </form>
  );
}

export function CalculationTable({
  calculations,
  isAdmin,
}: {
  calculations: Array<{
    id: string;
    createdAt: Date;
    site: { name: string };
    source: string;
    ruleSet: { name: string; version: number };
    periodStart: Date;
    periodEnd: Date;
    totalBonus: number;
    status: string;
  }>;
  isAdmin: boolean;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkState, bulkAction, bulkPending] = useActionState(
    bulkRecalculateAction,
    initialState,
  );

  const isSelected = (id: string) => selectedIds.has(id);
  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(calculations.map((c) => c.id)));
    } else {
      setSelectedIds(new Set());
    }
  };
  const hasSelection = selectedIds.size > 0;
  const allSelected =
    calculations.length > 0 && selectedIds.size === calculations.length;

  return (
    <>
      {hasSelection && (
        <div className="mb-4 flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            {selectedIds.size} calculation(s) selected
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggleSelectAll(false)}
              disabled={bulkPending}
            >
              Clear selection
            </Button>
            <form action={bulkAction}>
              {Array.from(selectedIds).map((id) => (
                <input
                  key={id}
                  type="hidden"
                  name="calculationId"
                  value={id}
                />
              ))}
              <Button
                type="submit"
                variant="default"
                size="sm"
                disabled={bulkPending}
              >
                {bulkPending ? "Recalculating…" : "Calculate selected"}
              </Button>
              {bulkState.error ? (
                <span className="ml-2 text-xs text-destructive">
                  {bulkState.error}
                </span>
              ) : null}
              {bulkState.success ? (
                <span className="ml-2 text-xs text-green-600">
                  {bulkState.success}
                </span>
              ) : null}
            </form>
          </div>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => toggleSelectAll(e.target.checked)}
                disabled={bulkPending || calculations.length === 0}
              />
            </TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Site</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Rule set</TableHead>
            <TableHead>Period</TableHead>
            <TableHead>Total bonus</TableHead>
            <TableHead>Status</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {calculations.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-muted-foreground">
                No calculations yet.
              </TableCell>
            </TableRow>
          ) : (
            calculations.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="w-[40px]">
                  <input
                    type="checkbox"
                    checked={isSelected(c.id)}
                    onChange={(e) => toggleSelect(c.id, e.target.checked)}
                    disabled={bulkPending}
                  />
                </TableCell>
                <TableCell>{formatDateTimeChile(c.createdAt)}</TableCell>
                <TableCell>{c.site.name}</TableCell>
                <TableCell>
                  <Badge
                    variant={c.source === "workera" ? "default" : "secondary"}
                  >
                    {c.source === "workera"
                      ? "Workera — official"
                      : "Planilla — comparison"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {c.ruleSet.name} (v{c.ruleSet.version})
                </TableCell>
                <TableCell>
                  {formatDateUtc(c.periodStart)} →{" "}
                  {formatDateUtc(c.periodEnd)}
                </TableCell>
                <TableCell className="font-medium">{c.totalBonus}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{c.status}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/calculations/${c.id}`}>View</Link>
                    </Button>
                    <RecalculateButton calculationId={c.id} />
                    <Button asChild variant="ghost" size="sm" aria-label="Export super detailed (Excel)">
                      <Link href={`/api/calculations/${c.id}/export-super`}>
                        <Download size={14} strokeWidth={1.5} />
                      </Link>
                    </Button>
                    {isAdmin ? (
                      <DeleteCalculationButton calculationId={c.id} label="Delete" />
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </>
  );
}
