import { auth } from "@/lib/auth";
import { csvContentDisposition } from "@/lib/csv";
import { loadAttendanceReconciliation } from "@/lib/reconciliation";
import { buildAttendanceReconciliationCsv } from "@/lib/export/reconciliation-export";

function parseDate(value: string | null, fallback: string): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

/**
 * Full detail export for the attendance reconciliation page
 * (Workera vs Planilla Diaria, one row per employee/day).
 * Carries the same from/to/site filters as the page.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const q = url.searchParams;
  const today = new Date();
  const lastMonthFirst = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthLast = new Date(today.getFullYear(), today.getMonth(), 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  const fallbackFrom = `${lastMonthFirst.getFullYear()}-${pad(lastMonthFirst.getMonth() + 1)}-01`;
  const fallbackTo = `${lastMonthLast.getFullYear()}-${pad(lastMonthLast.getMonth() + 1)}-${pad(lastMonthLast.getDate())}`;
  const from = parseDate(q.get("from"), fallbackFrom);
  const to = parseDate(q.get("to"), fallbackTo);
  const siteId = q.get("site") || null;

  const view = await loadAttendanceReconciliation({ from, to, siteId });
  const csv = buildAttendanceReconciliationCsv(view.rows);

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": csvContentDisposition(`reconciliation-attendance_${from}_${to}`),
    },
  });
}
