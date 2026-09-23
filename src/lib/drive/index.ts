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
 * A folder resolver turns a Drive path ("Accounting/08. Aug 2026/Amazon/FR")
 * into the target folder id, find-or-creating each segment below the root. It
 * MEMOIZES every segment across the whole batch, so filing 70 invoices into
 * `.../Amazon/<CC>` resolves the shared "08. Aug 2026" and "Amazon" folders
 * exactly once instead of once per file. Without this, a large batch made
 * ~3 folder-list calls per file (210 for 70) and blew past Vercel's 60s
 * function limit, which is why only the first handful ever landed in Drive.
 *
 * The cache stores the in-flight PROMISE per segment, so concurrent callers
 * asking for the same folder share one create — no duplicate folders, no race.
 */
export function createFolderResolver(
  drive: drive_v3.Drive,
  rootId: string,
): (drivePath: string) => Promise<string> {
  const cache = new Map<string, Promise<string>>();
  return (drivePath: string) => {
    // Walk the segments below the Accounting root (drop the leading "Accounting").
    const segments = drivePath.split("/").slice(1);
    let key = "";
    let parent: Promise<string> = Promise.resolve(rootId);
    for (const seg of segments) {
      key = key ? `${key}/${seg}` : seg;
      const cached = cache.get(key);
      if (cached) {
        parent = cached;
        continue;
      }
      const prev = parent;
      const next = prev.then((pid) => findOrCreateFolder(drive, pid, seg));
      cache.set(key, next);
      parent = next;
    }
    return parent;
  };
}

/** Upload one item into an already-resolved folder, skipping a same-name dup. */
async function uploadInto(
  drive: drive_v3.Drive,
  parentId: string,
  item: DriveFileItem,
  bytes: Buffer,
  mimeType: string,
): Promise<DriveFileResult> {
  const base = {
    fileName: item.fileName,
    proposedName: item.proposedName,
    drivePath: item.drivePath,
  };
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
}

/**
 * File one document: ensure its `drivePath` exists below the Accounting root,
 * then upload it there unless a file of the same name is already present. This
 * is the single-item path (used by the small TikTok batches); a fresh resolver
 * per call means its behavior is unchanged.
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
    const parentId = await createFolderResolver(drive, rootId)(item.drivePath);
    return await uploadInto(drive, parentId, item, bytes, mimeType);
  } catch (e) {
    return { ...base, outcome: "error", error: e instanceof Error ? e.message : "Upload failed" };
  }
}

/** One document to file: its metadata plus the bytes to upload. */
export interface DriveBatchItem {
  item: DriveFileItem;
  bytes: Buffer;
  mimeType?: string;
}

/**
 * File many documents in one pass: a SHARED memoized folder resolver (so folders
 * resolve once for the whole batch) plus bounded concurrency (so the per-file
 * dup-check + upload run several at a time instead of strictly serially). This
 * is what keeps a large Amazon batch (dozens of invoices) comfortably inside the
 * serverless time limit. Results are returned in input order.
 */
export async function fileToDriveBatch(
  drive: drive_v3.Drive,
  rootId: string,
  items: DriveBatchItem[],
  concurrency = 6,
): Promise<DriveFileResult[]> {
  const resolve = createFolderResolver(drive, rootId);
  const results = new Array<DriveFileResult>(items.length);
  let next = 0;

  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      const { item, bytes, mimeType = "application/pdf" } = items[i];
      const base = {
        fileName: item.fileName,
        proposedName: item.proposedName,
        drivePath: item.drivePath,
      };
      try {
        const parentId = await resolve(item.drivePath);
        results[i] = await uploadInto(drive, parentId, item, bytes, mimeType);
      } catch (e) {
        results[i] = { ...base, outcome: "error", error: e instanceof Error ? e.message : "Upload failed" };
      }
    }
  }

  const lanes = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: lanes }, () => worker()));
  return results;
}

export interface DriveClient {
  drive: drive_v3.Drive;
  rootId: string;
}

export function getDriveClient(): DriveClient {
  return { drive: getDrive(), rootId: process.env.GOOGLE_ACCOUNTING_DRIVE_ID! };
}
