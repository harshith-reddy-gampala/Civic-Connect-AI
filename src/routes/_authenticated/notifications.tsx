import { createFileRoute, Link } from "@tanstack/react-router";
import { BellRing, Check, CheckCheck, Inbox } from "lucide-react";

import { EmptyState } from "@/components/civic/EmptyState";
import { DataErrorState } from "@/components/civic/ErrorBoundary";
import { PageHeader } from "@/components/civic/PageHeader";
import { ListSkeleton } from "@/components/civic/skeletons";
import { Button } from "@/components/ui/button";
import { useCurrentProfile } from "@/hooks/useSession";
import { relativeTime } from "@/lib/civic";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — CivicAI" },
      {
        name: "description",
        content: "Status change alerts and department updates for the issues you follow.",
      },
      { property: "og:title", content: "Notifications — CivicAI" },
      { property: "og:description", content: "Every update on your reported issues in one feed." },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { data: me } = useCurrentProfile();
  const userId = me?.profile?.id ?? undefined;
  const notifications = useNotifications(userId);
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead(userId);

  const rows = notifications.data ?? [];
  const unread = rows.filter((row) => !row.is_read);

  return (
    <>
      <PageHeader
        eyebrow="Updates"
        title="Notifications"
        description={
          unread.length ? `${unread.length} unread update${unread.length > 1 ? "s" : ""}.` : "You are all caught up."
        }
        actions={
          unread.length ? (
            <Button variant="outline" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
              <CheckCheck className="mr-2 size-4" aria-hidden="true" /> Mark all read
            </Button>
          ) : null
        }
      />

      {notifications.isError ? (
        <DataErrorState
          message={
            notifications.error instanceof Error ? notifications.error.message : undefined
          }
          onRetry={() => notifications.refetch()}
          pending={notifications.isFetching}
        />
      ) : notifications.isLoading ? (
        <ListSkeleton rows={5} />
      ) : rows.length ? (
        <ul className="space-y-3">
          {rows.map((row, index) => (
            <li
              key={row.id}
              style={{ animationDelay: `${index * 45}ms` }}
              className={`surface-card animate-fade-in grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 p-5 transition-colors ${
                row.is_read ? "" : "border-primary/40 bg-primary/[0.03]"
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <BellRing
                    className={`size-4 shrink-0 ${row.is_read ? "text-muted-foreground" : "text-primary"}`}
                  />
                  <p className="truncate text-sm font-semibold">{row.title}</p>
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground">{row.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">{relativeTime(row.created_at)}</p>
                {row.complaint_id ? (
                  <Button asChild size="sm" variant="link" className="mt-1 h-auto p-0">
                    <Link to="/complaints/$id" params={{ id: row.complaint_id }}>
                      View report
                    </Link>
                  </Button>
                ) : null}
              </div>
              {row.is_read ? null : (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => markRead.mutate(row.id)}
                  disabled={markRead.isPending}
                >
                  <Check className="size-4 sm:mr-1.5" aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only">Mark read</span>
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={Inbox}
          title="No notifications yet"
          description="Updates on your reports — assignment, progress and verified repairs — arrive here in real time."
        />
      )}
    </>
  );
}
