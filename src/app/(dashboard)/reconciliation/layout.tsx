import { NavLink } from "../nav-link";

/**
 * Shared shell for the two data-reconciliation pages. They compare normalized
 * data from two different sources, so they live under one "Matching" nav entry
 * with a sub-tab each.
 */
export default function ReconciliationLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 border-b pb-2 text-sm">
        <NavLink href="/reconciliation/attendance" label="Attendance" />
        <NavLink href="/reconciliation/drilling" label="Drilling" />
      </div>
      {children}
    </div>
  );
}
