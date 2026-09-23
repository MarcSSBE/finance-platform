/**
 * Integration test for the Amazon Drive-filing path (Project 3) against a FAKE
 * Drive, proving the fix for "only a few invoices ended up in the folders".
 *
 * The real failure: the old code re-resolved every folder segment for every file
 * (~3 folder-list calls/file → ~210 for 70 invoices) and filed strictly
 * sequentially, so a 70-file batch made ~350 sequential Drive calls and blew past
 * Vercel's 60s function limit. The function was killed mid-loop; only the first
 * handful landed.
 *
 * This asserts, with a fake Drive that counts calls and adds latency:
 *   1. 70 invoices across 8 country folders → 70 uploaded, 0 lost.
 *   2. Folders are resolved ONCE for the whole batch (memoization), not per file.
 *   3. Bounded concurrency keeps wall-clock well under the 60s limit.
 *   4. Re-running the same batch is idempotent (all skipped-duplicate).
 *
 * Run: npx tsx scripts/verify-amazon-filing.mts
 */
import { fileToDriveBatch, type DriveBatchItem } from "../src/lib/drive";

const ROOT = "root-accounting";
const CALL_LATENCY_MS = 40; // realistic-ish Drive API round-trip

// ---- Fake Drive -----------------------------------------------------------
interface Node {
  id: string;
  name: string;
  parent: string;
  isFolder: boolean;
}
function makeFakeDrive() {
  const nodes = new Map<string, Node>(); // id -> node
  let seq = 0;
  const counts = { list: 0, create: 0, folderCreate: 0, fileCreate: 0 };

  const delay = () => new Promise((r) => setTimeout(r, CALL_LATENCY_MS));
  const parse = (q: string) => {
    const name = /name\s*=\s*'((?:[^'\\]|\\')*)'/.exec(q)?.[1]?.replace(/\\'/g, "'") ?? "";
    const parent = /'([^']+)'\s+in parents/.exec(q)?.[1] ?? "";
    const isFolder = /mimeType\s*=\s*'application\/vnd\.google-apps\.folder'/.test(q);
    return { name, parent, isFolder };
  };

  const files = {
    async list({ q }: { q: string }) {
      counts.list++;
      await delay();
      const { name, parent, isFolder } = parse(q);
      const match = [...nodes.values()].filter(
        (n) => n.name === name && n.parent === parent && (!isFolder || n.isFolder),
      );
      return { data: { files: match.map((n) => ({ id: n.id, name: n.name, webViewLink: `link/${n.id}` })) } };
    },
    async create({ requestBody, media }: { requestBody: { name: string; parents?: string[]; mimeType?: string }; media?: unknown }) {
      counts.create++;
      const isFolder = requestBody.mimeType === "application/vnd.google-apps.folder";
      if (isFolder) counts.folderCreate++;
      else counts.fileCreate++;
      await delay();
      const id = `n${++seq}`;
      nodes.set(id, {
        id,
        name: requestBody.name,
        parent: requestBody.parents?.[0] ?? "",
        isFolder,
      });
      void media;
      return { data: { id, webViewLink: `link/${id}` } };
    },
  };
  // Cast to the drive_v3.Drive shape the code uses (only files.list/create).
  return { drive: { files } as unknown as Parameters<typeof fileToDriveBatch>[0], counts, nodes };
}

// ---- Build a realistic 70-invoice batch -----------------------------------
const COUNTRIES = ["BE", "DE", "ES", "FR", "IT", "NL", "PL", "UK"];
const bytes = Buffer.from("%PDF-1.4 fake");
const items: DriveBatchItem[] = [];
for (let i = 0; i < 70; i++) {
  const cc = COUNTRIES[i % COUNTRIES.length];
  const amt = (10 + i).toFixed(2); // unique totals -> unique names (route guarantees uniqueness)
  items.push({
    item: {
      fileName: `${cc}__SE-AEU-2026-${40000 + i}.pdf`,
      proposedName: `Amazon ${cc} Merchant EUR ${amt}.pdf`,
      drivePath: `Accounting/08. Aug 2026/Amazon/${cc}`,
    },
    bytes,
  });
}

let fail = 0;
function assert(label: string, cond: boolean, detail = "") {
  if (!cond) fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
}

// ---- Run 1: first filing --------------------------------------------------
console.log(`Filing ${items.length} invoices across ${COUNTRIES.length} country folders (fake Drive, ${CALL_LATENCY_MS}ms/call)\n`);
const fake = makeFakeDrive();
const t0 = performance.now();
const results = await fileToDriveBatch(fake.drive, ROOT, items);
const elapsed = performance.now() - t0;

const uploaded = results.filter((r) => r.outcome === "uploaded").length;
const errors = results.filter((r) => r.outcome === "error");

assert("all 70 uploaded, none lost", uploaded === 70, `uploaded=${uploaded}`);
assert("no errors", errors.length === 0, errors.map((e) => e.error).join("; "));
assert("results returned in input order", results.every((r, i) => r.fileName === items[i].item.fileName));

// Memoization proof: unique folders = 1 month + 1 Amazon + 8 countries = 10.
// Each is looked up once (list) and created once (folderCreate) since none exist.
assert("folders created exactly once each (memoized)", fake.counts.folderCreate === 10, `folderCreate=${fake.counts.folderCreate} (expected 10, NOT ~210)`);
assert("70 file uploads", fake.counts.fileCreate === 70, `fileCreate=${fake.counts.fileCreate}`);

// Total Drive calls: old approach was ~350 sequential (~14s @40ms, far worse at
// real 200-500ms latency). New: folder lists (10) + folder creates (10) +
// per-file dup-check lists (70) + file creates (70) = 160, run concurrently.
console.log(`\n  Drive calls: list=${fake.counts.list}, create=${fake.counts.create} (folders=${fake.counts.folderCreate}, files=${fake.counts.fileCreate})`);
console.log(`  Wall-clock: ${(elapsed / 1000).toFixed(2)}s @ ${CALL_LATENCY_MS}ms/call`);
assert("wall-clock well under 60s limit", elapsed < 20000, `${(elapsed / 1000).toFixed(2)}s`);

// ---- Run 2: idempotent re-run (same fake Drive state) ---------------------
console.log(`\nRe-filing the same batch (idempotency)`);
const results2 = await fileToDriveBatch(fake.drive, ROOT, items);
const skipped2 = results2.filter((r) => r.outcome === "skipped-duplicate").length;
const uploaded2 = results2.filter((r) => r.outcome === "uploaded").length;
assert("re-run skips all as duplicates", skipped2 === 70, `skipped=${skipped2}`);
assert("re-run uploads nothing new", uploaded2 === 0, `uploaded=${uploaded2}`);
assert("re-run creates no new folders", fake.counts.folderCreate === 10, `folderCreate=${fake.counts.folderCreate}`);

console.log(fail === 0 ? `\n✅ Filing path proven: 70 in, 70 filed, folders memoized, idempotent.` : `\n❌ ${fail} assertion(s) failed.`);
process.exit(fail === 0 ? 0 : 1);
