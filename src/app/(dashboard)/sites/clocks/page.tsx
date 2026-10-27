import { Suspense } from "react";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DevicesTable } from "./devices-table";
import { DeviceSyncForm } from "./device-sync-form";

async function getDeviceList() {
  const sites = await db.site.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  const devices = await db.device.findMany({
    include: { site: true },
    orderBy: { name: "asc" },
  });

  // Compute last used date per device from attendance marks linked by inDevice name.
  const records = await db.attendanceRecord.findMany({
    select: { inDevice: true, date: true },
    where: {
      AND: [
        { inDevice: { not: null } },
        { inDevice: { not: "" } },
      ],
    },
    orderBy: { date: "desc" },
  });

  // Map device name -> last used date (earliest occurrence is fine for "last used")
  const lastUsedByDevice = new Map<string, Date>();
  // Records are desc, so first match per device is the most recent.
  for (const rec of records) {
    if (!lastUsedByDevice.has(rec.inDevice!)) {
      lastUsedByDevice.set(rec.inDevice!, rec.date);
    }
  }

  const list = devices.map((d) => {
    return {
      id: d.id,
      name: d.name,
      deviceType: d.deviceType as "biometric" | "mobile" | "web" | "other",
      isActive: d.isActive,
      siteId: d.siteId,
      siteName: d.site?.name ?? null,
      lastUsed: lastUsedByDevice.get(d.name) ?? null,
      siteOptions: sites,
    };
  });

  const session = await auth();
  const canManage = session?.user.role === "admin" || session?.user.role === "supervisor";
  return { list, canManage };
}

export default async function ClocksPage() {
  const { list, canManage } = await getDeviceList();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Clocks / Devices</h1>
        <p className="text-sm text-muted-foreground">
          Manage the biometric and mobile clocks mapped to sites. Click a device to
          assign, move, or deactivate it.
        </p>
      </div>

      <DeviceSyncForm />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Device inventory</CardTitle>
          <CardDescription>
            {list.length === 0
              ? "No devices registered yet."
              : `${list.length} device(s) found. All devices are currently unmapped to a site.`}
            {!canManage ? " Manage permissions require an admin or supervisor role." : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground">No devices registered yet.</p>
          ) : (
            <Suspense fallback={<div className="text-sm text-muted-foreground">Loading devices…</div>}>
              <DevicesTable devices={list} canManage={canManage} />
            </Suspense>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
