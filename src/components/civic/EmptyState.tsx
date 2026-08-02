import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Standard empty state. Used everywhere a list can legitimately be empty so
 * blank screens always explain themselves and offer a next action.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon | undefined;
  title: string;
  description?: string | undefined;
  action?: React.ReactNode;
  className?: string | undefined;
}) {
  return (
    <div
      className={cn(
        "surface-card animate-fade-in flex flex-col items-center px-6 py-10 text-center",
        className,
      )}
    >
      {Icon ? (
        <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
          <Icon className="size-6" aria-hidden="true" />
        </span>
      ) : null}
      <p className="text-sm font-semibold">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
