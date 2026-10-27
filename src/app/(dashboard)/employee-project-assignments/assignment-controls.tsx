"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { AssignmentActionState, createProjectAssignmentAction, generateProjectSuggestionsAction, reviewProjectSuggestionAction, updateProjectAssignmentStatusAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = { employees: { id: string; name: string }[]; sites: { id: string; name: string }[] };
const initial: AssignmentActionState = {};

export function CreateAssignmentForm({ employees, sites }: Props) {
  const [state, action, pending] = useActionState(createProjectAssignmentAction, initial);
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  useEffect(() => { if (state.success) router.refresh(); }, [state.success, router]);
  return <form action={action} className="grid gap-3 md:grid-cols-4">
    <select name="employeeId" required className="h-10 rounded-md border px-2 text-sm"><option value="">Employee</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
    <select name="siteId" required className="h-10 rounded-md border px-2 text-sm"><option value="">Project/site</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
    <Input name="startDate" type="date" defaultValue={today} required />
    <Input name="endDate" type="date" aria-label="End date" />
    <Input name="note" placeholder="Optional note" className="md:col-span-3" />
    <Button disabled={pending}>{pending ? "Saving…" : "Approve assignment"}</Button>
    {state.error ? <p className="text-sm text-destructive md:col-span-4">{state.error}</p> : null}
  </form>;
}

export function GenerateSuggestionsForm() {
  const [state, action, pending] = useActionState(generateProjectSuggestionsAction, initial);
  return <form action={action} className="flex flex-wrap items-end gap-3"><div className="space-y-1"><label className="text-xs" htmlFor="suggestion-from">From</label><Input id="suggestion-from" name="from" type="date" required /></div><div className="space-y-1"><label className="text-xs" htmlFor="suggestion-to">To</label><Input id="suggestion-to" name="to" type="date" required /></div><Button variant="secondary" disabled={pending}>{pending ? "Detecting…" : "Detect from Excel"}</Button>{state.success ? <span className="text-sm text-green-600">{state.success}</span> : null}{state.error ? <span className="text-sm text-destructive">{state.error}</span> : null}</form>;
}

export function SuggestionReviewButtons({ id, status }: { id: string; status: string }) {
  const [state, action, pending] = useActionState(reviewProjectSuggestionAction, initial);
  return <form action={action} className="flex gap-1"><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={status === "approved" ? "rejected" : "approved"} /><Button type="submit" size="sm" variant={status === "approved" ? "destructive" : "default"} disabled={pending}>{status === "approved" ? "Reject" : "Approve"}</Button>{state.error ? <span className="text-xs text-destructive">{state.error}</span> : null}</form>;
}

export function AssignmentStatusButton({ id, status }: { id: string; status: string }) {
  const [state, action, pending] = useActionState(updateProjectAssignmentStatusAction, initial);
  const router = useRouter();
  useEffect(() => { if (state.success) router.refresh(); }, [state.success, router]);
  const next = status === "approved" ? "rejected" : "approved";
  return <form action={action} className="inline-flex items-center gap-2">
    <input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={next} />
    <Button type="submit" size="sm" variant={next === "rejected" ? "destructive" : "default"} disabled={pending}>{pending ? "…" : next === "rejected" ? "Reject" : "Approve"}</Button>
    {state.error ? <span className="text-xs text-destructive">{state.error}</span> : null}
  </form>;
}
