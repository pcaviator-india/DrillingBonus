"use client";

import { useActionState } from "react";
import { createSiteAction, type CreateSiteState } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: CreateSiteState = {};

export function CreateSiteForm() {
  const [state, formAction, pending] = useActionState(createSiteAction, initialState);

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="text-lg">Add Site</CardTitle>
        <CardDescription>Adding a new site requires no code changes.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" placeholder="e.g. Site Norte" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="code">Code (optional)</Label>
            <Input id="code" name="code" placeholder="e.g. SITE-01" />
          </div>
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          {state.success ? <p className="text-sm text-green-600">{state.success}</p> : null}
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create site"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
