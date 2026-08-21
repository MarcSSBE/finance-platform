# Design

<!-- impeccable:design-schema 1 · direction seed f32dc34a · mode operate -->

Recorded from the built world (not intention). The platform is a **tabbed filing
ledger** for a bookkeeper — an Operate surface where the numbers earn trust by showing
their work. It refuses the metric-card dashboard; content is ruled ledger rows, figures
are tabular monospace, and color speaks only as status.

## Foundations

- **Framework:** Next.js 16 (App Router) + React 19, Tailwind v4, shadcn/ui (base-nova).
- **Fonts:** Geist Sans (chrome/prose), Geist Mono (all figures, via `.tabular` +
  `tabular-nums`). Money and row numbers are always monospace and lined up.
- **Radius:** `--radius: 0.45rem` — crisp, ledger-like.
- **Light default** (chosen from the use scene: a bookkeeper at a desk in daytime light);
  a warm-neutral dark theme is defined and ready.

## Color (tokens in `src/app/globals.css`)

Warm-neutral "ledger paper" world (hue ≈ 85–90). Neutrals carry a faint warmth so the
surface reads as paper. Color is reserved for **status only** — never decoration.

- Ground `--background` oklch(0.992 0.004 90); ink `--foreground` oklch(0.23 0.009 75).
- Hairline rule `--rule` for all ledger lines and table borders.
- **Status (the one place color speaks):**
  - `--status-ok` green oklch(0.52 0.12 150) — reconciled / balanced / counted (+ `-soft` bg).
  - `--status-warn` amber oklch(0.62 0.13 65) — needs a look / invoice-no-payment.
  - `--status-error` red oklch(0.55 0.2 27) — negative / payment-no-invoice.
- Utilities: `text-status-ok`, `bg-status-ok-soft`, `border-rule`, etc.

## Browser surfaces (themed, not defaults)

Selection tint (status-ok wash), custom scrollbar thumb from the ink, focus rings from
`--ring`, and tabular numerals on every figure. A faint fixed paper wash on `body`.

## Composition

- **App shell** (`src/components/app-shell.tsx`): a header with the drawn reconcile mark
  (two ruled lines + a tie-out check, the product's one glyph) and wordmark; **filing
  tabs** (Income · Ads invoices) that sit on the sheet's top rule, the active tab
  connected to the sheet like a folder divider; a max-w-5xl content column; a footer that
  states the trust principle.
- **Income results** (`income-summary-view.tsx`): a tie-out band with the total in large
  tabular mono + a status chip; the full ledger table (Row · Description · Amount entered,
  right-aligned tabular) ending in a heavy-ruled **TOTAL** line; surfaced anomaly and
  refund notes; primary Export + ghost reset.
- **States:** idle (upload rule), parsing (spinner + plain-language step), error (status
  block + retry), done (the ledger).

## Principles carried into the build

1. Numbers are deterministic and shown with their work; the tie-out TOTAL is always visible.
2. Discrepancies are surfaced (Ads preview shows the three buckets), never hidden.
3. Filing metaphor stays light and functional — tabs and rules, no skeuomorphic kitsch.
4. Body never scrolls horizontally; tables stay legible down to a 390px viewport.

## Finish

Reviewed in-thread across desktop (1280) and mobile (390) screenshot rounds; the shipped
Impeccable finish-reviewer/documenter subagents are not registered as agent types in this
environment, so the review and this DESIGN.md were produced in-thread per the skill's
degraded path. `detect.mjs` reports no mechanical findings. No shipping rasters (icons are
drawn SVG / Lucide), so there is no provenance ledger to carry.
