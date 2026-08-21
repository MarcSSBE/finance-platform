# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary: Veronica** — the bookkeeper who does the monthly finance close. Works from Sweden;
  the source documents are in Swedish and English. She is not a developer. Today she does slow,
  error-prone manual work: totaling columns by hand and renaming/filing invoice PDFs one by one.
  Her success is finishing the monthly reconciliation faster and with confidence the numbers are right.
- **Secondary: invoice contributors** (e.g. Exelle / Jam) — colleagues who download TikTok Ads
  invoice PDFs and hand them off. In the platform they upload PDFs for reconciliation/filing.
- **Occasional: oversight** (e.g. Mercy, Chris) — care that the workflow is faster and correct.

Phase 1 runs **locally on Veronica's/Marc's machine** (no deployment yet), so authentication is
deferred. The intended eventual shape is **multiple users with light roles** (uploader vs.
reviewer) once it deploys to Heroku — the UI should not assume a single anonymous user forever.

## Product Purpose

A finance workflow-automation platform that removes repetitive manual bookkeeping steps for the
monthly close. It does two independent jobs:

1. **Income Summary** — turn a WorldFirst `.xlsx` export (whose amount column imports as *text*, so
   Excel's SUM returns 0) into a correct monthly income total, shown on screen and exported back as
   a clean workbook.
2. **Ads Invoice Automation** — reconcile TikTok Ads invoice PDFs against the WorldFirst payment
   statement, auto-name them, and file them into the shared accounting Google Drive.

Success = Veronica trusts the output and the monthly close takes minutes instead of hours.

## Positioning

Purpose-built around *this* team's real documents and filing conventions (WorldFirst exports,
TikTok invoices, the `Accounting / NN. Mon YYYY / Tiktok` Drive structure, the
`Tiktok $<amount> <DD mon-YY> BE` naming rule) — not a generic spreadsheet or OCR tool. Every money
figure is computed deterministically and is auditable, so it earns trust a generic AI tool can't.

## Operating Context

- Monthly ritual, usually early in the month; ad-hoc by date range otherwise.
- **Project 1 input:** WorldFirst → filter "TikTok Inc." income → export XLS(X) "detail".
- **Project 2 inputs:** WorldFirst statement of TikTok Ads payments (PDF) + the matching TikTok
  invoice PDFs collected by a colleague.
- **Output destination:** shared Google Drive "Accounting" Shared Drive (Sleeve Stars org), month
  folders `NN. Mon YYYY`, channel subfolder `Tiktok`.
- Notifications intended via Slack (existing workspace).

## Capabilities and Constraints

- **Hard rule:** every currency total shown or written is computed by **deterministic code, never
  by the LLM.** Claude assists only (column detection, PDF field extraction with re-validation, OCR
  fallback, anomaly flags, plain-language summaries). No hallucinated money.
- **P1:** parse column D "Amount entered" (values stored as text), coerce to number, total with row
  count + currency breakdown + skipped-row list; export xlsx with the total below column D.
  Verified baseline: the July test file totals **3,619.59 USD** (28 rows).
- **P2:** extract Invoice #, Invoice Date, Client (BE = Burman Enterprise AB), Total per PDF;
  reconcile against statement payments by **amount + date tolerance (±2–3 days)** into three buckets
  (matched / payments-without-invoices / invoices-without-payments); rename to
  `Tiktok $<amount> <DD mon-YY> BE` (exact cents, period decimal, invoice date); file to Drive.
- **The two features stay decoupled** — separate modules, no cross-imports.
- **Phase 1 is stateless — no database.** MongoDB is the option later only if audit history /
  duplicate-file protection is needed.
- **Internationalization:** UI in **English by default, structured so Swedish can be added later**
  without rework. Source financial documents remain in their original Swedish/English.
- Drive filing reuses an existing Google service account added to the Accounting Shared Drive
  (auth detail being finalized); Slack + Anthropic key reused from existing Heroku apps.

## Brand Commitments

- Product name in-app: **"Finance Platform"** (explicitly **not** "RedAdair"). The company on the
  finance documents is **Burman Enterprise AB (BE)**.
- Voice: plain, reassuring, precise — the audience is a busy non-technical bookkeeper who needs to
  trust numbers, not admire jargon.

## Evidence on Hand

- `test-data/project-1/` — real WorldFirst income export (`…Worldfirst_2026-07-01_2026-07-31 BE.xlsx`), total 3,619.59.
- `test-data/project-2/` — WorldFirst ads statement PDF + 10 real TikTok invoice PDFs (June 2026).
- The June test set intentionally does NOT fully reconcile (a 419.04 payment with no invoice; an
  orphan Jun-23 $500 invoice) — real proof the reconciliation must surface both sides.
- No fabricated customers, testimonials, pricing, or metrics exist; future work must not invent any.

## Product Principles

1. **Numbers are sacred and deterministic.** The tool's whole value is trustworthy figures; AI never
   produces a final amount.
2. **Reduce Veronica's cognitive load.** Every screen should make the next action obvious and show
   its work (which rows counted, which invoices matched) so she can verify at a glance.
3. **Surface discrepancies, don't hide them.** Unmatched payments/invoices are the point, not an
   error to bury.
4. **Fit the real workflow and filing conventions exactly** — mirror the Drive structure and naming
   she already uses.
5. **Two jobs, cleanly separated** — each feature stands alone and stays simple.

## Accessibility & Inclusion

Non-technical primary user for whom the documents' language (Swedish) differs from a likely-English
UI; keep language plain, controls large and clearly labeled, states (loading/empty/error/success)
explicit, and results legible without spreadsheet expertise. No formal standard specified yet.
