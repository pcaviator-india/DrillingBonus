"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const [clicked, setClicked] = useState(false);
  // Highlight the current page. `startsWith` keeps sub-routes highlighted too
  // (e.g. /calculations/123 highlights the "Calculations" link).
  const isActive = pathname === href || pathname.startsWith(`${href}/`);
  const pending = clicked && pathname !== href;

  // Once navigation completes (pathname matches the clicked link), stop showing
  // the pending indicator.
  useEffect(() => {
    if (pathname === href) setClicked(false);
  }, [pathname, href]);

  return (
    <Link
      href={href}
      aria-current={pending ? "true" : undefined}
      onClick={() => setClicked(true)}
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 transition-colors ${
        isActive
          ? "bg-primary/10 font-bold text-foreground"
          : pending
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      {pending && (
        <span
          className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      )}
    </Link>
  );
}
