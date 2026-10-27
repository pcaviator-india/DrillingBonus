"use client";

import { useActionState, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  deleteComparisonBatch,
  recalculateComparisonBatchAction,
  bulkRecalculateComparisonsAction,
  type ComparisonState,
} from "./actions";

type ComparisonRow = {
  id: string;
  createdAt: Date;
  workeraDays: number;
  planillaDays: number;
  workeraBonus: number;
  planillaBonus: number;
  difference: number;
  reviewStatus: string;
  reviewNote: string | null;
  calculationId: string;
  planillaCalculationId: string | null;
  calculation: { site: { name: string; id: string } };
  employee: { fullName: string; rut: string | null };
};

type Batch = {
  key: string;
  rows: ComparisonRow[];
};

type Project = { id: string; name: string };

const statusVariant = (status: string) => {
  switch (status) {
    case "approved": return "default";
    case "rejected": return "destructive";
    default: return "secondary";
  }
};

export function ComparisonHistory({ 
  batches, 
  projects, 
  initialFilters 
}: { 
  batches: Batch[]; 
  projects: Project[];
  initialFilters: { q?: string; project?: string; reviewStatus?: string; month?: string; tab?: string };
}) {
  const [selectedBatches, setSelectedBatches] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);

  const toggleBatch = (key: string) => {
    const newSelected = new Set(selectedBatches);
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    setSelectedBatches(newSelected);
    setSelectAll(false);
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedBatches(new Set());
      setSelectAll(false);
    } else {
      setSelectedBatches(new Set(batches.map(b => b.key)));
      setSelectAll(true);
    }
  };

  const [bulkRecalcState, bulkRecalcAction, bulkRecalcPending] = useActionState<ComparisonState, FormData>(
    bulkRecalculateComparisonsAction,
    {},
  );

  const handleExport = () => {
    const url = new URL('/api/comparisons/export', window.location.origin);
    
    // Add selected batch IDs
    selectedBatches.forEach(batchId => {
      url.searchParams.append('batchIds', batchId);
    });
    
    // Apply the same month filter currently shown (calculation period, not creation date)
    if (initialFilters.month) {
      url.searchParams.append('month', initialFilters.month);
    }
    
    // Open in new tab to trigger download
    window.open(url.toString(), '_blank');
  };

  const filteredRows = batches.reduce((sum, b) => sum + b.rows.length, 0);
  const selectedRows = batches
    .filter(b => selectedBatches.has(b.key))
    .reduce((sum, b) => sum + b.rows.length, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Comparison history</CardTitle>
        <CardDescription>
          {batches.length} batch(es), {filteredRows} employee row(s)
          {initialFilters.month && ` for ${initialFilters.month}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* GET form: submits filters to the server page so filtering happens on calculation data */}
        <form method="GET" action="/comparisons" className="mb-6 grid gap-3 md:grid-cols-[2fr_2fr_1fr_1fr_auto]">
          <input type="hidden" name="tab" value={initialFilters.tab ?? "single"} />
          <label className="space-y-1 text-sm">
            Search employee, RUT, or project
            <input 
              name="q" 
              defaultValue={initialFilters.q ?? ""}
              className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm" 
              placeholder="Search comparison history" 
            />
          </label>
          <label className="space-y-1 text-sm">
            Project
            <select 
              name="project" 
              defaultValue={initialFilters.project ?? ""}
              className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">All projects</option>
              {projects.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            Review status
            <select 
              name="reviewStatus" 
              defaultValue={initialFilters.reviewStatus ?? ""}
              className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">All statuses</option>
              {["pending", "approved", "rejected"].map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            Month (calculation period)
            <input 
              type="month"
              name="month" 
              defaultValue={initialFilters.month ?? ""}
              className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm" 
              placeholder="YYYY-MM" 
            />
          </label>
          <div className="self-end">
            <Button type="submit">Filter</Button>
          </div>
        </form>

        <div className="mb-4 flex items-center justify-between border-b pb-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectAll}
              onChange={handleSelectAll}
              className="rounded border-gray-300"
            />
            <span className="text-sm font-medium">Select all batches</span>
          </label>
          <div className="flex items-center gap-4">
            {selectedBatches.size > 0 && (
              <span className="text-sm text-muted-foreground">
                Selected: {selectedBatches.size} batch(es), {selectedRows} row(s)
              </span>
            )}
            <form action={bulkRecalcAction}>
              {Array.from(selectedBatches).map((key) => (
                <input key={key} type="hidden" name="batchKey" value={key} />
              ))}
              <Button
                type="submit"
                variant="default"
                disabled={bulkRecalcPending || selectedBatches.size === 0}
              >
                {bulkRecalcPending ? "Recalculating…" : "Recalculate selected"}
              </Button>
              {bulkRecalcState.error ? (
                <span className="ml-2 text-xs text-destructive">
                  {bulkRecalcState.error}
                </span>
              ) : null}
              {bulkRecalcState.success ? (
                <span className="ml-2 text-xs text-green-600">
                  {bulkRecalcState.success}
                </span>
              ) : null}
            </form>
            <Button
              onClick={handleExport}
              disabled={selectedBatches.size === 0}
            >
              Export Selected ({selectedBatches.size} batch(es))
            </Button>
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">Select</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Employees</TableHead>
                <TableHead>Workera bonus</TableHead>
                <TableHead>Planilla bonus</TableHead>
                <TableHead>Difference</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((batch) => (
                <ComparisonBatchRow
                  key={batch.key}
                  batch={batch}
                  selected={selectedBatches.has(batch.key)}
                  onToggle={toggleBatch}
                />
              ))}
              {batches.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    No batches match the current filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function ComparisonBatchRow({
  batch,
  selected,
  onToggle,
}: {
  batch: Batch;
  selected: boolean;
  onToggle: (key: string) => void;
}) {
  const [recalcState, recalcAction, recalcPending] = useActionState<ComparisonState, FormData>(
    recalculateComparisonBatchAction,
    {},
  );

  const firstRow = batch.rows[0];
  const totalWorkera = batch.rows.reduce((sum, r) => sum + r.workeraBonus, 0);
  const totalPlanilla = batch.rows.reduce((sum, r) => sum + r.planillaBonus, 0);
  const totalDiff = batch.rows.reduce((sum, r) => sum + r.difference, 0);

  return (
    <TableRow key={batch.key}>
      <TableCell>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(batch.key)}
          className="rounded border-gray-300"
        />
      </TableCell>
      <TableCell className="font-mono text-xs">
        {firstRow.calculationId.slice(0, 8)}...
      </TableCell>
      <TableCell>{firstRow.calculation.site.name}</TableCell>
      <TableCell>{batch.rows.length}</TableCell>
      <TableCell>{totalWorkera.toLocaleString()}</TableCell>
      <TableCell>{totalPlanilla.toLocaleString()}</TableCell>
      <TableCell className={totalDiff < 0 ? "text-red-600" : "text-green-600"}>
        {totalDiff.toLocaleString()}
      </TableCell>
      <TableCell>
        <Badge variant={statusVariant(firstRow.reviewStatus) as any}>
          {firstRow.reviewStatus}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <form action={recalcAction}>
            <input type="hidden" name="workeraId" value={firstRow.calculationId} />
            <input type="hidden" name="planillaId" value={firstRow.planillaCalculationId ?? ""} />
            <Button type="submit" variant="outline" size="sm" disabled={recalcPending}>
              {recalcPending ? "…" : "Recalc"}
            </Button>
            {recalcState.error ? (
              <span className="ml-1 text-xs text-destructive">{recalcState.error}</span>
            ) : null}
            {recalcState.success ? (
              <span className="ml-1 text-xs text-green-600">{recalcState.success}</span>
            ) : null}
          </form>
          <form action={deleteComparisonBatch}>
            <input type="hidden" name="workeraId" value={firstRow.calculationId} />
            <input type="hidden" name="planillaId" value={firstRow.planillaCalculationId ?? ""} />
            <Button type="submit" variant="destructive" size="sm">Delete</Button>
          </form>
        </div>
      </TableCell>
    </TableRow>
  );
}