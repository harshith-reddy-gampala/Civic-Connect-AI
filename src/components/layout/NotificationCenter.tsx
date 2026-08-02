import { Link } from "@tanstack/react-router";
import { Bell, BellRing, Check, Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { relativeTime } from "@/lib/civic";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "@/lib/queries";
import { cn } from "@/lib/utils";

/**
 * Topbar notification centre. Backed by the same query as the full feed, so the
 * realtime channel keeps the unread badge and the panel in sync.
 */
export function NotificationCenter({ userId }: { userId?: string | undefined }) {
  const { data, isLoading } = useNotifications(userId);
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead(userId);

  const rows = data ?? [];
  const unread = rows.filter((row) => !row.is_read).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative min-h-11 min-w-11"
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        >
          <Bell className="size-4" aria-hidden="true" />
          {unread ? (
            <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-critical px-1 text-[10px] font-bold text-critical-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Notifications</p>
            <p className="truncate text-xs text-muted-foreground">
              {unread ? `${unread} unread` : "You are all caught up"}
            </p>
          </div>
          {unread ? (
            <Button
              size="sm"
              variant="ghost"
              className="shrink-0"
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending}
            >
              <Check className="mr-1.5 size-3.5" aria-hidden="true" /> Mark all
            </Button>
          ) : null}
        </div>

        <ScrollArea className="max-h-80">
          {isLoading ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Loading updates…</p>
          ) : rows.length ? (
            <ul className="divide-y divide-border">
              {rows.slice(0, 12).map((row) => (
                <li
                  key={row.id}
                  className={cn("px-4 py-3 transition-colors", row.is_read ? "" : "bg-primary/5")}
                >
                  <div className="flex items-start gap-2">
                    <BellRing
                      className={cn(
                        "mt-0.5 size-3.5 shrink-0",
                        row.is_read ? "text-muted-foreground" : "text-primary",
                      )}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{row.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{row.message}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-3">
                        <span className="text-[11px] text-muted-foreground">
                          {relativeTime(row.created_at)}
                        </span>
                        {row.complaint_id ? (
                          <Link
                            to="/complaints/$id"
                            params={{ id: row.complaint_id }}
                            className="text-[11px] font-semibold text-primary underline-offset-2 hover:underline"
                          >
                            View report
                          </Link>
                        ) : null}
                        {row.is_read ? null : (
                          <button
                            type="button"
                            onClick={() => markRead.mutate(row.id)}
                            className="text-[11px] font-semibold text-muted-foreground underline-offset-2 hover:underline"
                          >
                            Mark read
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center px-4 py-8 text-center">
              <Inbox className="size-6 text-muted-foreground" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium">No notifications yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Status changes on your reports will appear here instantly.
              </p>
            </div>
          )}
        </ScrollArea>

        <div className="border-t border-border px-4 py-2.5">
          <Button asChild variant="ghost" size="sm" className="w-full justify-center">
            <Link to="/notifications">Open notification centre</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
