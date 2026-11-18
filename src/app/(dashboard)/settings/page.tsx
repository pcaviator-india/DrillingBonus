import { getSettings } from "@/lib/settings";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const s = await getSettings();
  return <SettingsClient initialSettings={s} />;
} 