"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { createJob, runJobInBackground } from "@/lib/jobs/service";
import { processExcelUpload } from "@/lib/excel/process";
import { downloadOneDriveFile, parseLinkList } from "@/lib/excel/onedrive";
import { Prisma } from "@prisma/client";

export type UploadState = { error?: string; success?: string };

export async function assignUploadSiteAction(uploadId: string, siteId: string): Promise<void> {
  const session = await auth();
  if (session?.user.role !== "admin") return;
  await db.excelUpload.update({ where: { id: uploadId }, data: { siteId: siteId || null } });
  revalidatePath("/uploads");
}

export async function uploadExcelAction(
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const session = await auth();
  if (session?.user.role !== "admin") {
    return { error: "Only admins can upload files" };
  }

  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (files.length === 0) {
    return { error: "Please choose at least one Excel file" };
  }

  // Persist every file as its own pending record + background job, so a
  // multi-file selection queues them all automatically instead of one by one.
  // The bubble at the bottom reports each file's progress independently.
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());

    const job = await createJob({ type: "excel_upload", label: file.name, source: "excel" });
    const upload = await db.excelUpload.create({
      data: {
        fileName: file.name,
        kind: "unknown",
        status: "pending",
        source: "excel",
        rawFile: buffer,
        jobId: job.id,
      },
    });

    runJobInBackground({ jobId: job.id, run: () => processExcelUpload(upload.id) });
  }

  revalidatePath("/uploads");
  const list =
    files.length === 1
      ? `"${files[0].name}"`
      : `${files.length} files (${files.map((f) => f.name).join(", ")})`;
  return {
    success: `Parsing ${list} started in the background — you can keep working. Watch the bubble at the bottom for the results.`,
  };
}
/**
 * Import one or more Excel files directly from public OneDrive/SharePoint share
 * links. Each link is downloaded server-side and fed through the exact same
 * pending-record + background-parse pipeline as a manual file upload, so every
 * downstream step (detection, parsing, snapshot, matching) is unchanged.
 */
export async function uploadFromLinkAction(
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const session = await auth();
  if (session?.user.role !== "admin") {
    return { error: "Only admins can import files" };
  }

  const links = parseLinkList(String(formData.get("links") ?? ""));
  if (links.length === 0) {
    return { error: "Please paste at least one OneDrive link" };
  }

  const queued: string[] = [];
  const failures: string[] = [];

  for (const link of links) {
    try {
      const { fileName, buffer } = await downloadOneDriveFile(link);

      const job = await createJob({ type: "excel_upload", label: fileName, source: "onedrive" });
      const upload = await db.excelUpload.create({
        data: {
          fileName,
          kind: "unknown",
          status: "pending",
          // Domain data source stays "excel" (the bytes are parsed as Excel);
          // the Job above records the "onedrive" import channel for provenance.
          source: "excel",
          rawFile: buffer,
          jobId: job.id,
        },
      });

      runJobInBackground({ jobId: job.id, run: () => processExcelUpload(upload.id) });
      queued.push(fileName);
    } catch (e) {
      failures.push(e instanceof Error ? e.message : "Could not download link");
    }
  }

  revalidatePath("/uploads");

  if (queued.length === 0) {
    return {
      error:
        failures.length === 1
          ? failures[0]
          : `No files imported. ${failures.join(" | ")}`,
    };
  }

  const list =
    queued.length === 1 ? `"${queued[0]}"` : `${queued.length} files (${queued.join(", ")})`;
  const partial = failures.length ? ` ${failures.length} link(s) failed: ${failures.join(" | ")}` : "";
  return {
    success: `Downloading and parsing ${list} started in the background — watch the bubble for the results.${partial}`,
  };
}

export async function retryUploadAction(uploadId: string): Promise<UploadState> {
  const session = await auth();
  if (session?.user.role !== "admin") return { error: "Only admins can re-parse files" };

  try {
    const upload = await db.excelUpload.findUnique({ where: { id: uploadId } });
    if (!upload || !upload.rawFile) return { error: "Upload file content is missing" };

    // Re-parse an existing upload (retry a failure, or refresh the parsed rows
    // after a parser fix) without deleting and re-uploading the file.
    // The manually assigned siteId is preserved; processExcelUpload only
    // auto-assigns a site when none is set.
    await db.excelUpload.update({
      where: { id: uploadId },
      data: {
        status: "pending",
        kind: "unknown",
        rowCount: 0,
        sheetCount: 0,
        errorSummary: null,
        dataSnapshot: Prisma.DbNull,
      },
    });

    const job = await createJob({ type: "excel_upload", label: upload.fileName, source: "excel" });
    await db.excelUpload.update({ where: { id: uploadId }, data: { jobId: job.id } });

    runJobInBackground({ jobId: job.id, run: () => processExcelUpload(uploadId) });

    revalidatePath("/uploads");
    return { success: `Re-parse of "${upload.fileName}" started` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not start re-parse" };
  }
}

export async function deleteUploadAction(uploadId: string): Promise<void> {
  const session = await auth();
  if (session?.user.role !== "admin") return;

  const upload = await db.excelUpload.findUnique({ where: { id: uploadId } });
  if (upload?.jobId) {
    await db.job.delete({ where: { id: upload.jobId } }).catch(() => {});
  }
  await db.excelUpload.delete({ where: { id: uploadId } });
  revalidatePath("/uploads");
}