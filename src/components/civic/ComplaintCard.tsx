import { Link } from "@tanstack/react-router";
import { ArrowUpRight, MapPin, ThumbsUp } from "lucide-react";

import { PriorityBadge, StatusBadge } from "@/components/civic/badges";
import { Button } from "@/components/ui/button";
import { categoryLabel, relativeTime, statusProgress } from "@/lib/civic";
import type { Complaint } from "@/lib/queries";

export function ComplaintCard({
  complaint,
  supported,
  onSupport,
  showSupport = false,
}: {
  complaint: Complaint;
  supported?: boolean;
  onSupport?: (id: string) => void;
  showSupport?: boolean;
}) {
  return (
    <article className="surface-card flex flex-col gap-4 p-5 transition-shadow hover:shadow-float">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-muted-foreground">{complaint.reference}</span>
            <PriorityBadge priority={complaint.priority} />
          </div>
          <h3 className="mt-1.5 truncate text-base font-semibold">{complaint.title}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{complaint.description}</p>
        </div>
        <StatusBadge status={complaint.status} />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex min-w-0 items-center gap-1">
          <MapPin className="size-3.5 shrink-0" />
          <span className="truncate">{complaint.address || "Location pending"}</span>
        </span>
        <span>{categoryLabel(complaint.category)}</span>
        <span>{relativeTime(complaint.created_at)}</span>
        <span className="inline-flex items-center gap-1">
          <ThumbsUp className="size-3.5" /> {complaint.support_count}
        </span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${statusProgress(complaint.status)}%` }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="px-2">
          <Link to="/complaints/$id" params={{ id: complaint.id }}>
            View timeline <ArrowUpRight className="ml-1 size-3.5" />
          </Link>
        </Button>
        {showSupport ? (
          <Button
            size="sm"
            variant={supported ? "secondary" : "default"}
            disabled={supported}
            onClick={() => onSupport?.(complaint.id)}
          >
            <ThumbsUp className="mr-1.5 size-3.5" />
            {supported ? "Supported" : "Support this"}
          </Button>
        ) : null}
      </div>
    </article>
  );
}
