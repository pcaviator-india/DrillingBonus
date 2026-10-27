"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ReconciliationSiteOption = { id: string; name: string };

/**
 * Period + site scope for both reconciliation pages. Everything else (verdict,
 * shift, search…) is filtered client-side in each match table.
 */
export function ReconciliationFilters({
  sites,
  defaultFrom,
  defaultTo,
  defaultTolerance,
  toleranceOptions,
  showTolerance = false,
}: {
  sites: ReconciliationSiteOption[];
  defaultFrom: string;
  defaultTo: string;
  defaultTolerance?: number;
  toleranceOptions?: readonly number[];
  showTolerance?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const selectClass =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Period</CardTitle>
        <CardDescription>
          Comparing both sources for this range. Changes apply instantly.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="from">From</Label>
            <Input
              id="from"
              type="date"
              defaultValue={defaultFrom}
              onChange={(e) => setParam("from", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="to">To</Label>
            <Input
              id="to"
              type="date"
              defaultValue={defaultTo}
              onChange={(e) => setParam("to", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="site">Site</Label>
            <select
              id="site"
              className={selectClass}
              value={searchParams.get("site") ?? ""}
              onChange={(e) => setParam("site", e.target.value)}
            >
              <option value="">All sites</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          {showTolerance ? (
            <div className="space-y-2">
              <Label htmlFor="tolerance">Meters tolerance</Label>
              <select
                id="tolerance"
                className={selectClass}
                value={searchParams.get("tolerance") ?? String(defaultTolerance ?? 0)}
                onChange={(e) => setParam("tolerance", e.target.value)}
              >
                {(toleranceOptions ?? []).map((t) => (
                  <option key={t} value={String(t)}>
                    {t === 0 ? "Exact match" : `± ${t} m`}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Planilla and drilling values inside this tolerance count as matched.
              </p>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
