import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import {
  buildCalculationSuperDetailWorkbook,
  type EngineInputSnapshot,
  type SuperDetailLine,
} from "@/lib/export/calculation-super-detail";
import { formatDateUtc } from "@/lib/datetime";
import { ZipArchive } from "archiver";

export async function POST(req: Request) {
  const session = await auth();
  if (session?.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const { calculationIds } = await req.json();
  if (!Array.isArray(calculationIds) || calculationIds.length === 0) {
    return new Response("No calculation IDs provided", { status: 400 });
  }

  const calculations = await db.bonusCalculation.findMany({
    where: { id: { in: calculationIds } },
    include: {
      site: true,
      ruleSet: true,
      lines: { include: { employee: true }, orderBy: { createdAt: "asc" } },
    },
  });

  if (calculations.length === 0) {
    return new Response("No calculations found", { status: 404 });
  }

  const archive = new ZipArchive({ zlib: { level: 9 } });
  const chunks: Buffer[] = [];

  archive.on("data", (chunk: Buffer) => chunks.push(chunk));

  const finished = new Promise<void>((resolve, reject) => {
    archive.on("end", () => resolve());
    archive.on("error", (err: Error) => reject(err));
  });

  for (const calc of calculations) {
    const snapshot = calc.inputSnapshot as { input?: EngineInputSnapshot } | null;
    const engineInput = snapshot?.input ?? null;

    const lines: SuperDetailLine[] = calc.lines.map((line) => ({
      employeeId: line.employeeId,
      employeeName: line.employee.fullName,
      employeeRut: line.employee.rut,
      roleUsed: line.roleUsed,
      daysWorked: line.daysWorked,
      totalMeters: line.totalMeters,
      totalHours: line.totalHours,
      calculatedBonus: line.calculatedBonus,
      breakdown: (line.breakdown ?? null) as SuperDetailLine["breakdown"],
    }));

    const buffer = await buildCalculationSuperDetailWorkbook(
      {
        id: calc.id,
        siteName: calc.site.name,
        ruleSetName: calc.ruleSet.name,
        ruleSetVersion: calc.ruleSet.version,
        periodStart: calc.periodStart,
        periodEnd: calc.periodEnd,
        status: calc.status,
        totalBonus: calc.totalBonus,
        createdAt: calc.createdAt,
      },
      lines,
      engineInput,
    );

    const siteSlug = calc.site.name.replace(/[^a-zA-Z0-9]+/g, "_");
    const period = `${formatDateUtc(calc.periodStart)}_to_${formatDateUtc(calc.periodEnd)}`;
    const sourceSlug = calc.source === "workera" ? "workera" : "planilla";
    const fileName = `calculation_super_detail_${sourceSlug}_${siteSlug}_${period}.xlsx`.replace(
      /[^a-zA-Z0-9_-]+/g,
      "_",
    );

    archive.append(Buffer.from(buffer as ArrayBuffer), { name: fileName });
  }

  archive.finalize();
  await finished;

  const zipBuffer = Buffer.concat(chunks);

  return new Response(zipBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="calculations_super_detail_${calculations.length}_${new Date().toISOString().slice(0, 10)}.zip"`,
    },
  });
}
