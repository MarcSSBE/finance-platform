# CLAUDE.md — Finance Platform

Project context for Claude Code. Read this first. Full implementation detail lives in `PLAN.md`.

## What this is
A **Next.js** platform for **AI + workflow automation** in finance/bookkeeping. Its purpose is
to give **Veronica** (the bookkeeper) convenience and better productivity — it replaces slow,
manual monthly chores. Built by **Marc**. Kickoff meeting: 2026-08-20.

> Do **NOT** call this "RedAdair". The name is just "finance platform". (`redadair.com.au` is only
> Marc's login email.) The company on the actual finance documents is **Burman Enterprise AB (BE)**.

It contains **two independent features**, treated as separate modules that share only the app
shell, design system, and infrastructure:

- **Project 1 — Income Summary** (WorldFirst → TikTok Shop income)
- **Project 2 — Ads Invoice Automation** (TikTok Ads expenses → Google Drive)

## The one hard rule
**Every currency total shown or written is computed by deterministic code — NEVER by the LLM.**
Money must not be hallucinated. Claude is the *assistive* layer only: column detection, PDF
field extraction (with re-validation against raw text), OCR fallback, anomaly flags, and
plain-language summaries.

---

## Project 1 — Income Summary
Veronica exports a monthly report from **WorldFirst**, filtered to "TikTok Inc." income, as
`.xlsx`. **Problem:** WorldFirst writes every cell as text (`t="inlineStr"`), so Excel's `SUM`
returns 0 — she totals it by hand. **Not** a decimal/locale issue.

**Feature:** upload the `.xlsx` → parse column **D "Amount entered"**, coerce text→number →
show total + row count + currency breakdown + skipped rows on screen → export a clean `.xlsx`
with the total written below column D.

**Test baseline:** `Project 1 Tests/Tictok inc Worldfirst_2026-07-01_2026-07-31 BE.xlsx`
= 28 rows, all USD → **total 3,619.59**. The parser must reproduce this exactly.

## Project 2 — Ads Invoice Automation
Veronica exports a **WorldFirst statement** of TikTok Ads payments for a date range, then a
colleague (Exelle/Jam) downloads the matching **invoice PDFs** from TikTok.

**Feature:** upload the statement + the invoice PDFs → **reconcile** them → **auto-rename** each
invoice → **file into Google Drive** → **Slack** notification.

- **Extract per invoice** (deterministic text layer; Claude OCR fallback): Invoice #, Invoice
  Date, Client (BE), Total.
- **Reconcile** payments ↔ invoices by **amount + date tolerance (±2–3 days)** — invoice dates
  run 1–2 days before the payment date, so do NOT require exact date match. Output three buckets:
  **Matched**, **Payments without invoices**, **Invoices without payments** (both sides must be
  surfaced — the June test set has a 419.04 payment with no invoice and an orphan Jun-23 $500
  invoice).
- **Filename convention:** `Tiktok $<amount> <DD mon-YY> BE` — exact cents, **period** decimal,
  date = Invoice Date. e.g. `Tiktok $160.83 01 jun-26 BE`.
- **Drive path:** `Accounting / <NN. Mon YYYY> / Tiktok /`, month from the invoice date
  (June → `06. Jun 2026/Tiktok`). Create month/`Tiktok` folder if missing.

**Test data:** `Project 2 Tests/Tiktok ads juni-26 (1).pdf` (statement, 10 lines) +
`Project 2 Tests/Tiktok Invoices/` (10 invoice PDFs).

**Confirmed Drive structure** (`Accounting` is a personal "Shared with me" folder, owner
"Mercy Pango"):
```
Accounting/
├── Previous Years/
├── 01. Jan 2026/ … 08. Aug 2026/
    └── <month>/  Many Chat | Orders | PayPal | QR Stuff | Amazon | Walmart | Tiktok
```
The `Tiktok` subfolder also holds Project 1's sales summary
(`Tiktok försäljning $3850,95 juni-26.pdf`).

---

## Decisions (locked)
- **Stack:** Next.js (App Router) + TypeScript, **shadcn/ui** + Tailwind (installed the standard
  way), `@anthropic-ai/sdk`, SheetJS (xlsx read), exceljs (xlsx write), pdfjs/pdf-parse, googleapis, Slack.
- **Database: NONE in Phase 1 (stateless).** Core goal doesn't need it. If ever needed later
  (audit trail / duplicate-file protection), use **MongoDB** (the available DB) — not Postgres.
- **Claude model:** **Sonnet 5** default for extraction; **Opus 4.8** for harder reasoning.
- **Filename decimals:** **period** (`$160.83`) — legal on Drive and all OSes.
- **Two features stay isolated:** `app/income/` and `app/ads-invoices/`, shared shell only.

## Existing infrastructure (reusable — see memory `existing-infra-heroku`)
Heroku CLI authenticated as `marc@burmanenterprise.com`. Apps:
- **be-dev-error** — has a Google service account with **domain-wide delegation** (impersonates
  `rupert@sleevestars.com`, currently Calendar/Sheets) + **Slack** token & channels.
- **be-image-video-gen** — has the **ANTHROPIC_API_KEY**.
- **be-mcp-server** — Zoom creds.

**Never print `GOOGLE_PRIVATE_KEY`** (the safety classifier blocks partial output too).

### Google Drive auth (OPEN — blocks only M4)
Recommendation: create a **new dedicated service account** for the finance platform (isolates
the calendar/error projects, least blast radius, independently revocable). Reuse Slack + the
Anthropic key only. Still needed: **which Workspace owns `Accounting`** (sleevestars.com vs
burmanenterprise.com) and **which user to impersonate** (must have edit access to `Accounting`).
With impersonation, the SA writes as a real user, so no Shared-Drive conversion is required.

---

## Milestones
- **M0** — Scaffold (Next.js + shadcn shell, config, Claude client).
- **M1** — Project 1 MVP (upload → deterministic sum → summary → export). Ship to Veronica first. ✅ target = 3,619.59.
- **M2** — Claude assist for P1 (column auto-detect, anomaly flags, month-over-month narrative).
- **M3** — Project 2 parse + reconcile + review UI (dry run, no Drive writes).
- **M4** — Project 2 Drive filing (needs auth decision).
- **M5** — Slack notifications + polish.

## Writing style (user preference)
- **No em-dashes (—) in user-facing text** — they read as AI-generated. Use commas, periods,
  or restructure. Applies to both EN and SV strings in `src/lib/i18n/messages.ts` and any
  visible copy. (Code comments are exempt.) Empty-value placeholders may stay as "—".
- Browser tab title is just **"Finance Platform"** on every page (no per-page `metadata.title`;
  it inherits the root layout title).

## Conventions & guardrails
- Deterministic math for all money; Claude never produces a final figure.
- Keep the two feature modules decoupled — no cross-imports between `income/` and `ads-invoices/`.
- Secrets come from env/Heroku config; never commit or print credentials.
- Match existing code style; prefer readable, maintainable code over cleverness.
- **Design:** Impeccable skill is installed (`.claude/skills/impeccable`). Direction =
  "Tabbed Filing Ledger" (seed f32dc34a, contract in `src/app/layout.tsx`; world recorded
  in `DESIGN.md`). Keep the ledger world; color only ever encodes status.

## How to run
- `npm run dev` → http://localhost:3100 (port 3100 to avoid the user's other :3000 app).
- `npm run typecheck`, `npm run build`, `npm run start` (also :3100).
- `npx tsx scripts/verify-income.mts` — asserts the parser reproduces 3,619.59 (28 rows).

## Current status
- **M1 (Income Summary) — DONE + verified.** Upload WorldFirst `.xlsx` → deterministic
  total (3,619.59 confirmed via UI + API + unit tests) → ledger results → export `.xlsx`
  with the real numeric TOTAL below column D.
- **M3 (Ads Invoice reconcile + local filing) — DONE + verified.** Upload statement PDF +
  invoice PDFs → parse (pdf-parse v2) → reconcile by amount + ±3-day tolerance → three
  buckets (matched / payment-no-invoice / invoice-no-payment) → auto-rename
  `Tiktok $<amt> <DD mon-YY> BE.pdf` → **download `.zip` mirroring the Drive layout**
  (`Accounting/06. Jun 2026/Tiktok/…`). Validated end-to-end via `verify-invoices.mts`
  and HTTP + a driven-UI screenshot. June test set: 9 matched, 419.04 payment w/o invoice,
  Jun-23 $500 invoice w/o payment.
  - NOTE: `serverExternalPackages: ["pdf-parse","pdfjs-dist"]` in `next.config.ts` is
    REQUIRED — without it the pdf worker file isn't found in the server bundle.
  - Correction: the June statement total is **4,375.37** (not 4,475.37 from the earlier
    meeting analysis); invoices total 4,456.33; difference 80.96 (= one extra $500 invoice
    minus the un-invoiced 419.04 payment).
- **AI assist layer — DONE (deterministic-first, inert without a key).** `src/lib/ai/claude.ts`
  (`extractStructured` = forced tool call + Zod validation). Fallbacks fire ONLY when the
  deterministic path fails: invoice/statement extraction (handles scanned/reformatted PDFs
  via Claude's document reading) and P1 amount-column detection. AI-read invoices are marked
  `source: "ai"` + `needsReview: true` and show a "Read by AI — confirm" badge; the SUM/match
  math is always deterministic. Set `ANTHROPIC_API_KEY` (+ optional `ANTHROPIC_MODEL`) in
  `.env.local` to activate; without it every fallback returns null and behavior is unchanged.
- **i18n (EN/SV) — DONE.** Header toggle switches the whole platform UI between English
  and Swedish. Single dictionary `src/lib/i18n/messages.ts` (en = source, sv typed to match);
  `LanguageProvider`/`useT` in `src/components/i18n/`; choice persisted in the `lang` cookie
  (read server-side in `layout.tsx`, which is `dynamic = "force-dynamic"`) + localStorage.
  ONLY UI chrome is translated — file contents (the exported `.xlsx` TOTAL/labels, invoice
  filenames, the literal "Amount entered" column name) stay as-is. GOTCHA fixed: the cookie
  name constant must live in a NON-`"use client"` module (`messages.ts`), else importing it
  into the server layout yields a client-reference proxy and `cookies().get()` misses it.
- **M4 = Google Drive filing — DONE + verified live (2026-08-21).** Dedicated SA
  `finance-drive-filer@be-ai-502505.iam.gserviceaccount.com` is a Content-manager member of
  the `Accounting` Shared Drive (driveId `0AD4yjvCO7AJnUk9PVA`, Accounting folder
  `1hDYTNPXkzNfG33-k23ArvbO2d5Voybc_`). `src/lib/invoices/drive.ts` (JWT auth,
  `supportsAllDrives`, find-or-create `NN. Mon YYYY`/`Tiktok`, upload, dedup by name),
  route `POST /api/invoices/file-to-drive`, "File to Google Drive" button in reconcile-view
  (shown when `driveEnabled`). Zip download stays as fallback. Verified: auth + read + create
  folder + upload + dedup all work. NOTE: the Content-manager SA can create/upload but NOT
  permanently delete (only trash) — the code never deletes, so fine. Key stored in `.env` as
  **`GOOGLE_PRIVATE_KEY_BASE64`** (single line — editors mangle multi-line PEM). Inert without env.
  Have NOT auto-filed real June invoices into Drive (outward action — left to user's click).
- **Superseded M4 planning below.**
  - Use a **NEW dedicated service account** (not the calendar SA). Added as a **Content
    manager member of the `Accounting` Shared Drive** — Shared Drive membership means direct
    upload, no quota/impersonation needed.
  - **Auto-create** missing `NN. Mon YYYY` and `Tiktok` folders (find-or-create) then upload
    the renamed PDF; skip duplicates so re-runs don't double-file.
  - Env (`.env.local` / Heroku): `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` (one
    line, `\n`-escaped), `GOOGLE_ACCOUNTING_DRIVE_ID` (Accounting folder id — likely
    `1hDYTNPXkzNfG33-k23ArvbO2d5Voybc_`, confirm).
  - Build: googleapis Drive client (JWT auth, scope drive, `supportsAllDrives`), a
    "File to Google Drive" button beside the zip download (zip stays as fallback), and an
    auth-probe (create+delete a test file) run before real filing. Inert until env set.
  - User chose to WAIT to build until the SA is added + env vars in place.
  - No DB in phase 1.
- Key files: `src/lib/income/*`, `src/lib/invoices/*`, `src/app/api/{income,invoices}/*`,
  `src/components/{income,invoices}/*`, `src/components/app-shell.tsx`.
  Tests: `scripts/verify-income.mts`, `scripts/verify-invoices.mts`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
