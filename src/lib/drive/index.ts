/**
 * Shared Google Drive filing infrastructure.
 *
 * This is deliberately PROJECT-AGNOSTIC: it knows how to authenticate as the
 * dedicated service account (a Content-manager member of the "Accounting"
 * Shared Drive), find-or-create a nested folder path below the Accounting root,
 * and upload a file there while skipping duplicates. Any feature module (TikTok
 * ads invoices, Amazon fee invoices, ...) files through this same client by
 * handing it a `DriveFileItem` (name + relative Drive path), so the modules stay
 * decoupled and there is exactly one place that talks to the Drive API.
 *
 * Inert unless the env is set (see isDriveEnabled).
 */
import { Readable } from "node:stream";
import { google, type drive_v3 } from "googleapis";

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

/** The minimum a feature module must provide to file one document. */
export interface DriveFileItem {
  /** Original uploaded filename (for reporting). */
  fileName: string;
  /** The name to write in Drive, e.g. "Tiktok $160.83 01 jun-26 BE.pdf". */
  proposedName: string;
  /** Target folder relative to (and including) the Accounting root, e.g.
   *  "Accounting/06. Jun 2026/Tiktok" or "Accounting/06. Jun 2026/Amazon". */
  drivePath: string;
}

export interface DriveFileResult {
  fileName: string;
  proposedName: string;
  drivePath: string;
  outcome: FileOutcome;
  webViewLink?: string;
  error?: string;
}

/**
 * File one document: ensure its `drivePath` exists below the Accounting root,
 * then upload it there unless a file of the same name is already present.
 */
export async function fileToDrive(
  drive: drive_v3.Drive,
  rootId: string,
  item: DriveFileItem,
  bytes: Buffer,
  mimeType = "application/pdf",
): Promise<DriveFileResult> {
  const base = {
    fileName: item.fileName,
    proposedName: item.proposedName,
    drivePath: item.drivePath,
  };
  try {
    // drivePath looks like "Accounting/06. Jun 2026/Tiktok" — walk the segments
    // below the Accounting root (drop the leading "Accounting").
    const segments = item.drivePath.split("/").slice(1);
    let parentId = rootId;
    for (const seg of segments) {
      parentId = await findOrCreateFolder(drive, parentId, seg);
    }

    const dup = await findFile(drive, parentId, item.proposedName);
    if (dup) {
      return { ...base, outcome: "skipped-duplicate", webViewLink: dup.webViewLink };
    }

    const created = await drive.files.create({
      requestBody: { name: item.proposedName, parents: [parentId] },
      media: { mimeType, body: Readable.from(bytes) },
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
