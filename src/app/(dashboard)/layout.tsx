import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { JobBubble } from "@/components/jobs/job-bubble";
import { NavLink } from "./nav-link";
import { UserMenu } from "./user-menu";

const navItems = [
  { href: "/sites", label: "Sites" },
  { href: "/employees", label: "Employees" },
  { href: "/employee-project-assignments", label: "Project assignments" },
  { href: "/employee-project-audit", label: "Project audit" },
  { href: "/attendance", label: "Attendance" },
  { href: "/site-attribution", label: "Site location" },
  { href: "/uploads", label: "Uploads" },
  { href: "/positions", label: "Positions" },
  { href: "/groups", label: "Bonus Groups" },
  { href: "/turns", label: "Turns (A/B)" },
  { href: "/reports", label: "Reports" },
  { href: "/reconciliation", label: "Matching" },
  { href: "/rules", label: "Rules" },
  { href: "/calculations", label: "Calculations" },
  { href: "/comparisons", label: "Comparisons" },
  { href: "/sync", label: "Sync" },
  { href: "/settings", label: "Settings" },
  { href: "/adjustments", label: "Adjustments" },
];

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="whitespace-nowrap font-semibold">Recon Drilling Bonus</span>
            <nav className="flex items-center gap-3 text-sm">
              {navItems.map((item) => (
                <NavLink key={item.href} href={item.href} label={item.label} />
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <UserMenu email={session.user.email ?? ""} role={session.user.role} />
          </div>
        </div>
      </header>
      <main className="container py-8">{children}</main>
      <JobBubble />
    </div>
  );
}
