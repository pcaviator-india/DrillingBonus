import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlanillaDetail } from "./planilla-detail";
import { RigDetail } from "./rig-detail";
import { DeleteUploadButton } from "../delete-button";
import { RetryUploadButton } from "../retry-button";
import { formatDateTimeChile } from "@/lib/datetime";

export default async function UploadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const upload = await db.excelUpload.findUnique({ where: { id } });
  if (!upload) notFound();

  const kindLabel =
    upload.kind === "planilla_diaria"
      ? "Planilla Diaria"
      : upload.kind === "rig_intervals"
        ? "Rig Intervals"
        : "Detecting…";

  const isPending = upload.status === "pending" || upload.status === "processing";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/uploads" className="text-sm text-muted-foreground hover:text-foreground">
          ← All uploads
        </Link>
        <h1 className="mt-1 text-2xl font-bold">{upload.fileName}</h1>
        <p className="text-sm text-muted-foreground">
          {kindLabel}
          {upload.status === "parsed" &&
            ` · ${upload.sheetCount} sheet(s) · ${upload.rowCount} row(s)`}{" "}
          · uploaded {formatDateTimeChile(upload.uploadedAt)} (Chile)
        </p>
        {upload.errorSummary && (
          <p className="mt-1 text-sm text-amber-700">Warnings: {upload.errorSummary}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <DeleteUploadButton uploadId={upload.id} fileName={upload.fileName} redirectTo="/uploads" />
        {(upload.status === "parsed" || upload.status === "error") && (
          <RetryUploadButton uploadId={upload.id} />
        )}
      </div>

      {isPending ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Still processing…</CardTitle>
            <CardDescription>
              This file is being parsed in the background. Refresh this page in a moment to see the
              rows, or watch the bubble at the bottom right for the result.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : upload.status === "error" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Import failed</CardTitle>
            <CardDescription>{upload.errorSummary ?? "Check the upload status."}</CardDescription>
          </CardHeader>
        </Card>
      ) : upload.kind === "planilla_diaria" ? (
        <PlanillaDetail uploadId={upload.id} />
      ) : (
        <RigDetail uploadId={upload.id} />
      )}
    </div>
  );
}
