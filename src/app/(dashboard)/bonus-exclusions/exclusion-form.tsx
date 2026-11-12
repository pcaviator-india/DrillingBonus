"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createExclusionAction,
  type ExclusionActionState,
} from "./actions";

interface ExclusionFormProps {
  employees: { id: string; fullName: string; rut?: string | null }[];
  sites: { id: string; name: string }[];
}

export function ExclusionForm({ employees, sites }: ExclusionFormProps) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ExclusionActionState | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    setResult(null);
    const formData = new FormData(e.currentTarget);
    try {
      const res = await createExclusionAction({}, formData);
      setResult(res);
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add Bonus Exclusion</CardTitle>
        <CardDescription>
          Exclude an employee from bonus calculations. Leave Site blank to
          exclude from all sites.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {result?.error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {result.error}
          </div>
        )}
        {result?.success && (
          <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            {result.success}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Employee</Label>
              <select
                name="employeeId"
                required
                className="h-8 rounded-md border border-input bg-input px-3 text-sm"
              >
                <option value="">Select employee</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.fullName}{emp.rut ? ` (${emp.rut})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Site (optional — all sites if blank)</Label>
              <select
                name="siteId"
                className="h-8 rounded-md border border-input bg-input px-3 text-sm"
              >
                <option value="">All sites</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Reason</Label>
              <Input
                name="reason"
                type="text"
                placeholder="e.g. On leave, not eligible"
                className="h-8 rounded-md border border-input bg-input px-3 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Effective From</Label>
              <Input
                name="effectiveFrom"
                type="date"
                required
                className="h-8 rounded-md border border-input bg-input px-3 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Effective To (optional — ongoing if blank)</Label>
              <Input
                name="effectiveTo"
                type="date"
                className="h-8 rounded-md border border-input bg-input px-3 text-sm"
              />
            </div>
          </div>
          <Button type="submit" disabled={pending} className="gap-2">
            {pending ? "Creating…" : "Create exclusion"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}