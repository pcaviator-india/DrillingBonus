const fs = require("fs");

const imports = `import { format, startOfMonth, endOfMonth } from "date-fns";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AttendanceFilters } from "./attendance-filters";

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  present: "secondary",
  absent: "destructive",
  late: "default",
  leave: "outline",
};

type SearchParams = {
  from?: string;
  to?: string;
  employee?: string;
  role?: string;
  site?: string;
  department?: string;
  shift?: string;
  status?: string;
};

/** Convert decimal hours like 11.91 -> "11h 55m" */
function fmtHours(maybeHours: number | null): string {
  if (maybeHours === null || Number.isNaN(maybeHours)) return "—";
  const totalMin = Math.round(maybeHours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return \`\${m}m\`;
  return \`\${h}h \${String(m).padStart(2, "0")}m\`;
}
`;

fs.writeFileSync("_part1.ts", imports, "utf8");
console.log("_part1 lines:", imports.split("\n").length);
