import Link from "next/link";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UploadForm } from "./upload-form";
import { formatDateTimeChile } from "@/lib/datetime";
import { DeleteUploadButton } from "./delete-button";
import { RetryUploadButton } from "./retry-button";
import { SiteSelector } from "./site-selector";

/**
 * Rig name(s) for an upload, derived from the parsed snapshot's sheet names.
 * Only Rig Intervals reports use one sheet per rig (sheet name = rig identifier,
 * e.g. "740-14"). Planilla Diaria sheets are named by date, so they carry no rig
 * name here and resolve to null.
 */
function rigNamesFromSnapshot(
  kind: string,
  dataSnapshot: unknown,
): string | null {
  if (kind !== "rig_intervals") return null;
  const snap = dataSnapshot as { sheets?: { sheetName?: string }[] } | null;
  const names = (snap?.sheets ?? [])
    .map((s) => (s.sheetName ?? "").trim())
    .filter(Boolean);
  const distinct = [...new Set(names)];
  return distinct.length ? distinct.join(", ") : null;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
    pending: { label: "Queued", variant: "outline" },
    processing: { label: "Processing…", variant: "secondary" },
    parsed: { label: "Parsed", variant: "default" },
    error: { label: "Error", variant: "destructive" },
  };
  const item = map[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={item.variant}>{item.label}</Badge>;
}

export default async function UploadsPage() {
  const [uploads, sites] = await Promise.all([
    db.excelUpload.findMany({ orderBy: { uploadedAt: "desc" }, include: { site: true } }),
    db.site.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Excel Uploads</h1>
        <p className="text-sm text-muted-foreground">
          Upload Rig drilling reports and the daily crew planilla. Files are parsed in the
          background — check the bubble at the bottom right while you keep working. Every upload
          keeps a full parsed snapshot for audit.
        </p>
      </div>

      {uploads.some((u) => u.positionAliasesPending > 0) && (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardHeader>
            <CardTitle className="text-lg">New positions to classify</CardTitle>
            <CardDescription>
              Some uploaded planillas introduced cargo names that are not yet classified as a Main
              Position or alias. Classify them so workers are grouped correctly in calculations.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {uploads
              .filter((u) => u.positionAliasesPending > 0)
              .map((u) => (
                <div key={u.id} className="flex items-center justify-between gap-4 text-sm">
                  <span>
                    <strong>{u.fileName}</strong> — {u.positionAliasesPending} new position(s)
                  </span>
                  <Button asChild size="sm">
                    <Link href={`/positions?review=${u.id}`}>Classify now</Link>
                  </Button>
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">New upload</CardTitle>
        </CardHeader>
        <CardContent>
          <UploadForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Uploaded files</CardTitle>
          <CardDescription>{uploads.length} file(s)</CardDescription>
        </CardHeader>
        <CardContent>
          <Table className="min-w-[1320px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[28rem] min-w-[28rem]">File</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Rig</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sheets</TableHead>
                <TableHead>Rows</TableHead>
                <TableHead>Warnings</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {uploads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground">
                    No uploads yet.
                  </TableCell>
                </TableRow>
              ) : (
                uploads.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell
                      className="max-w-[28rem] truncate font-medium"
                      title={u.fileName}
                    >
                      {u.fileName}
                    </TableCell>
                    <TableCell>
                      <SiteSelector uploadId={u.id} siteId={u.siteId} sites={sites} />
                    </TableCell>
                    <TableCell className="max-w-48 truncate" title={rigNamesFromSnapshot(u.kind, u.dataSnapshot) ?? undefined}>
                      {rigNamesFromSnapshot(u.kind, u.dataSnapshot) ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.kind === "planilla_diaria" ? "default" : "secondary"}>
                        {u.kind === "planilla_diaria"
                          ? "Planilla Diaria"
                          : u.kind === "rig_intervals"
                            ? "Rig Intervals"
                            : "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={u.status} />
                    </TableCell>
                    <TableCell>{u.sheetCount}</TableCell>
                    <TableCell>{u.rowCount}</TableCell>
                    <TableCell>
                      {u.errorSummary ? u.errorSummary.split(" | ").length : 0}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDateTimeChile(u.uploadedAt)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/uploads/${u.id}`}>View</Link>
                        </Button>
                        {(u.status === "parsed" || u.status === "error") && (
                          <RetryUploadButton uploadId={u.id} />
                        )}
                        <DeleteUploadButton uploadId={u.id} fileName={u.fileName} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
