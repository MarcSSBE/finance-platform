"use client";

import { useT } from "./language-provider";

/** Translated page title + description for a feature section. */
export function PageHeading({ section }: { section: "income" | "ads" }) {
  const t = useT();
  const s = t[section];
  return (
    <header className="space-y-1.5">
      <h1 className="text-2xl font-semibold tracking-tight">{s.title}</h1>
      <p className="max-w-prose text-muted-foreground">{s.desc}</p>
    </header>
  );
}
