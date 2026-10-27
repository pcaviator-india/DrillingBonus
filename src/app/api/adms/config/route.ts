import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/adms/config
 *
 * Returns the ADMS configuration (host, port, protocol) that this service uses
 * to talk to the ADMS instance on the new rig.
 *
 * In Phase 1, we return a hardcoded default. The admin can update it on the
 * Clocks page, which writes to the `DeviceConfig` table.
 *
 * This is intentionally kept separate from the Workera client so that the
 * ADMS provider is interchangeable (CorePlan will replace ADMS later).
 */
export async function GET(_req: NextRequest) {
  try {
    const config = await db.deviceConfig.findFirst({
      where: { active: true },
      orderBy: { createdAt: "desc" },
    });

    const data = {
      admsHost: config?.admsHost ?? process.env.ADMS_HOST ?? "",
      admsPort: config?.admsPort ?? parseInt(process.env.ADMS_PORT ?? "8080", 10),
      admsProtocol: config?.admsProtocol ?? (process.env.ADMS_PROTOCOL ?? "http"),
      timeoutMs: config?.admsTimeoutMs ?? parseInt(process.env.ADMS_TIMEOUT_MS ?? "15000", 10),
      active: config?.active ?? true,
    };

    return NextResponse.json(data);
  } catch (err) {
    console.error("[adms/config] GET failed:", err);
    return NextResponse.json(
      { error: "Failed to read ADMS config" },
      { status: 500 },
    );
  }
}
