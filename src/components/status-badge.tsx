import { cn } from "@/lib/utils";

type Tone = "ok" | "warn" | "error" | "ai" | "neutral";

const TONE: Record<Tone, string> = {
  ok: "text-status-ok bg-status-ok-soft/70 ring-status-ok/30",
  warn: "text-status-warn bg-status-warn-soft/70 ring-status-warn/30",
  error: "text-status-error bg-status-error-soft/70 ring-status-error/30",
  ai: "text-status-warn bg-status-warn-soft/70 ring-status-warn/30",
  neutral: "text-muted-foreground bg-muted ring-border",
};

/**
 * A crafted status tag: hairline ring in the status hue + a tinted field + a
 * Lucide icon. One system across the app so status reads consistently and the
 * color always carries meaning (never decoration).
 */
export function StatusBadge({
  tone = "neutral",
  size = "sm",
  icon,
  children,
  className,
}: {
  tone?: Tone;
  size?: "sm" | "md";
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md font-medium ring-1 ring-inset whitespace-nowrap",
        TONE[tone],
        size === "md" ? "gap-1.5 px-2.5 py-1 text-sm" : "gap-1 px-2 py-0.5 text-xs",
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** Small tinted square that holds a section's Lucide icon (bucket headers). */
export function IconTile({
  tone,
  icon,
}: {
  tone: Exclude<Tone, "neutral">;
  icon: React.ReactNode;
}) {
  const map: Record<string, string> = {
    ok: "text-status-ok bg-status-ok-soft/70 ring-status-ok/25",
    warn: "text-status-warn bg-status-warn-soft/70 ring-status-warn/25",
    error: "text-status-error bg-status-error-soft/70 ring-status-error/25",
    ai: "text-status-warn bg-status-warn-soft/70 ring-status-warn/25",
  };
  return (
    <span
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded-md ring-1 ring-inset",
        map[tone],
      )}
    >
      {icon}
    </span>
  );
}
