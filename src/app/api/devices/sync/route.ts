import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { syncDevicesFromAdms } from "@/lib/workera/device-sync";

/**
 * POST /api/devices/sync
 *
 * Trigger a device sync from ADMS into the local DB.
 *
 * Requires admin/supervisor role.
 *
 * Flow:
 *  1. Fetch ADMS config + device inventory.
 *  2. Upsert each device into `Device` (name = unique key).
 *  3. Mobile/web (Android/iOS/Portal) devices: leave siteId=null — site is
 *     determined dynamically at punch time from GPS coordinates.
 *  4. SISTEMA devices: keep siteId=null until admin maps them in UI.
 *  5. Return a report with created/updated counts + type breakdown.
 */
export async function POST(req: NextRequest) {
  try {
    // 1) Auth
    const session = await auth();
    const user = session?.user;
    const isAdmin = user?.role === "admin";
    const isSupervisor = user?.role === "supervisor";
    if (!isAdmin && !isSupervisor) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 2) Sync devices
    const report = await syncDevicesFromAdms();

    return NextResponse.json({
      success: true,
      ...report,
    });
  } catch (err) {
    console.error("[devices/sync] POST failed:", err);
    const message =
      err instanceof Error ? err.message : "Failed to sync devices";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
