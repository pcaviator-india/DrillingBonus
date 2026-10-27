import { getSettings } from "@/lib/settings";
import { saveSettingsAction } from "./actions";

export default async function SettingsPage() {
  const s = await getSettings();
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <form action={saveSettingsAction as any} className="space-y-6">
        <div className="rounded border p-4 space-y-3">
          <h2 className="font-semibold">Clock upload to Workera</h2>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="autoUploadClocksToWorkera" defaultChecked={s.autoUploadClocksToWorkera} />
            Auto-upload biometric punches to Workera
          </label>
          <p className="text-sm text-muted-foreground">When off, automatic upload is disabled. There is no manual upload button on the Sync page.</p>
        </div>
        <div className="rounded border p-4 space-y-3">
          <h2 className="font-semibold">Workera → DB sync</h2>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="autoSyncWorkeraToDb" defaultChecked={s.autoSyncWorkeraToDb} />
            Auto-sync Workera attendance into our database
          </label>
          <div>
            <label className="block text-sm mb-1">Frequency</label>
            <select name="autoSyncWorkeraFrequency" defaultValue={s.autoSyncWorkeraFrequency} className="border rounded p-1">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="10days">Every 10 days</option>
            </select>
          </div>
        </div>
        <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded">Save</button>
      </form>
    </div>
  );
} 