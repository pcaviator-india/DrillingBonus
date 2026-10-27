import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { workeraClient } from "@/lib/workera/client";

/**
 * POST /api/workera/events
 *
 * Push a single attendance punch to Workera.
 *
 * Used for SISTEMA-type devices (admin-marked attendance). When a SISTEMA
 * device records a punch, it is pushed here so the employee's Workera record
 * is updated immediately.
 *
 * Payload:
 *  {
 *    employeeCode: string;   // Workera employee code
 *    eventType: string;      // "IN" | "OUT" | "BREAK_START" | "BREAK_END"
 *    timestamp: string;      // ISO 8601 (Chile local, will be normalized on the other side)
 *    deviceName?: string;    // ADMS device name
 *    checksum?: string;      // idempotency checksum
 *  }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { employeeCode, eventType, timestamp, deviceName, checksum } = body as {
      employeeCode: string;
      eventType: string;
      timestamp: string;
      deviceName?: string;
      checksum?: string;
    };

    if (!employeeCode || !eventType || !timestamp) {
      return NextResponse.json(
        { error: "Missing required fields: employeeCode, eventType, timestamp" },
        { status: 400 },
      );
    }

    await workeraClient.postAttendanceEvent({
      employeeCode,
      eventType,
      timestamp,
      deviceName,
      checksum,
    });

    // Also store locally so we have an audit trail (idempotent via checksum).
    // Note: this is a Phase 3 concern; the actual AttendanceMark/Record upsert
    // happens in the attendance sync. For now we acknowledge the Workera call.
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[workera/events] POST failed:", err);
    const message =
      err instanceof Error ? err.message : "Failed to post attendance event";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
