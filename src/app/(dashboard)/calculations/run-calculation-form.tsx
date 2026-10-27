"use client";

import { useActionState } from "react";
import {
  runCalculationAction,
  rebuildCrewAssignmentsAction,
  type RunCalculationState,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: RunCalculationState = {};

export function RunCalculationForm({
  sites,
}: {
  sites: { id: string; name: string; ruleSets: { id: string; name: string; version: number }[] }[];
}) {
  const [state, formAction, pending] = useActionState(runCalculationAction, initialState);
  const [rebuildState, rebuildAction, rebuildPending] = useActionState(
    rebuildCrewAssignmentsAction,
    initialState,
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Rebuild crew assignments</CardTitle>
          <CardDescription>
            Matches planilla entries to employees (by RUT) and rigs (by machine name) to create
            crew assignments needed for calculations. Use this after uploading planilla files.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={rebuildAction} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="rebuildFrom">From</Label>
              <Input id="rebuildFrom" name="from" type="date" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rebuildTo">To</Label>
              <Input id="rebuildTo" name="to" type="date" required />
            </div>
            <Button type="submit" variant="secondary" disabled={rebuildPending}>
              {rebuildPending ? "Rebuilding…" : "Rebuild crew assignments"}
            </Button>
          </form>
          {rebuildState.success ? (
            <p className="mt-2 text-sm text-green-600">{rebuildState.success}</p>
          ) : null}
          {rebuildState.error ? (
            <p className="mt-2 text-sm text-destructive">{rebuildState.error}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Run calculation</CardTitle>
          <CardDescription>
            Site + period + rule set. Runs in the background — you can launch
            another calculation right away; the bubble at the bottom reports the
            result. The engine is pure; results are stored with the full input
            snapshot.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="siteId">Site</Label>
                <select
                  id="siteId"
                  name="siteId"
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ruleSetId">Rule set</Label>
                <select
                  id="ruleSetId"
                  name="ruleSetId"
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {sites.flatMap((s) =>
                    s.ruleSets.map((rs) => (
                      <option key={rs.id} value={rs.id}>
                        {s.name} — {rs.name} (v{rs.version})
                      </option>
                    )),
                  )}
                </select>
              </div><div className="space-y-2"><Label htmlFor="source">Calculation source</Label><select id="source" name="source" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="workera">Workera — official calculation</option><option value="planilla">Planilla Diaria — comparison calculation</option></select></div><div className="space-y-2"><Label htmlFor="periodStart">Period start</Label><Input id="periodStart" name="periodStart" type="date" required /></div>
              <div className="space-y-2">
                <Label htmlFor="periodEnd">Period end</Label>
                <Input id="periodEnd" name="periodEnd" type="date" required />
              </div>
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Calculating…" : "Run calculation"}
            </Button>
            {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
            {state.success ? <p className="text-sm text-green-600">{state.success}</p> : null}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
