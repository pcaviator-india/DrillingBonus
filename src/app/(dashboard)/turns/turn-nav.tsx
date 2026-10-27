"use client";

import Link from "next/link";

interface Props {
  sites: { id: string; name: string }[];
  siteId?: string;
  month: string;
  prevMonth: string;
  nextMonth: string;
  monthLabel: string;
}

/** Site + month navigation for the /turns page. Client because it wires onChange. */
export function TurnNav({ sites, siteId, month, prevMonth, nextMonth, monthLabel }: Props) {
  const fmt = (m: string) =>
    `/turns?month=${m}${siteId ? `&site=${siteId}` : ""}`;

  return (
    <div className="flex items-center gap-2">
      <select
        className="rounded border px-2 py-1 text-sm"
        defaultValue={siteId ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          window.location.href = `/turns?month=${month}${v ? `&site=${v}` : ""}`;
        }}
      >
        <option value="">All sites</option>
        {sites.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <Link href={fmt(prevMonth)} className="rounded border px-2 py-1 text-sm">
        ‹ Prev
      </Link>
      <span className="min-w-28 text-center text-sm font-medium capitalize">{monthLabel}</span>
      <Link href={fmt(nextMonth)} className="rounded border px-2 py-1 text-sm">
        Next ›
      </Link>
    </div>
  );
}