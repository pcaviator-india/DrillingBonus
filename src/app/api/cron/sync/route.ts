import { NextResponse } from "next/server";
import { getSettings, touchLastWorkeraSync } from "@/lib/settings";
import { syncAttendanceFromWorkera } from "@/lib/workera/sync";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const s = await getSettings();
  const result: Record<string, unknown> = {};
  if (s.autoSyncWorkeraToDb) {
    const today = new Date().toISOString().slice(0, 10);
    const from = today;
    await syncAttendanceFromWorkera(from, today);
    await touchLastWorkeraSync();
    result.workeraSync = "done";
  }
  return NextResponse.json(result);
} 