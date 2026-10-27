import { auth } from "@/lib/auth";
import { csvContentDisposition } from "@/lib/csv";
import { RECONCILIATION_CONFIG, loadDrillingReconciliation } from "@/lib/reconciliation";
import {
  buildDrillingReconciliationCsv,
  buildDrillingRigRollupCsv,
} from "@/lib/export/reconciliation-export";

function parseDate(value: string | null, fallback: string): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

/**
 * Exports for the drilling reconciliation page
 * (daily drilling vs Planilla Diaria METROS).
 * `?table=detail` (default, one row per rig/day/shift) or
 * `?table=rigs` (per-rig period roll-up). Carries the same
 * from/to/site/tolerance filters as the page.
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
  const parsedTolerance = Number(q.get("tolerance"));
  const tolerance =
    Number.isFinite(parsedTolerance) && parsedTolerance >= 0
      ? parsedTolerance
      : RECONCILIATION_CONFIG.metersTolerance;

  const view = await loadDrillingReconciliation({ from, to, siteId, tolerance });

  const table = q.get("table") === "rigs" ? "rigs" : "detail";
  const csv =
    table === "rigs"
      ? buildDrillingRigRollupCsv(view.summary.byRig)
      : buildDrillingReconciliationCsv(view.rows);

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": csvContentDisposition(`reconciliation-drilling_${table}_${from}_${to}`),
    },
  });
}
