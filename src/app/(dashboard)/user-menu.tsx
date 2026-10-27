"use client";

import { useEffect, useRef, useState } from "react";
import { LogOut, User } from "lucide-react";
import { logoutAction } from "@/app/(auth)/login/actions";

export function UserMenu({ email, role }: { email: string; role: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="User menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full border bg-muted text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <User className="h-5 w-5" aria-hidden />
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-56 rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          <div className="border-b px-2 py-1.5">
            <p className="truncate text-sm font-medium">{email}</p>
            <p className="text-xs text-muted-foreground">({role})</p>
          </div>
          {/* Placeholder for the future profile page. */}
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground"
          >
            <User className="h-4 w-4" aria-hidden />
            Profile
          </a>
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
