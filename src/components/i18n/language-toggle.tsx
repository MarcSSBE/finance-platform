"use client";

import { LANGS, type Lang } from "@/lib/i18n/messages";
import { useLang } from "./language-provider";
import { cn } from "@/lib/utils";

const LABELS: Record<Lang, string> = { en: "EN", sv: "SV" };

/** Segmented EN/SV control. */
export function LanguageToggle() {
  const { lang, setLang, t } = useLang();
  return (
    <div
      role="group"
      aria-label={t.common.language}
      className="inline-flex items-center rounded-full border border-rule bg-card p-0.5"
    >
      {LANGS.map((code) => {
        const active = code === lang;
        return (
          <button
            key={code}
            type="button"
            aria-pressed={active}
            onClick={() => setLang(code)}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {LABELS[code]}
          </button>
        );
      })}
    </div>
  );
}
