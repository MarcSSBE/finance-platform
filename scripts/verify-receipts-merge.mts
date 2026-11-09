/**
 * One PDF of all receipts (Veronica 2026-11-09: Fortnox takes supporting documents one at a time unless
 * they are combined). Real data: her July Amex folder as downloaded from Drive (test-data/project-4/
 * amex-folder-july.zip, 45 files: 42 PDF + 3 PNG). Writes the result to test-data/project-4/
 * receipts-july-combined.pdf so it can be checked with another tool (pypdf), see the end of this file.
 *
 * Run: npx tsx scripts/verify-receipts-merge.mts
 */
import { readFileSync, writeFileSync } from "node:fs";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { mergeReceipts, orderReceipts } from "../src/lib/amex/merge";

const DIR = "test-data/project-4";
const checks: [string, boolean][] = [];
const check = (name: string, ok: boolean) => checks.push([name, ok]);

const zip = await JSZip.loadAsync(readFileSync(`${DIR}/amex-folder-july.zip`));
const files: { name: string; bytes: Uint8Array }[] = [];
for (const [path, entry] of Object.entries(zip.files)) if (!entry.dir) files.push({ name: path, bytes: await entry.async("uint8array") });
check("45 files in the July folder", files.length === 45);

// Pages per file, counted separately (encrypted ones excluded, as the merge must skip them).
const pagesOf: Record<string, number> = {};
let encrypted = 0;
for (const f of files) {
  const n = f.name.split("/").pop()!;
  if (/\.pdf$/i.test(n)) {
    const d = await PDFDocument.load(f.bytes, { ignoreEncryption: true });
    if (d.isEncrypted) encrypted++;
    else pagesOf[n] = d.getPageCount();
  } else pagesOf[n] = 1;
}

const r = await mergeReceipts(files, { contentsPage: true, title: "Amex receipts July 2026", createdISO: "2026-11-09" });
writeFileSync(`${DIR}/receipts-july-combined.pdf`, r.pdf);
const contentPages = r.totalPages - Object.values(pagesOf).reduce((a, b) => a + b, 0);
console.log(`added ${r.added.length}, skipped ${r.skipped.length} (${r.skipped.map((s) => s.reason).join(",")}), pages ${r.totalPages}, contents pages ${contentPages}, encrypted ${encrypted}`);
check("every file is either added or listed as skipped", r.added.length + r.skipped.length === 45);
check("skipped = exactly the encrypted PDFs (none dropped silently)", r.skipped.length === encrypted && r.skipped.every((s) => s.reason === "encrypted"));
check("total pages = all receipt pages + contents page(s)", contentPages >= 1 && contentPages <= 2);
check("each receipt has its own page count", r.added.every((a) => a.pages === pagesOf[a.name]));
check("first pages run on without gaps", r.added.every((a, i) => i === 0 ? a.firstPage === contentPages + 1 : a.firstPage === r.added[i - 1].firstPage + r.added[i - 1].pages));
const reread = await PDFDocument.load(r.pdf);
check("the result opens again with the same page count", reread.getPageCount() === r.totalPages);
const noContents = await mergeReceipts(files, { contentsPage: false });
check("without contents page: exactly the receipt pages", noContents.totalPages === r.totalPages - contentPages);

// Order: by the date in the name, unreadable names last.
const order = orderReceipts([
  { name: "Zendesk $115 aug-26.pdf" }, { name: "TraceFuse $450 Aug16-26.pdf" }, { name: "Notes.pdf" },
  { name: "Wispr AI $150 jul-26.pdf" }, { name: "TraceFuse $225 Aug30-26.pdf" },
]).map((f) => f.name);
check("order: month, then day (month-only names first in their month), then vendor; unreadable last",
  order.join("|") === "Wispr AI $150 jul-26.pdf|Zendesk $115 aug-26.pdf|TraceFuse $450 Aug16-26.pdf|TraceFuse $225 Aug30-26.pdf|Notes.pdf");
const other = await mergeReceipts([{ name: "x.docx", bytes: new Uint8Array([1, 2]) }, { name: "y.pdf", bytes: new Uint8Array([1, 2, 3]) }]);
check("other types and broken PDFs are listed, not dropped", other.skipped.map((s) => s.reason).join() === "type,unreadable" && other.added.length === 0);

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}
console.log(failed ? `\n❌ ${failed} of ${checks.length} failed.` : `\n${checks.length}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
