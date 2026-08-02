import { cn } from "@/lib/utils";
import { PRIORITY_META, STATUS_META, type ComplaintPriority, type ComplaintStatus } from "@/lib/civic";

const toneClass: Record<string, string> = {
  info: "bg-info/12 text-info border-info/25",
  warning: "bg-warning/15 text-warning border-warning/30",
  primary: "bg-primary/12 text-primary border-primary/25",
  accent: "bg-accent/15 text-accent-foreground border-accent/35",
  success: "bg-success/12 text-success border-success/25",
  critical: "bg-critical/12 text-critical border-critical/25",
  muted: "bg-muted text-muted-foreground border-border",
};

export function StatusBadge({ status, className }: { status: ComplaintStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase",
        toneClass[meta.tone],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {meta.label}
    </span>
  );
}

export function PriorityBadge({
  priority,
  className,
}: {
  priority: ComplaintPriority;
  className?: string;
}) {
  const meta = PRIORITY_META[priority];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase",
        toneClass[meta.tone],
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
