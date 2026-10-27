import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { CreateComparisonForm, BulkComparisonForm } from "./comparison-form";
import { ComparisonHistory } from "./comparison-history";

type SearchParams = Promise<{
  q?: string;
  project?: string;
  reviewStatus?: string;
  tab?: string;
  month?: string;
}>;

export default async function ComparisonsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const project = params.project?.trim() ?? "";
  const reviewStatus = params.reviewStatus?.trim() ?? "";
  const month = params.month?.trim() ?? "";
  
  const [calculations, projects, allBatches] = await Promise.all([
    db.bonusCalculation.findMany({ orderBy: { createdAt: "desc" }, include: { site: true, ruleSet: true }, take: 100 }),
    db.site.findMany({ where: { calculations: { some: {} } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.calculationComparison.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        calculation: { include: { site: true } },
        employee: true,
      },
      take: 1000,
    }),
  ]);
  
  // Group rows into batches by calculation pair
  const batchesMap = new Map<string, typeof allBatches>();
  for (const row of allBatches) {
    const key = `${row.calculationId}:${row.planillaCalculationId}`;
    const batch = batchesMap.get(key) ?? [];
    batch.push(row);
    batchesMap.set(key, batch);
  }
  
  // Filter batches by query, project, status, and month
  const filteredBatches = [...batchesMap.entries()].filter(([_, rows]) => {
    const matchesProject = !project || rows.some((row) => row.calculation.site.id === project);
    const matchesStatus = !reviewStatus || rows.some((row) => row.reviewStatus === reviewStatus);
    const matchesQuery = !q || rows.some((row) => {
      const haystack = `${row.employee.fullName} ${row.employee.rut ?? ""} ${row.calculation.site.name}`.toLowerCase();
      return haystack.includes(q.toLowerCase());
    });
    const matchesMonth = !month || rows.some((row) => {
      // Filter by calculation period (periodStart), not row creation date
      const rowMonth = `${row.periodStart.getFullYear()}-${String(row.periodStart.getMonth() + 1).padStart(2, "0")}`;
      return rowMonth === month;
    });
    return matchesProject && matchesStatus && matchesQuery && matchesMonth;
  }).map(([key, rows]) => ({ key, rows }));
  
  // Prepare options for comparison forms
  const options = calculations.map(c => ({ 
    id: c.id, 
    label: `${c.site.name} · ${c.periodStart.toISOString().slice(0,10)} → ${c.periodEnd.toISOString().slice(0,10)} · ${c.ruleSet.name}` 
  }));
  const workera = calculations.filter(c => c.source === "workera").map(c => options[calculations.indexOf(c)]);
  const planilla = calculations.filter(c => c.source === "planilla").map(c => options[calculations.indexOf(c)]);
  const tab = params.tab === "bulk" ? "bulk" : "single";
  
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Comparisons</h1>
          <p className="text-sm text-muted-foreground">Compare Workera official calculations with Planilla calculations.</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/api/comparisons/export">Export all (global)</Link>
        </Button>
      </div>
      
      <div className="flex gap-2 border-b">
        <Button asChild variant={tab === "single" ? "default" : "ghost"}>
          <Link href="/comparisons?tab=single">Single comparison</Link>
        </Button>
        <Button asChild variant={tab === "bulk" ? "default" : "ghost"}>
          <Link href="/comparisons?tab=bulk">Bulk comparison</Link>
        </Button>
      </div>
      
      {tab === "bulk" ? (
        <BulkComparisonForm workera={workera} planilla={planilla} />
      ) : (
        <CreateComparisonForm workera={workera} planilla={planilla} />
      )}
      
      <ComparisonHistory 
        batches={filteredBatches} 
        projects={projects}
        initialFilters={{ q, project, reviewStatus, month, tab }}
      />
    </div>
  );
}