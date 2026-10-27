"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  assignDeviceToSiteAction,
  moveDeviceToSiteAction,
  toggleDeviceActiveAction,
} from "./actions";


export interface DeviceRow {
  id: string;
  name: string;
  deviceType: "biometric" | "mobile" | "web" | "other";
  isActive: boolean;
  siteId: string | null;
  siteName: string | null;
  lastUsed: Date | null;
  siteOptions: { id: string; name: string }[];
}

interface Props {
  devices: DeviceRow[];
  canManage: boolean;
}

const TYPE_LABEL: Record<string, string> = {
  biometric: "Biometric (clocking)",
  mobile: "Mobile (app)",
  web: "Web (portal)",
  other: "Other",
};

const TYPE_BADGE: Record<string, string> = {
  biometric: "bg-amber-100 text-amber-800",
  mobile: "bg-blue-100 text-blue-800",
  web: "bg-purple-100 text-purple-800",
  other: "bg-gray-100 text-gray-600",
};

export function DevicesTable({ devices, canManage }: Props) {
  if (devices.length === 0) {
    return <p className="text-sm text-muted-foreground">No devices registered yet.</p>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[220px]">Device</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Site</TableHead>
          <TableHead>Active</TableHead>
          <TableHead className="w-[140px]">Last used</TableHead>
          <TableHead className="w-[120px]">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {devices.map((dev) => (
          <TableRow key={dev.id}>
            <TableCell className="font-medium">{dev.name}</TableCell>
            <TableCell>
              <Badge className={TYPE_BADGE[dev.deviceType]}>{TYPE_LABEL[dev.deviceType]}</Badge>
            </TableCell>
            <TableCell>
              <span className={dev.siteName ? "text-sm font-medium" : "text-sm text-muted-foreground"}>
                {dev.siteName ?? <em className="text-xs">Unmapped</em>}
              </span>
            </TableCell>
            <TableCell>
              <Badge variant={dev.isActive ? "default" : "secondary"}>
                {dev.isActive ? "Active" : "Inactive"}
              </Badge>
            </TableCell>
            <TableCell className="text-sm">
              {dev.lastUsed ? (
                new Intl.DateTimeFormat("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                }).format(dev.lastUsed)
              ) : (
                <span className="text-muted-foreground">Never</span>
              )}
            </TableCell>
            <TableCell>
              {canManage ? <DeviceActions device={dev} /> : <span className="text-xs text-muted-foreground">—</span>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

interface DeviceActionsProps {
  device: DeviceRow;
}

function DeviceActions({ device }: DeviceActionsProps) {
  const [assignSite, setAssignSite] = useState(device.siteId ?? "");
  const [moveSite, setMoveSite] = useState(device.siteId ?? "");
  const [assignPending, setAssignPending] = useState(false);
  const [movePending, setMovePending] = useState(false);
  const [deactivatePending, setDeactivatePending] = useState(false);

  const otherSites = device.siteOptions.filter((s) => s.id !== device.siteId);

  const handleAssign = async () => {
    if (!assignSite) return;
    setAssignPending(true);
    try {
      const formData = new FormData();
      formData.append("deviceId", device.id);
      formData.append("siteId", assignSite);
      const res = await assignDeviceToSiteAction({}, formData);
      if (res?.error) { /* eslint-disable-next-line no-console */ console.error(res.error); }
    } finally {
      setAssignPending(false);
    }
  };

  const handleMove = async () => {
    if (!moveSite) return;
    setMovePending(true);
    try {
      const formData = new FormData();
      formData.append("deviceId", device.id);
      formData.append("siteId", moveSite);
      const res = await moveDeviceToSiteAction({}, formData);
      if (res?.error) { /* eslint-disable-next-line no-console */ console.error(res.error); }
    } finally {
      setMovePending(false);
    }
  };

  const handleToggleActive = async () => {
    setDeactivatePending(true);
    try {
      const formData = new FormData();
      formData.append("deviceId", device.id);
      const res = await toggleDeviceActiveAction({}, formData);
      if (res?.error) { /* eslint-disable-next-line no-console */ console.error(res.error); }
    } finally {
      setDeactivatePending(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {device.siteName ? (
        <>
          <label className="text-xs text-muted-foreground">Move to</label>
          <select
            value={moveSite}
            onChange={(e) => setMoveSite(e.target.value)}
            disabled={movePending}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
            aria-label="Move device to site"
          >
            {otherSites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <Button
            size="sm"
            className="h-7"
            onClick={handleMove}
            disabled={movePending || otherSites.length === 0 || !moveSite}
          >
            Move
          </Button>
        </>
      ) : (
        <>
          <label className="text-xs text-muted-foreground">Assign to site</label>
          <select
            value={assignSite}
            onChange={(e) => setAssignSite(e.target.value)}
            disabled={assignPending}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
            aria-label="Assign device to site"
          >
            <option value="">—</option>
            {device.siteOptions.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <Button
            size="sm"
            className="h-7"
            onClick={() => { setAssignPending(true); /* assign submitted via action */ }}
            disabled={assignPending || device.siteOptions.length === 0}
          >
            Assign
          </Button>
        </>
      )}

      <Button
        size="sm"
        variant="outline"
        className="h-7"
        onClick={() => { setDeactivatePending(true); /* toggle submitted via action */ }}
        disabled={deactivatePending}
      >
        {device.isActive ? "Deactivate" : "Reactivate"}
      </Button>
    </div>
  );
}
