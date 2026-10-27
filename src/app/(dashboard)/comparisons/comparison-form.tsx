"use client";

import { createComparisonAction, createBulkComparisonsAction, type ComparisonState } from "./actions";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Option = { id: string; label: string };

export function CreateComparisonForm({ workera, planilla }: { workera: Option[]; planilla: Option[] }) {
  const [state, action, pending] = useActionState<ComparisonState, FormData>(createComparisonAction, {});
  return <Card><CardHeader><CardTitle>Compare two calculations</CardTitle><CardDescription>Select one Workera official calculation and one Planilla comparison calculation for the same period.</CardDescription></CardHeader><CardContent><form action={action} className="space-y-4"><div className="grid gap-4 md:grid-cols-2"><label className="space-y-2">Workera calculation<select name="workeraId" required className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"><option value="">Select Workera…</option>{workera.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label><label className="space-y-2">Planilla calculation<select name="planillaId" required className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"><option value="">Select Planilla…</option>{planilla.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label></div><Button disabled={pending}>{pending ? "Creating…" : "Create comparison"}</Button>{state.error?<p className="text-sm text-destructive">{state.error}</p>:null}{state.success?<p className="text-sm text-green-600">{state.success}</p>:null}</form></CardContent></Card>;
}

export function BulkComparisonForm({ workera, planilla }: { workera: Option[]; planilla: Option[] }) {
  const [state, action, pending] = useActionState<ComparisonState, FormData>(createBulkComparisonsAction, {});
  return <Card><CardHeader><CardTitle>Bulk comparison</CardTitle><CardDescription>Select Workera and Planilla calculations from the same period. Every possible pair is created; existing pairs are skipped.</CardDescription></CardHeader><CardContent><form action={action} className="space-y-4"><div className="grid gap-4 md:grid-cols-2"><label className="space-y-2">Workera calculations<select name="workeraIds" multiple required size={Math.min(8, workera.length)} className="flex w-full rounded-md border bg-background p-2 text-sm">{workera.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label><label className="space-y-2">Planilla calculations<select name="planillaIds" multiple required size={Math.min(8, planilla.length)} className="flex w-full rounded-md border bg-background p-2 text-sm">{planilla.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label></div><Button disabled={pending}>{pending ? "Creating comparisons…" : "Create all selected comparisons"}</Button>{state.error?<p className="text-sm text-destructive">{state.error}</p>:null}{state.success?<p className="text-sm text-green-600">{state.success}</p>:null}</form></CardContent></Card>;
}

