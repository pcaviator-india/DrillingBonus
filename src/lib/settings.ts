import { db } from "@/lib/db";

export type AppSettings = {
  autoUploadClocksToWorkera: boolean;
  autoSyncWorkeraToDb: boolean;
  autoSyncWorkeraFrequency: "daily" | "weekly" | "10days";
  lastWorkeraSyncAt: Date | null;
  lastClockUploadAt: Date | null;
};

const DEFAULTS: AppSettings = {
  autoUploadClocksToWorkera: false,
  autoSyncWorkeraToDb: false,
  autoSyncWorkeraFrequency: "daily",
  lastWorkeraSyncAt: null,
  lastClockUploadAt: null,
};

export async function getSettings(): Promise<AppSettings> {
  const row = await db.appSettings.findUnique({ where: { id: "singleton" } });
  if (!row) return DEFAULTS;
  return {
    autoUploadClocksToWorkera: row.autoUploadClocksToWorkera,
    autoSyncWorkeraToDb: row.autoSyncWorkeraToDb,
    autoSyncWorkeraFrequency: row.autoSyncWorkeraFrequency as AppSettings["autoSyncWorkeraFrequency"],
    lastWorkeraSyncAt: row.lastWorkeraSyncAt,
    lastClockUploadAt: row.lastClockUploadAt,
  };
}

export async function updateSettings(patch: Partial<AppSettings>) {
  await db.appSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...DEFAULTS, ...patch },
    update: patch,
  });
}

export async function touchLastWorkeraSync() {
  await updateSettings({ lastWorkeraSyncAt: new Date() });
}

export async function touchLastClockUpload() {
  await updateSettings({ lastClockUploadAt: new Date() });
} 