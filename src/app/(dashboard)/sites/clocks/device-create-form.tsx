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
import { createDeviceAction, type CreateDeviceState } from "./actions";
import { Plus, Loader2 } from "lucide-react";

export interface DeviceCreateFormProps {
  sites: { id: string; name: string }[];
}

export function DeviceCreateForm({ sites }: DeviceCreateFormProps) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<CreateDeviceState | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    setResult(null);
    const formData = new FormData(e.currentTarget);
    try {
      const res = await createDeviceAction({}, formData);
      setResult(res);
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="h-4 w-4" /> Add Device Manually
        </CardTitle>
        <CardDescription>
          Register a clock (e.g. from "Lista de relojes") and assign it to a
          site. Changing a device&rsquo;s site later only affects new attendance
          marks; historical records keep their original site attribution.
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
              <label className="text-sm font-medium">Device name (Serie)</label>
              <input
                name="deviceName"
                type="text"
                placeholder="e.g. HWM4244700730"
                required
                className="h-8 rounded-md border border-input bg-input px-3 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Site</label>
              <select
                name="siteId"
                required
                className="h-8 rounded-md border border-input bg-input px-3 text-sm"
              >
                <option value="">— Select site —</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Type</label>
              <select
                name="deviceType"
                defaultValue="biometric"
                className="h-8 rounded-md border border-input bg-input px-3 text-sm"
              >
                <option value="biometric">Biometric (clocking)</option>
                <option value="mobile">Mobile (app)</option>
                <option value="web">Web (portal)</option>
                <option value="sistema">Admin-marked</option>
              </select>
            </div>
          </div>
          <Button type="submit" disabled={pending} className="gap-2">
            <Loader2 className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
            {pending ? "Creating…" : "Create device"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}