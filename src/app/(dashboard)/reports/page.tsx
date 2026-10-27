import { getEmployeeSummary } from "./actions";
import { ReportsClient } from "./reports-client";

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const today = new Date();
  // Work reports are usually calculated for the previous month, so default to it.
  const lastMonthFirst = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthLast = new Date(today.getFullYear(), today.getMonth(), 0);
  const from = sp.from ?? toYMD(lastMonthFirst);
  const to = sp.to ?? toYMD(lastMonthLast);

      const summary = await getEmployeeSummary(from, to);

  return (
    <ReportsClient
      from={from}
      to={to}
      summary={summary}
    />
  );
}
