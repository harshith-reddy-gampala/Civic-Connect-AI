import { Link } from "@tanstack/react-router";
import { Activity } from "lucide-react";

import { EmptyState } from "@/components/civic/EmptyState";
import { ListSkeleton } from "@/components/civic/skeletons";
import { StatusBadge } from "@/components/civic/badges";
import { relativeTime } from "@/lib/civic";
import { useRecentActivity } from "@/lib/queries";

/**
 * City-wide "recent activity" stream built from status transitions. Realtime
 * invalidation keeps it current without polling.
 */
export function ActivityFeed({ limit = 8 }: { limit?: number }) {
  const { data, isLoading } = useRecentActivity(limit);

  if (isLoading) return <ListSkeleton rows={4} />;
  if (!data?.length) {
    return (
      <EmptyState
        icon={Activity}
        title="No activity yet"
        description="Status changes across departments will stream in here as officers act on reports."
      />
    );
  }

  return (
    <ol className="surface-card divide-y divide-border p-0">
      {data.map((row, index) => (
        <li
          key={row.id}
          className="animate-fade-in px-4 py-3.5"
          style={{ animationDelay: `${index * 45}ms` }}
        >
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="min-w-0">
              {row.complaint_id ? (
                <Link
                  to="/complaints/$id"
                  params={{ id: row.complaint_id }}
                  className="truncate text-sm font-medium underline-offset-2 hover:underline"
                >
                  {row.complaints?.title ?? "Report update"}
                </Link>
              ) : (
                <p className="truncate text-sm font-medium">Report update</p>
              )}
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                {row.remarks ?? `Updated by ${row.changed_by_name}`}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">{relativeTime(row.created_at)}</p>
            </div>
            <StatusBadge status={row.status} />
          </div>
        </li>
      ))}
    </ol>
  );
}
