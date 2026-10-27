"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FiltersProps = {
  employees: { id: string; fullName: string }[];
  roles: string[];
  sites: string[];
  departments: string[];
  shifts: string[];
  statuses: string[];
  defaultFrom: string;
  defaultTo: string;
  currentParams: Record<string, string | undefined>;
};

function SelectField({
  label,
  name,
  value,
  options,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <select
        id={name}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export function AttendanceFilters({
  employees,
  roles,
  sites,
  departments,
  shifts,
  statuses,
  defaultFrom,
  defaultTo,
  currentParams,
}: FiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page"); // filters reset pagination to page 1
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const employeeOpts = [{ value: "", label: "All" }, ...employees.map((e) => ({ value: e.id, label: e.fullName }))];
  const emptyOpts = [{ value: "", label: "All" }];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Filters</CardTitle>
        <CardDescription>Refine by date, employee, role, site, department, shift or status — changes apply instantly.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="from">From</Label>
            <Input id="from" type="date" defaultValue={defaultFrom} onChange={(e) => setParam("from", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="to">To</Label>
            <Input id="to" type="date" defaultValue={defaultTo} onChange={(e) => setParam("to", e.target.value)} />
          </div>
          <SelectField label="Employee" name="employee" value={currentParams.employee ?? ""} options={employeeOpts} onChange={(v) => setParam("employee", v)} />
          <SelectField label="Role (Cargo)" name="role" value={currentParams.role ?? ""} options={[...emptyOpts, ...roles.map((r) => ({ value: r, label: r }))]} onChange={(v) => setParam("role", v)} />
          <SelectField label="Site" name="site" value={currentParams.site ?? ""} options={[...emptyOpts, ...sites.map((s) => ({ value: s, label: s }))]} onChange={(v) => setParam("site", v)} />
          <SelectField label="Department" name="department" value={currentParams.department ?? ""} options={[...emptyOpts, ...departments.map((d) => ({ value: d, label: d }))]} onChange={(v) => setParam("department", v)} />
          <SelectField label="Shift" name="shift" value={currentParams.shift ?? ""} options={[...emptyOpts, ...shifts.map((s) => ({ value: s, label: s }))]} onChange={(v) => setParam("shift", v)} />
          <SelectField label="Status" name="status" value={currentParams.status ?? ""} options={[...emptyOpts, ...statuses.map((s) => ({ value: s, label: s }))]} onChange={(v) => setParam("status", v)} />
          <div className="space-y-2">
            <Label htmlFor="needsReview">Needs review</Label>
            <select
              id="needsReview"
              name="needsReview"
              value={currentParams.needsReview ?? ""}
              onChange={(e) => setParam("needsReview", e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">All</option>
              <option value="true">Only flagged records</option>
            </select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

