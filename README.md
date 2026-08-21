# Finance Platform

A Next.js tool that speeds up a monthly bookkeeping close. Two features:

- **Income summary** — upload a WorldFirst `.xlsx` export whose amounts import as text
  (so Excel's `SUM` shows 0), get the correct monthly total computed in code, and export a
  clean workbook with the total written in.
- **Ads invoices** — upload the WorldFirst statement plus the TikTok invoice PDFs, reconcile
  them (matched / payment-with-no-invoice / invoice-with-no-payment), auto-rename each invoice
  to a consistent convention, and file them into a Google Drive folder.

Every currency total is computed by deterministic code, never by an LLM. An optional Claude
fallback reads scanned or reformatted PDFs when the text layer can't be parsed; anything it
reads is flagged for human confirmation. UI is available in English and Swedish.

## Stack

Next.js (App Router) · TypeScript · Tailwind + shadcn/ui · ExcelJS · unpdf · googleapis ·
`@anthropic-ai/sdk`.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev                  # http://localhost:3100
```

## Environment variables

See `.env.example`. All are optional; each feature degrades gracefully when its variables are
unset:

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Optional AI fallback for hard-to-read PDFs |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY_BASE64`, `GOOGLE_ACCOUNTING_DRIVE_ID` | Google Drive filing |

Secrets live in `.env.local` (gitignored) locally and in the host's environment variables in
production.

## Scripts

- `npm run dev` / `npm run build` / `npm run start` (port 3100)
- `npm run typecheck`
- `npx tsx scripts/verify-income.mts` — checks the income parser against a known total
- `npx tsx scripts/verify-invoices.mts` — checks the invoice reconciliation
