import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";

import { AnimatedNumber } from "@/components/civic/AnimatedNumber";
import { cn } from "@/lib/utils";

const tones: Record<string, { chip: string; glow: string }> = {
  primary: { chip: "bg-primary/10 text-primary", glow: "from-primary/12" },
  warning: { chip: "bg-warning/15 text-warning", glow: "from-warning/12" },
  success: { chip: "bg-success/12 text-success", glow: "from-success/12" },
  critical: { chip: "bg-critical/12 text-critical", glow: "from-critical/12" },
  accent: { chip: "bg-accent/15 text-accent-foreground", glow: "from-accent/15" },
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "primary",
  delta,
  deltaLabel,
  index = 0,
}: {
  label: string;
  value: string | number;
  hint?: string | undefined;
  icon: LucideIcon;
  tone?: "primary" | "warning" | "success" | "critical" | "accent";
  /** Percentage change vs the previous period. Positive is shown as an uptick. */
  delta?: number | undefined;
  deltaLabel?: string | undefined;
  /** Position in a grid — drives the entrance stagger. */
  index?: number;
}) {
  const toneStyle = tones[tone] ?? tones["primary"]!;
  const numeric = typeof value === "number";
  const Trend = (delta ?? 0) >= 0 ? TrendingUp : TrendingDown;

  return (
    <div
      className="surface-card group animate-fade-in relative overflow-hidden p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-float"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <div
        className={cn(
          "pointer-events-none absolute -top-16 -right-16 size-40 rounded-full bg-gradient-to-br to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100",
          toneStyle.glow,
        )}
        aria-hidden="true"
      />
      <div className="relative grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            {label}
          </p>
          <p className="mt-2 font-display text-3xl leading-none font-bold tabular-nums">
            {numeric ? <AnimatedNumber value={value as number} /> : value}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {typeof delta === "number" && Number.isFinite(delta) ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
                  delta >= 0 ? "bg-success/12 text-success" : "bg-critical/12 text-critical",
                )}
              >
                <Trend className="size-3" aria-hidden="true" />
                {delta >= 0 ? "+" : ""}
                {delta.toFixed(0)}%
                <span className="sr-only">
                  {delta >= 0 ? "increase" : "decrease"} {deltaLabel ?? "vs previous period"}
                </span>
              </span>
            ) : null}
            {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
          </div>
        </div>
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", toneStyle.chip)}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}
