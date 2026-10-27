/**
 * OneDrive / SharePoint share-link download provider.
 *
 * Lets an admin paste a "anyone with the link" OneDrive/SharePoint URL on the
 * uploads page instead of downloading the file locally and re-uploading it.
 *
 * How it works (Microsoft documented "shares" encoding, no OAuth required for
 * anonymous shares):
 *   1. base64-encode the share URL,
 *   2. convert to unpadded base64url (drop trailing '=', '/' -> '_', '+' -> '-'),
 *   3. prefix with 'u!',
 *   4. GET https://api.onedrive.com/v1.0/shares/u!{encoded}/root/content
 * That endpoint 302-redirects to the actual file bytes; fetch follows the
 * redirect and returns the raw .xlsx buffer.
 *
 * Kept isolated here (like the other parsers) so the parsing/processing
 * pipeline stays provider-agnostic — swapping to a real Graph integration later
 * only touches this file.
 */

export type RemoteExcelFile = {
  /** Best-effort file name (from Content-Disposition, else a fallback). */
  fileName: string;
  /** Raw file bytes, ready to feed into the same buffer pipeline as an upload. */
  buffer: Uint8Array<ArrayBuffer>;
};

/** Hosts we accept, so a pasted URL can't be used to hit arbitrary servers. */
const ALLOWED_HOST_SUFFIXES = [
  "onedrive.live.com",
  "1drv.ms",
  "onedrive.com",
  "sharepoint.com",
];

function isAllowedOneDriveHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some(
    (suffix) => h === suffix || h.endsWith(`.${suffix}`),
  );
}

/** True when the string looks like an https OneDrive/SharePoint share link. */
export function isOneDriveShareUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && isAllowedOneDriveHost(url.hostname);
  } catch {
    return false;
  }
}

/** Splits a multi-line paste into individual candidate URLs. */
export function parseLinkList(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Microsoft's unpadded base64url encoding of a sharing URL, prefixed with 'u!'. */
export function encodeShareUrl(shareUrl: string): string {
  const base64 = Buffer.from(shareUrl, "utf8").toString("base64");
  const base64url = base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `u!${base64url}`;
}

/** Pulls a file name out of a Content-Disposition header value. */
function fileNameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  // RFC 5987 extended: filename*=UTF-8''name%20with%20spaces.xlsx
  const star = header.match(/filename\*\s*=\s*[^']*'[^']*'([^;]+)/i);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ""));
    } catch {
      return star[1].trim().replace(/^"|"$/g, "");
    }
  }
  // Plain: filename="report.xlsx"
  const plain = header.match(/filename\s*=\s*"?([^";]+)"?/i);
  return plain ? plain[1].trim() : null;
}

/**
 * Downloads the raw bytes of a file behind a public OneDrive/SharePoint share
 * link. Throws a descriptive error for non-OneDrive hosts, failed requests, or
 * content that is clearly not an .xlsx archive (checked via the ZIP signature).
 */
export async function downloadOneDriveFile(shareUrl: string): Promise<RemoteExcelFile> {
  const trimmed = shareUrl.trim();
  if (!isOneDriveShareUrl(trimmed)) {
    throw new Error(
      `Not a valid OneDrive/SharePoint link: "${trimmed}". Paste the full https share link.`,
    );
  }

  const directUrl = `https://api.onedrive.com/v1.0/shares/${encodeShareUrl(trimmed)}/root/content`;
  const res = await fetch(directUrl, { redirect: "follow", cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      `OneDrive download failed (${res.status} ${res.statusText}). Make sure the link sharing is set to "Anyone with the link" and the file is still available.`,
    );
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);

  // .xlsx is a ZIP archive: it starts with the "PK" signature. Reject obvious
  // HTML error/consent pages early with a clear message.
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    const looksLikeHtml = new TextDecoder()
      .decode(buffer.subarray(0, 256))
      .toLowerCase()
      .includes("<html");
    throw new Error(
      looksLikeHtml
        ? "The link returned a web page instead of a file — check that sharing is 'Anyone with the link' and points directly to the .xlsx file."
        : "The downloaded content is not a valid .xlsx file.",
    );
  }

  const fileName =
    fileNameFromContentDisposition(res.headers.get("content-disposition")) ??
    `onedrive-${encodeShareUrl(trimmed).slice(2, 10)}.xlsx`;

  return { fileName, buffer };
}
