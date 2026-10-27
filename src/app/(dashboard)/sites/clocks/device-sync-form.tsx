"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, RefreshCw, Smartphone, Monitor, MonitorOff, Settings } from "lucide-react";
import { useEffect, useState } from "react";

export type DeviceSyncReport = {
  discovered: number;
  created: number;
  updated: number;
  typeCounts: Record<string, number>;
  mapped: number;
  unmapped: number;
  resolvedSites: Array<{
    deviceName: string;
    site: { id: string; name: string } | null;
    distanceKm: number;
  }>;
};

type Props = {
  initial?: DeviceSyncReport;
  onSync?: (report: DeviceSyncReport) => void;
};

export function DeviceSyncForm({ initial, onSync }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initial?.discovered ? null : null);
  const [report, setReport] = useState<DeviceSyncReport | null>(initial ?? null);

  async function handleSync() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/devices/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Sync failed");
        return;
      }
      setReport(data as DeviceSyncReport);
      onSync?.(data as DeviceSyncReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setLoading(false);
    }
  }

  // Refresh every 30s while loading
  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => {
      fetch("/api/devices/sync", { method: "POST" })
        .then((r) => r.json())
        .then((d) => {
          if (d.success) setReport(d as DeviceSyncReport);
        })
        .catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, [loading]);

  const typeLabel: Record<string, string> = {
    biometric: "Rig clock",
    mobile: "Android / iOS",
    web: "Portal del Trabajador",
    sistema: "Admin-marked",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Sync Devices from ADMS
        </CardTitle>
        <CardDescription>
          Reads the ADMS device inventory from the new rig and upserts it into the
          local DB. Android/iOS/Portal devices are left unmapped (site is
          determined from GPS at punch time). SISTEMA devices stay unmapped until
          an admin assigns them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {report && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="font-medium">Discovered:</span> {report.discovered}
            </div>
            <div>
              <span className="font-medium">Created:</span> {report.created}
            </div>
            <div>
              <span className="font-medium">Updated:</span> {report.updated}
            </div>
            <div>
              <span className="font-medium">Unmapped:</span> {report.unmapped}
            </div>
          </div>
        )}

        <Button
          onClick={handleSync}
          disabled={loading}
          className="gap-2"
          variant="default"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Syncing…" : "Sync Now"}
        </Button>

        {report?.typeCounts && (
          <>
            <h4 className="text-xs font-medium uppercase text-muted-foreground">
              Device type breakdown
            </h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(
                  [
                    { key: "biometric", icon: <Settings className="h-3 w-3" /> },
                    { key: "mobile", icon: <Smartphone className="h-3 w-3" /> },
                    { key: "web", icon: <Monitor className="h-3 w-3" /> },
                    { key: "sistema", icon: <MonitorOff className="h-3 w-3" /> },
                  ] as const
                ).map(({ key, icon }) => (
                  <TableRow key={key}>
                    <TableCell>
                      <span className="flex items-center gap-1.5">
                        {icon}
                        {key === "biometric"
                          ? "Rig clock"
                          : key === "mobile"
                          ? "Android / iOS"
                          : key === "web"
                          ? "Portal del Trabajador"
                          : "Admin-marked (SISTEMA)"}
                        </span>
                    </TableCell>
                    <TableCell className="text-right">{report.typeCounts[key]}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}

        {report?.mapped !== undefined && report?.unmapped !== undefined && (
          <p className="text-xs text-muted-foreground">
            {report.mapped} mapped | {report.unmapped} unmapped (awaiting GPS attribution)
          </p>
        )}
      </CardContent>
    </Card>
  );
}
