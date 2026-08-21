# Finance Platform — Implementation Plan

A Next.js platform for AI + workflow automation, housing **two independent features**
under one shared shell:

- **Project 1 — Income Summary** (WorldFirst → TikTok Shop income): sum the "Amount entered" column and export a clean workbook.
- **Project 2 — Ads Invoice Automation** (TikTok Ads expenses): reconcile invoices against the WorldFirst statement, auto-rename, and file into Google Drive.

Both features are separate modules; they only share the app shell, design system, and infrastructure.

---

## 1. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | Modern, server actions/route handlers for file processing |
| UI | shadcn/ui + Tailwind + Radix | Clean, accessible, maintainable; installed the standard way (`components.json`) |
| XLSX read | SheetJS (`xlsx`) | Robust parsing of the `inlineStr` text cells |
| XLSX write | `exceljs` | Write the total below column D with formatting + a summary block |
| PDF text | `pdfjs-dist` / `pdf-parse` | Extract text layer (these invoices have clean text) |
| AI | `@anthropic-ai/sdk`, **Claude Sonnet 5** default | Assistive extraction, column detection, OCR fallback, plain-language summaries |
| Google Drive | `googleapis` | Upload + folder navigation/creation |
| Slack | Slack Bot token / webhook | Notify when a batch is ready / filed |
| DB | **None in Phase 1** (stateless) | Not needed for the core goal. If added later, use **MongoDB** (already available) — revisit only if audit trail / duplicate-file protection is needed |
| Deploy | Heroku | Matches existing infra (existing service account may live here) |

**Money rule (non-negotiable):** every currency total shown or written is computed by
**deterministic code**, never by the LLM. Claude only assists (column detection, extraction
candidates, anomaly flags, natural-language summaries). Extracted amounts are always
re-validated against the raw text before use.

---

## 2. Repository structure

```
finance-platform/
├── app/
│   ├── (shell)/                     # shared layout, nav, dashboard home
│   ├── income/                      # PROJECT 1 (isolated module)
│   │   ├── page.tsx                 # upload + summary UI
│   │   └── ...
│   ├── ads-invoices/                # PROJECT 2 (isolated module)
│   │   ├── page.tsx                 # statement upload + invoice reconcile UI
│   │   └── ...
│   └── api/
│       ├── income/summarize/route.ts
│       ├── invoices/reconcile/route.ts
│       └── invoices/file/route.ts
├── lib/
│   ├── shared/                      # auth, config, ui helpers, claude client
│   ├── income/                      # xlsx parse + sum + export  (P1 only)
│   └── invoices/                    # pdf parse, reconcile, rename, drive  (P2 only)
├── components/ui/                   # shadcn components
├── prisma/                          # optional
└── PLAN.md
```

---

## 3. Project 1 — Income Summary

**Goal:** Veronica uploads the WorldFirst `.xlsx`; the platform gives her the correct total
(the amounts import as *text*, so Excel's SUM returns 0) and an exportable clean workbook.

**Flow**
1. Upload `.xlsx` (drag-drop).
2. Parse with SheetJS. Locate the amount column — default **"Amount entered" (col D)**; if the
   header is missing/renamed, ask **Claude** to identify the amount column from the header row
   (assistive only), then confirm with the user.
3. Coerce each cell text → number deterministically (handle `.`/`,` decimals, spaces, currency).
4. Compute: **total**, **row count**, **currency breakdown**, **excluded/odd rows** (blanks,
   non-numeric, negatives/refunds, non-USD).
5. **On-screen summary** card: big total, counts, per-currency subtotals, list of skipped rows.
6. **Export**: `exceljs` writes the original rows back + a bold **TOTAL** cell below column D and
   a small summary block, downloadable as `.xlsx`. (Optionally a PDF matching the
   `Tiktok försäljning $<amount> <mon-yy>` sales-summary style already in Drive.)

**Test baseline:** `Tictok inc Worldfirst_2026-07-01_2026-07-31 BE.xlsx` → 28 rows, all USD → **3,619.59**. Parser must reproduce exactly.

**Claude's assistive role here:** column detection on layout drift; "compare to last month"
narrative; flag refunds/mixed currency. Never computes the total.

---

## 4. Project 2 — Ads Invoice Automation

**Goal:** Upload the WorldFirst statement + the invoice PDFs → reconcile → auto-rename → file
into Google Drive under the right month/Tiktok folder.

**Flow**
1. **Upload the WorldFirst statement** (PDF like `Tiktok ads juni-26.pdf`). Parse the
   `TIKTOK ADS` lines → list of `{date, amount}` payments (June test set = 10 lines).
2. **Upload the invoice PDFs** (from Exelle/Jam). For each, extract deterministically from the
   text layer: **Invoice #, Invoice Date, Client (BE), Total**. Use **Claude (OCR/vision)** only
   as fallback for invoices with no clean text layer. Re-validate the amount against raw text.
3. **Reconcile** payments ↔ invoices:
   - Match on **amount + date tolerance (±2–3 days)** — invoice dates run 1–2 days before the
     payment date (e.g. invoice Jun 18 → paid Jun 19). Do NOT require exact date match.
   - Produce three buckets: **Matched**, **Payments without invoices**, **Invoices without
     payments**. (The June test set intentionally has a 419.04 payment with no invoice and an
     extra Jun-23 $500 invoice with no payment — the UI must surface both.)
4. **Review screen**: table of matches + unmatched, with the proposed new filename per invoice.
   User confirms.
5. **Rename** each invoice → **`Tiktok $<amount> <DD mon-YY> BE`** from PDF content
   (e.g. `Tiktok $160.83 01 jun-26 BE`). Amount = exact cents; date = **Invoice Date**.
6. **File to Google Drive**: `Accounting / <NN. Mon YYYY> / Tiktok /`, month derived from the
   invoice date (June → `06. Jun 2026/Tiktok`). Create the month/`Tiktok` folder if missing,
   following the existing `NN. Mon YYYY` convention.
7. **Slack notification** when a batch is filed (count, total, any unmatched items).

**Confirmed Drive structure**
```
Accounting/                       (root shared to Marc; personal "Shared with me")
├── Previous Years/
├── 01. Jan 2026/ ... 08. Aug 2026/
    └── <each month>/  Many Chat | Orders | PayPal | QR Stuff | Amazon | Walmart | Tiktok
```

---

## 5. Google Drive auth (decision needed before P2 filing)

`Accounting` is a **personal "Shared with me"** folder (owner: Mercy Pango), **not** a Shared Drive.

- **Preferred:** move `Accounting` into a **Shared Drive**, use the **Heroku service account** as a member. No quota issues, no personal login. Most maintainable.
- **Fallback:** **OAuth as a real Workspace user** with edit access (dedicated service mailbox, or Marc/Veronica). Works today; needs periodic token refresh.

Build the Drive layer with a **swappable identity** (service account *or* OAuth) so we are not
blocked while this is decided.

---

## 6. Milestones

**M0 — Scaffold** (shell): Next.js + TS + Tailwind + shadcn, app shell/nav, `.env` config, Claude client, deploy skeleton to Heroku.

**M1 — Project 1 MVP**: xlsx upload → deterministic sum → on-screen summary → xlsx export. Verified against the 3,619.59 baseline. *(Shippable to Veronica first — highest priority.)*

**M2 — Claude assist for P1**: column auto-detect, anomaly flags, month-over-month narrative.

**M3 — Project 2 parsing + reconcile**: statement parse, invoice extract, reconciliation with the 3-bucket output, review UI. No Drive writes yet (dry run).

**M4 — Project 2 Drive filing**: rename + upload to correct folder (once auth decided), folder auto-create.

**M5 — Slack + polish**: notifications, error handling, empty/edge states.

> **Phase 1 is stateless — no database.** Each run is upload → process → download/file → done.
> Duplicate-file protection and audit history are deferred; if ever needed, add **MongoDB**
> (already available). Do not add a DB unless a concrete need appears.

---

## 7. Open decisions
1. **Drive auth identity** (§5) — Shared Drive + service account vs OAuth user.
2. **Decimal style in filename**: `$160.83` (period) vs `$160,83` (comma, as the Swedish sales file uses).
3. ~~DB or stateless~~ — **DECIDED: no DB in Phase 1 (stateless).** MongoDB is the option if ever needed later.
4. ~~Which Claude model~~ — **DECIDED: Sonnet 5 default, Opus 4.8 for harder reasoning.**
5. ~~Filename decimals~~ — **DECIDED: period** (`$160.83`), legal on Drive/all OSes.
6. **Google Drive SA** — recommend a **new dedicated service account** (isolates the calendar/error projects); reuse Slack + Claude key. Still need: which Workspace owns `Accounting` + which user to impersonate.
