"use client";

import { useActionState } from "react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { uploadExcelAction, uploadFromLinkAction, type UploadState } from "./actions";

const initialState: UploadState = {};

export function UploadForm() {
  const [state, formAction, pending] = useActionState(uploadExcelAction, initialState);
  const [linkState, linkAction, linkPending] = useActionState(uploadFromLinkAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const linkFormRef = useRef<HTMLFormElement>(null);

  return (
    <div className="space-y-6">
      <form
        ref={formRef}
        action={async (fd) => {
          await formAction(fd);
          formRef.current?.reset();
        }}
        className="space-y-4"
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="file">Excel files (.xlsx)</Label>
            <Input id="file" name="files" type="file" accept=".xlsx" multiple required className="max-w-md" />
            <p className="text-xs text-muted-foreground">
              Supported: Planilla Diaria (sheet per day, RUT header) and Drilling Intervals report
              (sheet per rig, Date/Hole/Shift header). The type is detected automatically.
            </p>
          </div>
          <Button type="submit" disabled={pending} className="w-full sm:w-auto">
            {pending ? "Uploading…" : "Upload file"}
          </Button>
        </div>
        {state.error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {state.error}
          </p>
        )}
        {state.success && (
          <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
            {state.success}
          </p>
        )}
      </form>

      <form
        ref={linkFormRef}
        action={async (fd) => {
          await linkAction(fd);
          linkFormRef.current?.reset();
        }}
        className="space-y-4 border-t pt-4"
      >
        <div className="space-y-1.5">
          <Label htmlFor="links">Or import from a OneDrive link</Label>
          <Textarea
            id="links"
            name="links"
            rows={3}
            placeholder={"https://1drv.ms/x/s!...\nhttps://.../sharepoint... (one link per line)"}
            className="max-w-md"
          />
          <p className="text-xs text-muted-foreground">
            Paste public OneDrive / SharePoint share links (one per line — multiple files are
            supported). Each link must be shared with <strong>“Anyone with the link”</strong> and
            point directly to an .xlsx file. The file is downloaded server-side and parsed exactly
            like a manual upload.
          </p>
        </div>
        <Button type="submit" disabled={linkPending} className="w-full sm:w-auto">
          {linkPending ? "Importing…" : "Import from link"}
        </Button>
        {linkState.error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {linkState.error}
          </p>
        )}
        {linkState.success && (
          <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
            {linkState.success}
          </p>
        )}
      </form>
    </div>
  );
}
