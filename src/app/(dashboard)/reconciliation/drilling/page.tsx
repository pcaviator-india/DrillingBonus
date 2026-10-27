import { format } from "date-fns";
import Link from "next/link";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  METERS_TOLERANCE_OPTIONS,
  RECONCILIATION_CONFIG,
  drillingSourceLabel,
  loadDrillingReconciliation,
} from "@/lib/reconciliation";
import { ReconciliationFilters } from "../reconciliation-filters";
import { DrillingMatchTable } from "./drilling-match-table";
import { RigMappingControl } from "./rig-mapping-control";

type SearchParams = { from?: string; to?: string; site?: string; tolerance?: string };

export default async function DrillingReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const today = new Date();
  // Same default period as the reports page: the previous month.
  const lastMonthFirst = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthLast = new Date(today.getFullYear(), today.getMonth(), 0);
  const from = params.from ?? format(lastMonthFirst, "yyyy-MM-dd");
  const to = params.to ?? format(lastMonthLast, "yyyy-MM-dd");
  const invalidRange = from > to;
  const parsedTolerance = Number(params.tolerance);
  const tolerance =
    Number.isFinite(parsedTolerance) && parsedTolerance >= 0
      ? parsedTolerance
      : RECONCILIATION_CONFIG.metersTolerance;

  const session = await auth();
  const canMap = session?.user.role === "admin" || session?.user.role === "supervisor";

  // Export links carry the same filters as the page. The drilling page has two
  // exports: the full rig/day/shift detail and the per-rig period roll-up.
  const baseExportQuery = new URLSearchParams();
  baseExportQuery.set("from", from);
  baseExportQuery.set("to", to);
  if (params.site) baseExportQuery.set("site", params.site);
  baseExportQuery.set("tolerance", String(tolerance));
  const detailExportQuery = new URLSearchParams(baseExportQuery);
  detailExportQuery.set("table", "detail");
  const rigsExportQuery = new URLSearchParams(baseExportQuery);
  rigsExportQuery.set("table", "rigs");

  const [sites, view] = await Promise.all([
    db.site.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    loadDrillingReconciliation({ from, to, siteId: params.site || null, tolerance }),
  ]);

  const s = view.summary;
  const sources = Object.entries(s.bySource)
    .map(([source, count]) => `${drillingSourceLabel(source)}: ${count.toLocaleString()}`)
    .join(" · ");

  const summaryCards = [
    {
      label: "Rig / day / shift",
      value: s.keys,
      tone: "",
      hint: "Distinct rig + date + shift keys compared",
    },
    {
      label: "Matched",
      value: s.matched,
      tone: "text-green-600",
      hint: "Both sides present and equal within the tolerance",
    },
    {
      label: "Value diff",
      value: s.valueDiff,
      tone: "text-red-600",
      hint: "Both sides present but the meters differ",
    },
    {
      label: "Values disagree",
      value: s.valuesDisagree,
      tone: "text-amber-600",
      hint: "Crew rows of the same rig/day/shift wrote different METROS",
    },
    {
      label: "Planilla only",
      value: s.planillaOnly,
      tone: "text-amber-600",
      hint: "Planilla meters with no daily drilling row",
    },
    {
      label: "Drilling only",
      value: s.sourceOnly,
      tone: "text-blue-600",
      hint: "Daily drilling row with no planilla row",
    },
    {
      label: "No planilla meters",
      value: s.noPlanillaMeters,
      tone: "",
      hint: "Planilla rows blank in METROS while drilling data exists",
    },
    {
      label: "Unmapped machines",
      value: s.unmappedMachines.length,
      tone: "text-amber-600",
      hint: "MAQUINA values without a rig alias — cannot be compared",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Drilling matching</h1>
          <p className="text-sm text-muted-foreground">
            Daily drilling per rig, date and shift against the Planilla Diaria METROS for the same rig,
            date and shift. The drilling side is provider-agnostic: today it is the uploaded intervals
            report (a CorePlan export), later it will be the CorePlan API — the comparison and this page
            stay the same, only the source label changes. The METROS value repeats on every crew row of
            one rig/day/shift, so the planilla value is the maximum of those rows and rows that disagree
            with each other are flagged.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href={`/api/reconciliation/drilling/export?${detailExportQuery.toString()}`}
            prefetch={false}
          >
            <Button variant="outline">Export detail CSV</Button>
          </Link>
          <Link
            href={`/api/reconciliation/drilling/export?${rigsExportQuery.toString()}`}
            prefetch={false}
          >
            <Button variant="outline">Export rigs CSV</Button>
          </Link>
        </div>
      </div>

      {invalidRange ? (
        <Card className="border-destructive">
          <CardContent className="py-4 text-sm text-destructive">
            &ldquo;From&rdquo; is after &ldquo;To&rdquo; — pick a valid period.
          </CardContent>
        </Card>
      ) : null}

      {view.truncated ? (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardContent className="py-4 text-sm">
            Large period: only the first {RECONCILIATION_CONFIG.maxRows.toLocaleString()} planilla
            rows were loaded. Narrow the range or pick a site for the full picture.
          </CardContent>
        </Card>
      ) : null}

      <ReconciliationFilters
        sites={sites}
        defaultFrom={from}
        defaultTo={to}
        showTolerance
        defaultTolerance={tolerance}
        toleranceOptions={METERS_TOLERANCE_OPTIONS}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {summaryCards.map((card) => (
          <Card key={card.label} className="py-2" title={card.hint}>
            <CardContent className="flex flex-col gap-1 px-3">
              <span className="text-xs font-medium text-muted-foreground">{card.label}</span>
              <span className={`text-lg font-bold ${card.tone}`}>{card.value.toLocaleString()}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="py-2">
          <CardContent className="flex items-baseline justify-between gap-2 px-3">
            <span className="text-xs font-medium text-muted-foreground">Planilla meters</span>
            <span className="text-lg font-bold">{s.planillaMeters.toFixed(1)}</span>
          </CardContent>
        </Card>
        <Card className="py-2">
          <CardContent className="flex items-baseline justify-between gap-2 px-3">
            <span className="text-xs font-medium text-muted-foreground">Drilling meters</span>
            <span className="text-lg font-bold">{s.sourceMeters.toFixed(1)}</span>
          </CardContent>
        </Card>
        <Card className="py-2">
          <CardContent className="flex items-baseline justify-between gap-2 px-3">
            <span className="text-xs font-medium text-muted-foreground">
              Difference (planilla − drilling)
            </span>
            <span className={`text-lg font-bold ${s.deltaMeters === 0 ? "" : "text-amber-600"}`}>
              {s.deltaMeters.toFixed(1)}
            </span>
          </CardContent>
        </Card>
      </div>

      {s.unmappedMachines.length > 0 ? (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardHeader>
            <CardTitle className="text-lg">Machines not mapped to a rig</CardTitle>
            <CardDescription>
              These MAQUINA values in the planilla have no rig alias, so their meters cannot be
              compared at all.
              {canMap
                ? " Map each one to a rig to include it in future comparisons."
                : " Mapping requires an admin or supervisor role."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {s.unmappedMachines.map((m) => (
              <div
                key={m.machine}
                className="flex flex-wrap items-center justify-between gap-3 rounded border bg-background px-3 py-2 text-sm"
              >
                <span>
                  <strong>{m.machine}</strong> — {m.keys.toLocaleString()} rig/day/shift ·{" "}
                  {m.planillaRows.toLocaleString()} planilla row(s) · {m.meters.toFixed(1)} m
                </span>
                {canMap ? <RigMappingControl machine={m.machine} rigs={view.rigOptions} /> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {s.noMachine.keys > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Planilla rows with no machine listed</CardTitle>
            <CardDescription>
              {s.noMachine.planillaRows.toLocaleString()} planilla row(s) across{" "}
              {s.noMachine.keys.toLocaleString()} date/shift(s) carry METROS (
              {s.noMachine.meters.toFixed(1)} m max-per-key) but leave MAQUINA blank, so they
              cannot be attributed to any rig and are excluded from the rig comparison above.
              {s.noMachine.samples.length
                ? ` Examples: ${s.noMachine.samples.join(", ")}.`
                : ""}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Drilling detail</CardTitle>
          <CardDescription>
            {s.keys.toLocaleString()} key(s) compared for {from} → {to}
            {params.site ? " (site filter applied)" : ""}. Drilling rows by source: {sources || "none"}.
            Tolerance: {tolerance === 0 ? "exact match" : `± ${tolerance} m`}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DrillingMatchTable rows={view.rows} />
        </CardContent>
      </Card>

      {s.byRig.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Per-rig roll-up</CardTitle>
            <CardDescription>
              Period totals per rig — the fastest way to spot a rig that systematically differs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left">
                    <th className="px-3 py-2">Rig</th>
                    <th className="px-3 py-2">Site</th>
                    <th className="px-3 py-2 text-right">Keys</th>
                    <th className="px-3 py-2 text-right">Matched</th>
                    <th className="px-3 py-2 text-right">Value diff</th>
                    <th className="px-3 py-2 text-right">Planilla only</th>
                    <th className="px-3 py-2 text-right">Drilling only</th>
                    <th className="px-3 py-2 text-right">Planilla m</th>
                    <th className="px-3 py-2 text-right">Drilling m</th>
                    <th className="px-3 py-2 text-right">Δ m</th>
                  </tr>
                </thead>
                <tbody>
                  {s.byRig.map((r) => (
                    <tr key={r.rigId} className="border-b">
                      <td className="px-3 py-2 font-medium">{r.rigName}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.siteName ?? "—"}</td>
                      <td className="px-3 py-2 text-right">{r.keys}</td>
                      <td className="px-3 py-2 text-right">{r.matched}</td>
                      <td className="px-3 py-2 text-right">{r.valueDiff}</td>
                      <td className="px-3 py-2 text-right">{r.planillaOnly}</td>
                      <td className="px-3 py-2 text-right">{r.sourceOnly}</td>
                      <td className="px-3 py-2 text-right">{r.planillaMeters.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right">{r.sourceMeters.toFixed(1)}</td>
                      <td
                        className={`px-3 py-2 text-right font-medium ${r.delta === 0 ? "" : "text-amber-600"}`}
                      >
                        {r.delta.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

