"use client";

import { useActionState, useTransition } from "react";
import {
  syncAttendanceAction,
  syncEmployeesAction,
  importOrgUnitsAction,
  toggleBranchAction,
  toggleDepartmentAction,
  type SyncState,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const initialState: SyncState = {};

export type OrgUnit = { code: string; name: string | null; selected: boolean };

function BranchDepartmentSelector({
  branches,
  departments,
}: {
  branches: OrgUnit[];
  departments: OrgUnit[];
}) {
  const [state, importAction, importPending] = useActionState(importOrgUnitsAction, initialState);
  const [pending, startTransition] = useTransition();

  const toggleBranch = (code: string, selected: boolean) =>
    startTransition(async () => {
      await toggleBranchAction(code, selected);
    });
  const toggleDepartment = (code: string, selected: boolean) =>
    startTransition(async () => {
      await toggleDepartmentAction(code, selected);
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Scope: Branch Offices & Departments</CardTitle>
        <CardDescription>
          Workera&apos;s /employee endpoint requires a branchOffice + department pair.
          Import the lists, then select which to sync (selection = selected rows
          combined). Selected pairs are used by employee and attendance sync.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form action={importAction}>
          <Button type="submit" variant="secondary" disabled={importPending || pending}>
            {importPending ? "Importing…" : "Import branches & departments from Workera"}
          </Button>
          {state.error ? <p className="mt-2 text-sm text-destructive">{state.error}</p> : null}
          {state.message ? <p className="mt-2 text-sm text-green-600">{state.message}</p> : null}
        </form>

        {branches.length > 0 || departments.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <div className="mb-2 text-sm font-semibold">
                Branch offices <Badge variant="outline">{branches.filter((b) => b.selected).length}/{branches.length}</Badge>
              </div>
              <div className="space-y-1">
                {branches.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Import first.</p>
                ) : (
                  branches.map((b) => (
                    <label key={b.code} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted text-sm">
                      <input
                        type="checkbox"
                        checked={b.selected}
                        disabled={pending}
                        onChange={(e) => toggleBranch(b.code, e.target.checked)}
                      />
                      <span className="font-mono text-xs">{b.code}</span>
                      <span className="text-muted-foreground">{b.name ?? "—"}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
            <div>
              <div className="mb-2 text-sm font-semibold">
                Departments <Badge variant="outline">{departments.filter((d) => d.selected).length}/{departments.length}</Badge>
              </div>
              <div className="space-y-1">
                {departments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Import first.</p>
                ) : (
                  departments.map((d) => (
                    <label key={d.code} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted text-sm">
                      <input
                        type="checkbox"
                        checked={d.selected}
                        disabled={pending}
                        onChange={(e) => toggleDepartment(d.code, e.target.checked)}
                      />
                      <span className="font-mono text-xs">{d.code}</span>
                      <span className="text-muted-foreground">{d.name ?? "—"}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ScopeSelector(props: { branches: OrgUnit[]; departments: OrgUnit[] }) {
  return <BranchDepartmentSelector {...props} />;
}

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function EmployeesSyncForm() {
  const [state, action, pending] = useActionState(async () => syncEmployeesAction(), initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Sync Employees</CardTitle>
        <CardDescription>
          Pulls employees (with roles and site codes) from Workera.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <Button type="submit" disabled={pending}>
            {pending ? "Syncing…" : "Run employee sync"}
          </Button>
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          {state.message ? <p className="text-sm text-green-600">{state.message}</p> : null}
        </form>
      </CardContent>
    </Card>
  );
}

function AttendanceSyncForm() {
  const [state, formAction, pending] = useActionState(syncAttendanceAction, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Sync Attendance</CardTitle>
        <CardDescription>
          Pulls daily attendance for a period. Run employee sync first.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="from">From</Label>
              <Input id="from" name="from" type="date" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to">To</Label>
              <Input id="to" name="to" type="date" required />
            </div>
          </div>
          <AttendanceSubmit pending={pending} />
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          {state.message ? <p className="text-sm text-green-600">{state.message}</p> : null}
        </form>
      </CardContent>
    </Card>
  );
}

function AttendanceSubmit({ pending }: { pending: boolean }) {
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Syncing…" : "Run attendance sync"}
    </Button>
  );
}

export function SyncForms({ mockMode }: { mockMode: boolean }) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Data source: <strong>{mockMode ? "Mock (WORKERA_MOCK=true)" : "Workera API"}</strong>
      </p>
      <EmployeesSyncForm />
      <AttendanceSyncForm />
    </div>
  );
}
