"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { updateSettings } from "@/lib/settings";
import type { AppSettings } from "@/lib/settings";

export type SettingsState = { error?: string; message?: string };

export async function saveSettingsAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const session = await auth();
  if (!session?.user) return { error: "Not authenticated" };
  await updateSettings({
    autoUploadClocksToWorkera: formData.get("autoUploadClocksToWorkera") === "on",
    autoSyncWorkeraToDb: formData.get("autoSyncWorkeraToDb") === "on",
    autoSyncWorkeraFrequency: (formData.get("autoSyncWorkeraFrequency") as AppSettings["autoSyncWorkeraFrequency"]) ?? "daily",
  });
  revalidatePath("/settings");
  return { message: "Settings saved." };
} 