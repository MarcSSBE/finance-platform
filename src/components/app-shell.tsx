"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/language-provider";
import { LanguageToggle } from "@/components/i18n/language-toggle";

const TABS = [
  { href: "/income", key: "income", match: ["/", "/income"] },
  { href: "/ads-invoices", key: "ads", match: ["/ads-invoices"] },
] as const;

/** The reconcile tick — the product's one drawn mark, in the ledger's own hand. */
function LedgerMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 28 28"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* two ruled ledger lines */}
      <path d="M4 9h9M4 14h6" className="opacity-40" />
      {/* the tie-out check */}
      <path d="M14 18.5l3.4 3.5L24 12" className="text-status-ok" />
    </svg>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const t = useT();

  return (
    <div className="flex min-h-full min-w-0 flex-col overflow-x-hidden">
      <header className="border-b border-rule">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/income" className="group flex items-center gap-2.5">
            <LedgerMark className="h-7 w-7 text-foreground" />
            <span className="text-[0.95rem] font-semibold tracking-tight">
              {t.common.brand}
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="hidden text-xs text-muted-foreground sm:block">
              {t.common.tagline}
            </span>
            <LanguageToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl px-6">
        <nav
          className="flex items-end gap-1 border-b border-rule"
          aria-label={t.common.sections}
        >
          {TABS.map((tab) => {
            const active = (tab.match as readonly string[]).includes(pathname);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative -mb-px rounded-t-md border px-4 py-2 text-sm transition-colors",
                  active
                    ? "border-rule border-b-background bg-background font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                {t.tabs[tab.key]}
              </Link>
            );
          })}
        </nav>
      </div>

      <main className="mx-auto w-full min-w-0 max-w-5xl flex-1 px-6 py-8">{children}</main>

      <footer className="border-t border-rule">
        <div className="mx-auto w-full max-w-5xl px-6 py-4 text-xs text-muted-foreground">
          {t.common.footer}
        </div>
      </footer>
    </div>
  );
}
