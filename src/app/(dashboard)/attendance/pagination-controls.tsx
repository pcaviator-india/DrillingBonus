"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function PaginationControls({
  page,
  totalPages,
  perPage,
  perPageOptions,
}: {
  page: number;
  totalPages: number;
  perPage: number;
  perPageOptions: number[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function navigate(newPage: number, newPerPage?: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (newPage > 1) params.set("page", String(newPage));
    else params.delete("page");
    if (newPerPage && newPerPage !== 50) params.set("perPage", String(newPerPage));
    else params.delete("perPage");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  // Compact page number window around the current page
  const pageNumbers: number[] = [];
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  for (let p = start; p <= Math.min(totalPages, start + 4); p++) pageNumbers.push(p);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <Label htmlFor="perPage" className="text-sm text-muted-foreground">
          Per page
        </Label>
        <select
          id="perPage"
          value={perPage}
          onChange={(e) => navigate(1, Number(e.target.value))}
          className="flex h-9 rounded-md border border-input bg-background px-2 py-1 text-sm"
        >
          {perPageOptions.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => navigate(page - 1)}>
          Prev
        </Button>
        {start > 1 ? <span className="px-1 text-sm text-muted-foreground">…</span> : null}
        {pageNumbers.map((p) => (
          <Button
            key={p}
            variant={p === page ? "default" : "outline"}
            size="sm"
            onClick={() => navigate(p)}
          >
            {p}
          </Button>
        ))}
        {start + 4 < totalPages ? <span className="px-1 text-sm text-muted-foreground">…</span> : null}
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => navigate(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
