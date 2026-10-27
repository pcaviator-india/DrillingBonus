"use client";

import { useActionState, useState } from "react";
import { updateSiteAction, type UpdateSiteState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: UpdateSiteState = {};

/**
 * Per-site settings editor: address, GPS coordinates, and the geofence
 * radius (sites often have low GPS signal, so radius is configurable per site).
 * Renders inline under a site row when the user opens its "Settings" tab.
 */
export function SiteSettingsForm({
  site,
}: {
  site: {
    id: string;
    name: string;
    code: string | null;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    gpsRadiusKm: number;
    autoApproveGps: boolean;
  };
}) {
  const [state, formAction, pending] = useActionState(updateSiteAction, initialState);
  const [open, setOpen] = useState(false);

  return (
    <div>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
        {open ? "Close settings" : "Settings"}
      </Button>

      {open ? (
        <form action={formAction} className="mt-3 rounded-md border p-4 space-y-4">
          <p className="text-sm font-medium">Geofence settings — {site.name}</p>
          <input type="hidden" name="siteId" value={site.id} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`name-${site.id}`}>Name</Label>
              <Input id={`name-${site.id}`} name="name" defaultValue={site.name} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`code-${site.id}`}>Code</Label>
              <Input id={`code-${site.id}`} name="code" defaultValue={site.code ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`addr-${site.id}`}>Address</Label>
              <Input
                id={`addr-${site.id}`}
                name="address"
                defaultValue={site.address ?? ""}
                placeholder="e.g. Ruta 31, Km 12, sector X"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`rad-${site.id}`}>GPS radius (km)</Label>
              <Input
                id={`rad-${site.id}`}
                name="gpsRadiusKm"
                type="number"
                step="0.1"
                min="0.1"
                max="500"
                defaultValue={site.gpsRadiusKm}
              />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input
                id={`auto-${site.id}`}
                name="autoApproveGps"
                type="checkbox"
                defaultChecked={site.autoApproveGps}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <Label htmlFor={`auto-${site.id}`}>Auto-approve within range</Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`lat-${site.id}`}>Latitude</Label>
              <Input
                id={`lat-${site.id}`}
                name="latitude"
                type="number"
                step="any"
                min="-90"
                max="90"
                defaultValue={site.latitude ?? ""}
                placeholder="e.g. -26.79744"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`lon-${site.id}`}>Longitude</Label>
              <Input
                id={`lon-${site.id}`}
                name="longitude"
                type="number"
                step="any"
                min="-180"
                max="180"
                defaultValue={site.longitude ?? ""}
                placeholder="e.g. -69.25353"
              />
            </div>
          </div>
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          {state.success ? <p className="text-sm text-green-600">{state.success}</p> : null}
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save settings"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}