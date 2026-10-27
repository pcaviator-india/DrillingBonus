import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/adms/devices
 *
 * Returns the device inventory from ADMS.
 *
 * In Phase 1, we return the devices already stored in the local `Device` table
 * (discovered from ADMS during the last sync). The admin can trigger a new sync
 * from the Clocks page.
 *
 * The `Device` table stores:
 *  - name:              unique device name (e.g. "HWM4244700621")
 *  - deviceType:        bezier | mobile | web | sistema
 *  - admsHost/port:     endpoint of this device (if different from config)
 *  - admsDeviceName:    authoritative device name from ADMS (if different)
 *  - syncIntervalSec:   auto-sync interval
 *  - integrityChecksum: SHA-256 (changed on every re-sync)
 */
export async function GET(_req: NextRequest) {
  try {
    const devices = await db.device.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        deviceType: true,
        admsHost: true,
        admsPort: true,
        admsProtocol: true,
        admsDeviceName: true,
        syncIntervalSec: true,
        integrityChecksum: true,
        siteId: true,
        isActive: true,
      },
    });

    return NextResponse.json({ devices });
  } catch (err) {
    console.error("[adms/devices] GET failed:", err);
    return NextResponse.json(
      { error: "Failed to read ADMS devices" },
      { status: 500 },
    );
  }
}
