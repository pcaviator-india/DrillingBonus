"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function EmployeeFilters({
  roles,
  sites,
  currentParams,
}: {
  roles: string[];
  sites: string[];
  currentParams: { name?: string; rut?: string; role?: string; site?: string; status?: string };
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Filters</CardTitle>
        <CardDescription>Filter employees by name, RUT, role, site, or status.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-2">
            <Label htmlFor="employee-name">Name</Label>
            <Input
              id="employee-name"
              placeholder="Search name"
              defaultValue={currentParams.name ?? ""}
              onChange={(event) => setParam("name", event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="employee-rut">RUT</Label>
            <Input
              id="employee-rut"
              placeholder="Search RUT"
              defaultValue={currentParams.rut ?? ""}
              onChange={(event) => setParam("rut", event.target.value)}
            />
          </div>
          <SelectField label="Role" name="employee-role" value={currentParams.role ?? ""} options={roles} onChange={(value) => setParam("role", value)} />
          <SelectField label="Site" name="employee-site" value={currentParams.site ?? ""} options={sites} onChange={(value) => setParam("site", value)} />
          <SelectField
            label="Status"
            name="employee-status"
            value={currentParams.status ?? ""}
            options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]}
            onChange={(value) => setParam("status", value)}
          />
        </div>
      </CardContent>
    </Card>
  );
}

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
  options: string[] | { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const normalized = options.map((option) => typeof option === "string" ? { value: option, label: option } : option);
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <select
        id={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="">All</option>
        {normalized.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
}
