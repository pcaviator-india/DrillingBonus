import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseChileLocal } from "@/lib/datetime";

/**
 * ZKTeco ADMS protocol — handshake + receive attendance records.
 *
 * GET /iclock/cdata?SN=<serial>&options=all
 *   → Device handshake. Returns config text that tells the device how to sync.
 *
 * POST /iclock/cdata?SN=<serial>&table=ATTLOG&Stamp=<stamp>
 *   → Device pushes attendance records (tab-separated lines).
 *   Body format per line: PIN\tTime\tStatus\tVerify\tWorkCode\t...
 *   → Returns "OK: <count>"
 */

// ── GET: Handshake ──────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const sn = req.nextUrl.searchParams.get("SN") ?? "unknown";
  const option = req.nextUrl.searchParams.get("option") ?? "";

  // Upsert device record so we know it's online
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
    console.error("[iclock/cdata GET] device upsert failed:", err);
  }

  // Return ZKTeco handshake config
  const stamp = Math.floor(Date.now() / 1000);
  const body =
    `GET OPTION FROM: ${sn}\r\n` +
    `Stamp=${stamp}\r\n` +
    `OpStamp=${stamp}\r\n` +
    `ErrorDelay=60\r\n` +
    `Delay=30\r\n` +
    `ResLogDay=18250\r\n` +
    `ResLogDelCount=10000\r\n` +
    `ResLogCount=50000\r\n` +
    `TransTimes=00:00;14:05\r\n` +
    `TransInterval=1\r\n` +
    `TransFlag=1111000000\r\n` +
    `Realtime=1\r\n` +
    `Encrypt=0\r\n`;

  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

// ── POST: Receive attendance records ────────────────────────────────────────
export async function POST(req: NextRequest) {
  const sn = req.nextUrl.searchParams.get("SN") ?? "unknown";
  const table = req.nextUrl.searchParams.get("table") ?? "ATTLOG";
  const stamp = req.nextUrl.searchParams.get("Stamp");

  const rawBody = await req.text();

  // Log raw punch for audit
  console.log(`[iclock/cdata POST] SN=${sn} table=${table} body=${rawBody.slice(0, 500)}`);

  // 1. If the body contains device metadata / options (like ~DeviceName=...), just acknowledge it
  if (rawBody.includes("~DeviceName=") || rawBody.includes("MAC=")) {
    console.log(`[iclock/cdata POST] Device metadata received (not attendance records). SN=${sn}`);
    return new NextResponse("OK", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // OPERLOG = device operation log, just acknowledge
  if (table === "OPERLOG") {
    const lines = rawBody.split(/\r\n|\r|\n/).filter((l) => l.trim());
    return new NextResponse(`OK: ${lines.length}`, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // ATTLOG = attendance records
  const lines = rawBody.split(/\r\n|\r|\n/).filter((l) => l.trim());
  let count = 0;
  let skipped = 0;
  let saved = 0;
  let errors = 0;

  console.log(`[iclock/cdata POST] SN=${sn} totalLines=${lines.length}`);

  for (const line of lines) {
    const parts = line.split("\t");
    if (parts.length < 2) {
      console.log(`[iclock/cdata POST] SKIP line (too few parts): "${line}"`);
      skipped++;
      continue;
    }

    const pin = parts[0].trim();
    const timeStr = parts[1].trim();
    const status = parts[2]?.trim() ?? "0"; // 0=check-in, 1=check-out
    const verify = parts[3]?.trim() ?? "";

    console.log(`[iclock/cdata POST] line pin="${pin}" timeStr="${timeStr}" status="${status}" verify="${verify}"`);

    if (!pin || !timeStr) {
      console.log(`[iclock/cdata POST] SKIP line (missing pin or timeStr): pin="${pin}" timeStr="${timeStr}"`);
      skipped++;
      continue;
    }

    // ── Robust Employee PIN Matching ─────────────────────────────────────
    // 1. Check dedicated zkPin field first (short numeric PIN from device)
    // 2. Fallback to workeraId (Workera employee code)
    // 3. Fallback to rut (may contain dots/dashes, try exact + cleaned)
    const cleanedRut = pin.replace(/[.\-]/g, "");

    const employee = await db.employee.findFirst({
      where: {
        OR: [
          { zkPin: pin },
          { workeraId: pin },
          { rut: pin },
          { rut: cleanedRut },
        ],
      },
    });

    if (!employee) {
      console.warn(`[iclock/cdata POST] Employee NOT FOUND for device PIN="${pin}" (cleanedRut="${cleanedRut}"). SN=${sn}`);
      skipped++;
      continue;
    }

    console.log(`[iclock/cdata POST] Employee matched: id="${employee.id}" name="${employee.fullName}" zkPin="${employee.zkPin}" rut="${employee.rut}" workeraId="${employee.workeraId}"`);

    // ── Correct Local Time Parsing (no "Z" suffix) ───────────────────────
    // ZKTeco sends local time like "2024-01-15 08:30:00" (Chile wall time).
    // Use parseChileLocal to convert to a correct UTC instant without double-offset.
    let punchDate: Date;
    try {
      punchDate = parseChileLocal(timeStr);
    } catch (err) {
      console.error(`[iclock/cdata POST] Failed to parse timeStr="${timeStr}" for PIN=${pin}:`, err);
      errors++;
      continue;
    }

    console.log(`[iclock/cdata POST] Parsed punchDate=${punchDate.toISOString()} for PIN=${pin}`);

    // Store as AttendanceMark (raw punch) with source="zkteco"
    try {
      const sourceRef = `${sn}-${pin}-${timeStr}`;
      await db.attendanceMark.upsert({
        where: {
          employeeId_sourceRef: { employeeId: employee.id, sourceRef },
        },
        create: {
          employeeId: employee.id,
          punchDateTime: punchDate,
          type: status === "0" ? "IN" : status === "1" ? "OUT" : "OTHER",
          origin: "DISPOSITIVO_BIOMETRICO",
          device: sn,
          source: "zkteco",
          sourceRef,
          rawData: { pin, timeStr, status, verify, sn, table, stamp } as any,
        },
        update: {},
      });
      saved++;
      count++;
      console.log(`[iclock/cdata POST] SAVED punch for PIN=${pin} sourceRef="${sourceRef}"`);

      // Also upsert into AttendanceRecord so the Attendance page shows this punch
      try {
        const punchDateOnly = new Date(
          punchDate.getFullYear(),
          punchDate.getMonth(),
          punchDate.getDate()
        );
        // Do NOT guess shift from time-of-day; leave it null for manual assignment later
        const shift = null;

        const existingRecord = await db.attendanceRecord.findFirst({
          where: {
            employeeId: employee.id,
            date: punchDateOnly,
            shift,
          },
        });

        if (existingRecord) {
          await db.attendanceRecord.update({
            where: { id: existingRecord.id },
            data: {
              timeIn: status === "0" ? punchDate : existingRecord.timeIn,
              timeOut: status === "1" ? punchDate : existingRecord.timeOut,
              rawData: { pin, timeStr, status, verify, sn, table, stamp } as any,
            },
          });
        } else {
          await db.attendanceRecord.create({
            data: {
              employeeId: employee.id,
              date: punchDateOnly,
              shift,
              timeIn: status === "0" ? punchDate : null,
              timeOut: status === "1" ? punchDate : null,
              hoursWorked: null,
              status: "present",
              corrected: false,
              needsReview: false,
              reviewStatus: "pending",
              source: "zkteco",
              rawData: { pin, timeStr, status, verify, sn, table, stamp } as any,
            },
          });
        }
      } catch (err) {
        console.error(`[iclock/cdata POST] FAILED to upsert AttendanceRecord for PIN=${pin}:`, err);
      }
    } catch (err) {
      errors++;
      console.error(`[iclock/cdata POST] FAILED to store punch for PIN=${pin}:`, err);
    }
  }

  console.log(`[iclock/cdata POST] SN=${sn} summary totalLines=${lines.length} saved=${saved} skipped=${skipped} errors=${errors}`);

  return new NextResponse(`OK: ${count}`, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}
