import { createFileRoute } from "@tanstack/react-router";

import { CategoryChart, ChartFrame, StatusPie, TrendChart } from "@/components/civic/LazyCharts";
import { PageHeader } from "@/components/civic/PageHeader";
import { StatCard } from "@/components/civic/StatCard";
import { ChartSkeleton, StatGridSkeleton, TableSkeleton } from "@/components/civic/skeletons";
import { Building2, Layers, ThumbsUp, Timer } from "lucide-react";
import {
  categoryBreakdown,
  districtBreakdown,
  monthlyTrend,
  statusBreakdown,
  summarize,
} from "@/lib/analytics";
import { formatHours } from "@/lib/civic";
import { useComplaints, useDistricts } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "District analytics — CivicAI" },
      {
        name: "description",
        content:
          "District-level infrastructure analytics: volume, backlog, critical load and average resolution time.",
      },
      { property: "og:title", content: "District analytics — CivicAI" },
      { property: "og:description", content: "Compare districts on backlog and resolution speed." },
    ],
  }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const complaints = useComplaints();
  const districts = useDistricts();

  const rows = complaints.data ?? [];
  const summary = summarize(rows);
  const districtRows = districtBreakdown(rows, districts.data ?? []);

  if (complaints.isLoading)
    return (
      <div className="space-y-6">
        <StatGridSkeleton count={4} />
        <div className="grid gap-6 xl:grid-cols-2">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
        <TableSkeleton rows={6} />
      </div>
    );

  return (
    <>
      <PageHeader
        eyebrow="Department workspace"
        title="District analytics"
        description="Where issues concentrate, how fast each district clears them, and what citizens care about most."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Districts monitored" value={districtRows.length} icon={Building2} />
        <StatCard label="Total reports" value={summary.total} icon={Layers} />
        <StatCard
          label="Avg resolution"
          value={formatHours(summary.avgResolution)}
          icon={Timer}
          tone="accent"
        />
        <StatCard label="Citizen supports" value={summary.supporters} icon={ThumbsUp} tone="success" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <ChartFrame title="Reporting trend" subtitle="Monthly reports vs resolutions">
          <TrendChart data={monthlyTrend(rows)} />
        </ChartFrame>
        <ChartFrame title="Stage mix" subtitle="Backlog distribution across stages">
          <StatusPie data={statusBreakdown(rows)} />
        </ChartFrame>
      </div>

      <ChartFrame title="Category volume" subtitle="Which infrastructure fails most often">
        <CategoryChart data={categoryBreakdown(rows)} />
      </ChartFrame>

      <section className="surface-card p-5">
        <h3 className="text-sm font-semibold">District scorecard</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground uppercase">
                <th className="pb-2 font-medium">District</th>
                <th className="pb-2 font-medium">Total</th>
                <th className="pb-2 font-medium">Pending</th>
                <th className="pb-2 font-medium">Critical</th>
                <th className="pb-2 font-medium">Completed</th>
                <th className="pb-2 font-medium">Avg time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {districtRows.map((district) => (
                <tr key={district.id}>
                  <td className="py-2.5 font-medium">{district.name}</td>
                  <td className="py-2.5">{district.total}</td>
                  <td className="py-2.5 text-warning">{district.pending}</td>
                  <td className="py-2.5 text-critical">{district.critical}</td>
                  <td className="py-2.5 text-success">{district.completed}</td>
                  <td className="py-2.5 text-muted-foreground">
                    {formatHours(district.avgResolution)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
