import type { ReactNode } from "react";
import { AlertTriangle, Loader2, RefreshCw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AiBadge({ label = "AI", className }: { label?: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-accent-foreground uppercase",
        className,
      )}
    >
      <Sparkles className="size-3" /> {label}
    </span>
  );
}

export function ConfidenceMeter({
  value,
  label = "Confidence",
}: {
  value: number;
  label?: string;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const tone = pct >= 75 ? "bg-success" : pct >= 45 ? "bg-warning" : "bg-critical";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="font-semibold text-foreground">{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function AiThinking({ label = "CivicAI is analysing…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-accent/40 bg-accent/5 px-4 py-3">
      <span className="relative flex size-4 items-center justify-center">
        <span className="absolute size-4 animate-ping rounded-full bg-accent/40" />
        <Sparkles className="size-3.5 text-accent-foreground" />
      </span>
      <p className="text-sm font-medium">{label}</p>
      <Loader2 className="ml-auto size-4 animate-spin text-muted-foreground" />
    </div>
  );
}

export function AiErrorState({
  message,
  onRetry,
  pending,
}: {
  message: string;
  onRetry?: () => void;
  pending?: boolean;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-critical/40 bg-critical/5 p-4">
      <p className="inline-flex items-start gap-2 text-sm font-medium text-critical">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <span>{message}</span>
      </p>
      {onRetry ? (
        <Button size="sm" variant="outline" onClick={onRetry} disabled={pending}>
          {pending ? (
            <Loader2 className="mr-2 size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 size-3.5" />
          )}
          Retry analysis
        </Button>
      ) : null}
    </div>
  );
}

export function AiSection({
  title,
  hint,
  children,
  action,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="surface-card space-y-4 p-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-sm font-semibold">
            <AiBadge /> {title}
          </p>
          {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function AiFactorList({ factors }: { factors: { label: string; weight: number }[] }) {
  const max = Math.max(1, ...factors.map((f) => f.weight));
  return (
    <ul className="space-y-2.5">
      {factors.map((factor) => (
        <li key={factor.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">{factor.label}</p>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary/80"
                style={{ width: `${(factor.weight / max) * 100}%` }}
              />
            </div>
          </div>
          <span className="text-xs font-semibold text-muted-foreground">+{factor.weight}</span>
        </li>
      ))}
    </ul>
  );
}
