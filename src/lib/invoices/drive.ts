/**
 * Google Drive filing for reconciled invoices (Project 2, M4).
 *
 * Uses a dedicated service account that is a Content-manager member of the
 * "Accounting" Shared Drive, so it uploads directly (no impersonation/quota
 * issues). Finds-or-creates `Accounting / NN. Mon YYYY / Tiktok` and uploads
 * each renamed PDF there, skipping duplicates. Inert unless the env is set.
 */
import { Readable } from "node:stream";
import { google, type drive_v3 } from "googleapis";
import type { Invoice } from "./types";

export function isDriveEnabled(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_ACCOUNTING_DRIVE_ID &&
      (process.env.GOOGLE_PRIVATE_KEY_BASE64 || process.env.GOOGLE_PRIVATE_KEY),
  );
}

function getPrivateKey(): string {
  const b64 = process.env.GOOGLE_PRIVATE_KEY_BASE64;
  if (b64) return Buffer.from(b64, "base64").toString("utf8");
  return (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
}

function getDrive(): drive_v3.Drive {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: getPrivateKey(),
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return google.drive({ version: "v3", auth });
}

const FOLDER_MIME = "application/vnd.google-apps.folder";

/** Find a child folder by exact name under parentId, or create it. */
async function findOrCreateFolder(
  drive: drive_v3.Drive,
  parentId: string,
  name: string,
): Promise<string> {
  const escaped = name.replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `name = '${escaped}' and mimeType = '${FOLDER_MIME}' and '${parentId}' in parents and trashed = false`,
    fields: "files(id,name)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: "allDrives",
  });
  const existing = res.data.files?.[0];
  if (existing?.id) return existing.id;

  const created = await drive.files.create({
    requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
    fields: "id",
    supportsAllDrives: true,
  });
  return created.data.id!;
}

/** Is there already a file with this name in the folder? Returns its id/link. */
async function findFile(
  drive: drive_v3.Drive,
  parentId: string,
  name: string,
): Promise<{ id: string; webViewLink?: string } | null> {
  const escaped = name.replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `name = '${escaped}' and '${parentId}' in parents and trashed = false`,
    fields: "files(id,webViewLink)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: "allDrives",
  });
  const f = res.data.files?.[0];
  return f?.id ? { id: f.id, webViewLink: f.webViewLink ?? undefined } : null;
}

export type FileOutcome = "uploaded" | "skipped-duplicate" | "error";

export interface DriveFileResult {
  fileName: string;
  proposedName: string;
  drivePath: string;
  outcome: FileOutcome;
  webViewLink?: string;
  error?: string;
}

/**
 * File one invoice: ensure `Accounting/<month>/Tiktok` exists (the invoice's
 * drivePath is relative to the Accounting root), then upload — unless a file of
 * the same name is already there.
 */
export async function fileInvoiceToDrive(
  drive: drive_v3.Drive,
  rootId: string,
  invoice: Invoice,
  bytes: Buffer,
): Promise<DriveFileResult> {
  const base = {
    fileName: invoice.fileName,
    proposedName: invoice.proposedName,
    drivePath: invoice.drivePath,
  };
  try {
    // drivePath looks like "Accounting/06. Jun 2026/Tiktok" — walk the segments
    // below the Accounting root.
    const segments = invoice.drivePath.split("/").slice(1); // drop "Accounting"
    let parentId = rootId;
    for (const seg of segments) {
      parentId = await findOrCreateFolder(drive, parentId, seg);
    }

    const dup = await findFile(drive, parentId, invoice.proposedName);
    if (dup) {
      return { ...base, outcome: "skipped-duplicate", webViewLink: dup.webViewLink };
    }

    const created = await drive.files.create({
      requestBody: { name: invoice.proposedName, parents: [parentId] },
      media: { mimeType: "application/pdf", body: Readable.from(bytes) },
      fields: "id,webViewLink",
      supportsAllDrives: true,
    });
    return { ...base, outcome: "uploaded", webViewLink: created.data.webViewLink ?? undefined };
  } catch (e) {
    return { ...base, outcome: "error", error: e instanceof Error ? e.message : "Upload failed" };
  }
}

export interface DriveClient {
  drive: drive_v3.Drive;
  rootId: string;
}

export function getDriveClient(): DriveClient {
  return { drive: getDrive(), rootId: process.env.GOOGLE_ACCOUNTING_DRIVE_ID! };
}
