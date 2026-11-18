"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type JobDto = {
  id: string;
  type: string;
  label: string;
  status: "PENDING" | "RUNNING" | "DONE" | "ERROR";
  message: string | null;
  error: string | null;
  progress: number | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
};

export function JobStatus() {
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: NodeJS.Timeout;

    const fetchJobs = async () => {
      if (cancelled) return;
      setPolling(true);
      try {
        const res = await fetch("/api/jobs", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setJobs((data.jobs ?? []).filter((j: JobDto) => j.type.startsWith("sync_")));
        }
      } catch {
        // ignore poll errors
      } finally {
        if (!cancelled) setPolling(false);
      }
    };

    fetchJobs();
    timer = setInterval(fetchJobs, 5000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const latest = jobs[0];
  const isRunning = latest?.status === "PENDING" || latest?.status === "RUNNING";

  if (!latest) return null;

  const statusColor = {
    PENDING: "bg-yellow-500/10 text-yellow-700 border-yellow-200",
    RUNNING: "bg-blue-500/10 text-blue-700 border-blue-200",
    DONE: "bg-green-500/10 text-green-700 border-green-200",
    ERROR: "bg-red-500/10 text-red-700 border-red-200",
  }[latest.status];

  return (
    <Card className="border-l-4 border-transparent">
      <CardHeader className={`border-l-4 ${statusColor}`}>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Badge
            variant="secondary"
            className={`animate-pulse ${isRunning ? "bg-blue-500/20 text-blue-600 border-blue-300" : ""}`}
          >
            {latest.status.charAt(0) + latest.status.slice(1).toLowerCase()}
          </Badge>
          {latest.label}
        </CardTitle>
        <CardDescription>
          {latest.progress != null ? `Progress: ${latest.progress}%` : ""}
          {latest.error ? ` · Error: ${latest.error}` : ""}
          {latest.message ? ` · ${latest.message}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">
          {latest.type} · Started {new Date(latest.createdAt).toLocaleTimeString()}
          {latest.finishedAt ? ` · Finished ${new Date(latest.finishedAt).toLocaleTimeString()}` : ""}
        </div>
        {polling && <span className="text-xs text-blue-500">● Polling for updates…</span>}
      </CardContent>
    </Card>
  );
}