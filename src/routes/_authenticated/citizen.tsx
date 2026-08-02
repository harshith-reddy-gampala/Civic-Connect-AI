import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, CheckCircle2, ClipboardList, Clock, PlusCircle, ThumbsUp } from "lucide-react";

import { ActivityFeed } from "@/components/civic/ActivityFeed";
import { ComplaintCard } from "@/components/civic/ComplaintCard";
import { EmptyState } from "@/components/civic/EmptyState";
import { CardListSkeleton, MapSkeleton, StatGridSkeleton } from "@/components/civic/skeletons";
import { MapPanel } from "@/components/civic/MapPanel";
import { PageHeader } from "@/components/civic/PageHeader";
import { StatCard } from "@/components/civic/StatCard";
import { Button } from "@/components/ui/button";
import { useCurrentProfile } from "@/hooks/useSession";
import { summarize, volumeDelta } from "@/lib/analytics";
import { useComplaints, useNotifications } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/citizen")({
  head: () => ({
    meta: [
      { title: "Citizen dashboard — CivicAI" },
      {
        name: "description",
        content: "Track your reported infrastructure issues, notifications and nearby open issues.",
      },
      { property: "og:title", content: "Citizen dashboard — CivicAI" },
      { property: "og:description", content: "Your reports, progress and neighbourhood issue map." },
    ],
  }),
  component: CitizenDashboard,
});

function CitizenDashboard() {
  const { data: me } = useCurrentProfile();
  const userId = me?.profile?.id;
  const mine = useComplaints(userId ? { citizenId: userId } : undefined);
  const all = useComplaints();
  const notifications = useNotifications(userId);

  const summary = summarize(mine.data ?? []);
  const unread = (notifications.data ?? []).filter((n) => !n.is_read);
  const nearby = (all.data ?? []).filter((c) => c.lat && c.lng && c.status !== "completed").slice(0, 12);
  const center = nearby[0]?.lat ? { lat: nearby[0].lat!, lng: nearby[0].lng! } : { lat: 18.5204, lng: 73.8567 };

  return (
    <>
      <PageHeader
        eyebrow="Citizen workspace"
        title={`Welcome${me?.profile?.full_name ? `, ${me.profile.full_name.split(" ")[0]}` : ""}`}
        description="Report a new issue, follow the five-stage resolution trail and back reports already filed near you."
        actions={
          <Button asChild>
            <Link to="/report">
              <PlusCircle className="mr-2 size-4" /> Report an issue
            </Link>
          </Button>
        }
      />

      {mine.isLoading ? (
        <StatGridSkeleton />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total submitted"
            value={summary.total}
            icon={ClipboardList}
            index={0}
            delta={volumeDelta(mine.data ?? [])}
            deltaLabel="vs last month"
          />
          <StatCard
            label="Pending"
            value={summary.pending}
            icon={Clock}
            tone="warning"
            hint="Awaiting resolution"
            index={1}
          />
          <StatCard
            label="Resolved"
            value={summary.completed}
            icon={CheckCircle2}
            tone="success"
            index={2}
            hint={summary.total ? `${Math.round((summary.completed / summary.total) * 100)}% closure rate` : undefined}
          />
          <StatCard
            label="Notifications"
            value={unread.length}
            icon={Bell}
            tone="accent"
            hint={unread.length ? "Unread updates" : "All caught up"}
            index={3}
          />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Your recent reports</h2>
            <Button asChild variant="ghost" size="sm">
              <Link to="/my-reports">View all</Link>
            </Button>
          </div>
          {mine.isLoading ? (
            <CardListSkeleton count={2} />
          ) : (mine.data ?? []).length ? (
            <div className="space-y-4">
              {(mine.data ?? []).slice(0, 3).map((complaint) => (
                <ComplaintCard key={complaint.id} complaint={complaint} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={ClipboardList}
              title="No reports yet"
              description="Spotted a pothole, water leak or dead streetlight? File it in under a minute — AI classifies and routes it for you."
              action={
                <Button asChild>
                  <Link to="/report">Report your first issue</Link>
                </Button>
              }
            />
          )}

          <div className="space-y-4 pt-2">
            <h2 className="text-lg font-semibold">City activity</h2>
            <ActivityFeed limit={6} />
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Nearby open issues</h2>
            <Button asChild variant="ghost" size="sm">
              <Link to="/nearby">
                <ThumbsUp className="mr-1.5 size-3.5" /> Support instead
              </Link>
            </Button>
          </div>
          {all.isLoading ? (
            <MapSkeleton />
          ) : (
          <MapPanel
            center={center}
            zoom={12}
            markers={nearby.map((c) => ({
              id: c.id,
              lat: c.lat!,
              lng: c.lng!,
              label: c.title,
              priority: c.priority,
              meta: c.address,
            }))}
          />
          )}
          <div className="surface-card divide-y divide-border p-0">
            {nearby.length ? nearby.slice(0, 4).map((complaint) => (
              <Link
                key={complaint.id}
                to="/complaints/$id"
                params={{ id: complaint.id }}
                className="block px-4 py-3 transition-colors hover:bg-muted/60"
              >
                <p className="truncate text-sm font-medium">{complaint.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {complaint.address} · {complaint.support_count} supporters
                </p>
              </Link>
            )) : (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                No open issues mapped nearby right now.
              </p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
