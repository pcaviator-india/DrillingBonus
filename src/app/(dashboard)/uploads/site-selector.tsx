"use client";

import { useTransition } from "react";
import { assignUploadSiteAction } from "./actions";

export function SiteSelector({
  uploadId,
  siteId,
  sites,
}: {
  uploadId: string;
  siteId: string | null;
  sites: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      className="h-9 min-w-44 rounded-md border bg-background px-2 text-sm"
      value={siteId ?? ""}
      disabled={pending}
      aria-label="Upload site"
      onChange={(event) => {
        const nextSiteId = event.target.value;
        startTransition(() => {
          void assignUploadSiteAction(uploadId, nextSiteId);
        });
      }}
    >
      <option value="">Unknown</option>
      {sites.map((site) => (
        <option key={site.id} value={site.id}>
          {site.name}
        </option>
      ))}
    </select>
  );
}
