import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * ZKTeco ADMS protocol — device polling endpoint.
 *
 * GET /iclock/getrequest?SN=<serial>
 *   → Device polls for pending commands. Returns "OK" if none.
 */
export async function GET(req: NextRequest) {
  const sn = req.nextUrl.searchParams.get("SN") ?? "unknown";

  // Update device last-seen
  try {
    const existing = await db.device.findUnique({ where: { name: sn } });
    if (existing) {
      await db.device.update({
        where: { id: existing.id },
        data: { isActive: true, updatedAt: new Date() },
      });
    } else {
      await db.device.create({
        data: { name: sn, deviceType: "biometric", isActive: true },
      });
    }
  } catch (err) {
    console.error("[iclock/getrequest] device upsert failed:", err);
  }

  return new NextResponse("OK", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}
