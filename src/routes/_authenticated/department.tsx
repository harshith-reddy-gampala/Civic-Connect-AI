import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Clock, Layers, RefreshCw, Timer } from "lucide-react";

import { CategoryChart, ChartFrame, StatusPie, TrendChart } from "@/components/civic/LazyCharts";
import { ActivityFeed } from "@/components/civic/ActivityFeed";
import { EmptyState } from "@/components/civic/EmptyState";
import {
  ChartSkeleton,
  StatGridSkeleton,
  TableSkeleton,
} from "@/components/civic/skeletons";
import { MapPanel } from "@/components/civic/MapPanel";
import { PageHeader } from "@/components/civic/PageHeader";
import { StatCard } from "@/components/civic/StatCard";
import { StatusBadge, PriorityBadge } from "@/components/civic/badges";
import { AiErrorState, AiSection, AiThinking } from "@/components/civic/ai";
import { Button } from "@/components/ui/button";
import { useAiInsights } from "@/hooks/useAiModules";
import {
  categoryBreakdown,
  departmentBreakdown,
  districtBreakdown,
  monthlyTrend,
  statusBreakdown,
  summarize,
  topCategory,
  resolvedDelta,
  volumeDelta,
} from "@/lib/analytics";
import { categoryLabel, formatHours, relativeTime } from "@/lib/civic";
import { useComplaints, useDepartments, useDistricts } from "@/lib/queries";


export const Route = createFileRoute("/_authenticated/department")({
  head: () => ({
    meta: [
      { title: "Department command centre — CivicAI" },
      {
        name: "description",
        content:
          "City-wide complaint volume, critical load, resolution time, trends and district heat signals.",
      },
      { property: "og:title", content: "Department command centre — CivicAI" },
      { property: "og:description", content: "Live infrastructure intelligence for the whole city." },
    ],
  }),
  component: DepartmentDashboard,
});

function DepartmentDashboard() {
  const complaints = useComplaints();
  const districts = useDistricts();
  const departments = useDepartments();
  const insights = useAiInsights(6);


  const rows = complaints.data ?? [];
  const summary = summarize(rows);
  const districtRows = districtBreakdown(rows, districts.data ?? []);
  const departmentRows = departmentBreakdown(rows, departments.data ?? []);
  const maxDistrict = Math.max(1, ...districtRows.map((d) => d.total));
  const mapped = rows.filter((c) => c.lat && c.lng);
  const critical = rows
    .filter((c) => c.priority === "critical" && c.status !== "completed")
    .slice(0, 5);

  if (complaints.isLoading) {
    return (
      <div className="space-y-6">
        <StatGridSkeleton count={5} />
        <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
        <TableSkeleton rows={6} />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Department workspace"
        title="City command centre"
        description="Monitoring every district, department and open issue. Assignment is automated — no manual routing required."
        actions={
          <Button asChild variant="outline">
            <Link to="/officers">Officer performance</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Total complaints"
          value={summary.total}
          icon={Layers}
          index={0}
          delta={volumeDelta(rows)}
          deltaLabel="vs last month"
        />
        <StatCard label="Pending" value={summary.pending} icon={Clock} tone="warning" index={1} />
        <StatCard
          label="Completed"
          value={summary.completed}
          icon={CheckCircle2}
          tone="success"
          index={2}
          delta={resolvedDelta(rows)}
          deltaLabel="vs last month"
        />
        <StatCard
          label="Critical open"
          value={summary.critical}
          icon={AlertTriangle}
          tone="critical"
          index={3}
        />
        <StatCard
          label="Avg resolution"
          value={formatHours(summary.avgResolution)}
          icon={Timer}
          tone="accent"
          hint={`Top driver: ${topCategory(rows)}`}
          index={4}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <ChartFrame title="Complaint trends" subtitle="Reports vs resolved, last 6 months">
          <TrendChart data={monthlyTrend(rows)} />
        </ChartFrame>
        <ChartFrame title="Stage distribution" subtitle="Where the backlog sits right now">
          <StatusPie data={statusBreakdown(rows)} />
        </ChartFrame>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <ChartFrame title="Category load" subtitle="Volume by issue type">
          <CategoryChart data={categoryBreakdown(rows)} />
        </ChartFrame>

        <section className="surface-card p-5">
          <h3 className="text-sm font-semibold">District heat map</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Intensity scaled to total reports; critical counts shown on the right.
          </p>
          <ul className="mt-4 space-y-3">
            {!districtRows.length ? (
              <li className="py-3 text-sm text-muted-foreground">No district data yet.</li>
            ) : null}
            {districtRows.map((district) => (
              <li key={district.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{district.name}</p>
                    <p className="shrink-0 text-xs text-muted-foreground">{district.total} reports</p>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="animate-grow-x h-full rounded-full bg-gradient-to-r from-warning/70 to-critical"
                      style={{ width: `${(district.total / maxDistrict) * 100}%` }}
                    />
                  </div>
                </div>
                <span className="shrink-0 rounded-md bg-critical/10 px-2 py-1 text-xs font-semibold text-critical">
                  {district.critical} critical
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <section className="surface-card p-5">
          <h3 className="text-sm font-semibold">Department analytics</h3>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground uppercase">
                  <th className="pb-2 font-medium">Department</th>
                  <th className="pb-2 font-medium">Total</th>
                  <th className="pb-2 font-medium">Pending</th>
                  <th className="pb-2 font-medium">Completed</th>
                  <th className="pb-2 font-medium">Avg time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {departmentRows.map((department) => (
                  <tr key={department.id}>
                    <td className="py-2.5 font-medium">{department.name}</td>
                    <td className="py-2.5">{department.total}</td>
                    <td className="py-2.5 text-warning">{department.pending}</td>
                    <td className="py-2.5 text-success">{department.completed}</td>
                    <td className="py-2.5 text-muted-foreground">
                      {formatHours(department.avgResolution)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="surface-card p-5">
          <h3 className="text-sm font-semibold">Critical queue</h3>
          <ul className="mt-4 divide-y divide-border">
            {critical.length ? (
              critical.map((complaint) => (
                <li key={complaint.id} className="py-3">
                  <Link to="/complaints/$id" params={{ id: complaint.id }} className="block">
                    <div className="flex flex-wrap items-center gap-2">
                      <PriorityBadge priority={complaint.priority} />
                      <StatusBadge status={complaint.status} />
                    </div>
                    <p className="mt-1.5 truncate text-sm font-medium">{complaint.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {complaint.address} · {relativeTime(complaint.created_at)}
                    </p>
                  </Link>
                </li>
              ))
            ) : (
              <li className="py-3">
                <EmptyState
                  icon={CheckCircle2}
                  title="No critical issues open"
                  description="Every critical report has been resolved. New critical items appear here instantly."
                  className="border-0 bg-transparent shadow-none"
                />
              </li>
            )}
          </ul>
        </section>
      </div>

      <section className="space-y-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <h2 className="min-w-0 truncate text-lg font-semibold">Recent activity</h2>
          <Button asChild variant="ghost" size="sm" className="shrink-0">
            <Link to="/analytics">Open analytics</Link>
          </Button>
        </div>
        <ActivityFeed limit={8} />
      </section>

      <AiSection
        title="Preventive maintenance recommendations"
        hint="Grounded in recurring complaint patterns from the last 6 months — no speculative forecasts."
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() => insights.refetch()}
            disabled={insights.isFetching}
          >
            <RefreshCw className="mr-2 size-3.5" /> Refresh
          </Button>
        }
      >
        {insights.isFetching && !insights.data ? (
          <AiThinking label="Reviewing historical complaint trends…" />
        ) : null}

        {insights.isError && !insights.isFetching ? (
          <AiErrorState
            message={
              insights.error instanceof Error
                ? insights.error.message
                : "Could not generate recommendations."
            }
            onRetry={() => insights.refetch()}
            pending={insights.isFetching}
          />
        ) : null}

        {insights.data ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{insights.data.summary}</p>
            {insights.data.recommendations.length ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {insights.data.recommendations.map((item) => (
                  <article
                    key={`${item.title}-${item.area}`}
                    className="space-y-2 rounded-xl border border-border bg-muted/30 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <PriorityBadge priority={item.urgency} />
                      <span className="text-xs text-muted-foreground">
                        {categoryLabel(item.category)}
                      </span>
                    </div>
                    <h4 className="text-sm font-semibold">{item.title}</h4>
                    <p className="text-xs font-medium text-muted-foreground">{item.area}</p>
                    <p className="text-xs text-muted-foreground">{item.rationale}</p>
                    <p className="text-xs font-medium">
                      Recommended action: <span className="font-normal">{item.action}</span>
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Based on {insights.data.basedOn} reports — not enough recurring signal yet.
              </p>
            )}
          </div>
        ) : null}
      </AiSection>



      <section className="space-y-3">
        <h3 className="text-lg font-semibold">City issue map</h3>
        <MapPanel
          center={{ lat: 18.5204, lng: 73.8567 }}
          zoom={12}
          height="h-[420px]"
          markers={mapped.map((complaint) => ({
            id: complaint.id,
            lat: complaint.lat!,
            lng: complaint.lng!,
            label: complaint.title,
            priority: complaint.priority,
            meta: complaint.address,
          }))}
        />
      </section>
    </>
  );
}
