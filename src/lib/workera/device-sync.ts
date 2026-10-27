/**
 * High-level device sync, ADMS -> local DB + Workera.
 *
 * This module is the entry point for the "Sync Devices" server action / API route.
 */

import { db } from "@/lib/db";
import { AdmsConfig, AdmsDeviceRaw, admsDeviceTypeSchema } from "@/lib/providers/adms";
import { findNearestSite } from "@/lib/workera/site-attribution";

export type DeviceSyncReport = {
  discovered: number;
  created: number;
  updated: number;
  typeCounts: Record<string, number>;
  mapped: number;
  unmapped: number;
  /** Sites resolved for mobile/web devices (lat/lng -> site) */
  resolvedSites: Array<{ deviceName: string; site: { id: string; name: string } | null; distanceKm: number }>;
};

/**
 * Sync devices from ADMS into the local DB.
 *
 * Mobile/web devices are left with siteId = null; the site is determined
 * dynamically at punch time from GPS coordinates.
 *
 * SISTEMA devices keep siteId null until the admin maps them in the UI.
 */
export async function syncDevicesFromAdms(): Promise<DeviceSyncReport> {
  const [config, devices] = await Promise.all([
    (async () => {
      const dbConfig = await db.deviceConfig.findFirst({
        where: { active: true },
        orderBy: { createdAt: "desc" },
      });
      return {
        admsHost: dbConfig?.admsHost ?? process.env.ADMS_HOST ?? "",
        admsPort: dbConfig?.admsPort ?? parseInt(process.env.ADMS_PORT ?? "8080", 10),
        admsProtocol: dbConfig?.admsProtocol ?? (process.env.ADMS_PROTOCOL ?? "http"),
        timeoutMs: dbConfig?.admsTimeoutMs ?? parseInt(process.env.ADMS_TIMEOUT_MS ?? "15000", 10),
        active: dbConfig?.active ?? true,
      } as AdmsConfig;
    })(),
    (async () => {
      const dbDevices = await db.device.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
      });
      return dbDevices.map((d) => ({
        name: d.name,
        type: d.deviceType,
        host: d.admsHost ?? undefined,
        port: d.admsPort ?? undefined,
        intervalSec: d.syncIntervalSec ?? undefined,
        checksum: d.integrityChecksum ?? undefined,
      })) as AdmsDeviceRaw[];
    })(),
  ]);

  const typeCounts: Record<string, number> = { biometric: 0, mobile: 0, web: 0, sistema: 0 };
  let created = 0;
  let updated = 0;
  const resolvedSites: DeviceSyncReport["resolvedSites"] = [];

  for (const device of devices) {
    const existing = await db.device.findUnique({ where: { name: device.name } });
    const deviceType = admsDeviceTypeSchema.parse(device.type);

    const upsertData: Record<string, unknown> = {
      name: device.name,
      deviceType,
      admsHost: device.host ?? config.admsHost,
      admsPort: device.port ?? config.admsPort,
      admsProtocol: device.host ? (device.host.startsWith("https") ? "https" : "http") : config.admsProtocol,
      admsDeviceName: device.host ? device.name : undefined,
      syncIntervalSec: device.intervalSec ?? undefined,
      integrityChecksum: device.checksum ?? (existing?.integrityChecksum ?? null),
      isActive: true,
    };

    if (existing) {
      await db.device.update({ where: { id: existing.id }, data: upsertData });
      updated++;
    } else {
      await db.device.create({ data: upsertData as any });
      created++;
    }

    typeCounts[device.type] = (typeCounts[device.type] ?? 0) + 1;

    // Only resolve sites for GPS-dependent (mobile/web) devices when coordinates are known.
    if (device.type === "mobile" || device.type === "web") {
      // Coordinates come from the punch payload in real flow; here we leave them
      // for the punch-time attribution (see attendance-sync.ts). This loop is
      // only for counting unmapped devices for the UI report.
    }
  }

  // Count mapped / unmapped devices for the UI
  const allDevices = await db.device.findMany({
    where: { isActive: true },
    select: { id: true, name: true, deviceType: true, siteId: true },
  });

  let mapped = 0;
  let unmapped = 0;

  for (const d of allDevices) {
    if (d.siteId) {
      mapped++;
    } else {
      unmapped++;
    }
  }

  return {
    discovered: devices.length,
    created,
    updated,
    typeCounts,
    mapped,
    unmapped,
    resolvedSites,
  };
}

export type SyncDevicesResult = Awaited<ReturnType<typeof syncDevicesFromAdms>>;