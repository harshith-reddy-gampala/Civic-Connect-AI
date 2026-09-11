import { createFileRoute, redirect } from "@tanstack/react-router";

import { PageHeader } from "@/components/civic/PageHeader";
import { StatCard } from "@/components/civic/StatCard";
import { ChartSkeleton, StatGridSkeleton, TableSkeleton } from "@/components/civic/skeletons";
import { Building2, Layers, ThumbsUp, Timer } from "lucide-react";
import { districtBreakdown, summarize } from "@/lib/analytics";
import { formatHours } from "@/lib/civic";
import { useComplaints, useDistricts } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/analytics")({
  beforeLoad: ({ context }) => {
    if (context.role !== "department_admin") throw redirect({ to: "/dashboard" });
  },
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
  const bestResolutionDistrict = districtRows
    .filter((district) => district.avgResolution > 0)
    .sort((a, b) => a.avgResolution - b.avgResolution)[0];
  const mostCriticalDistrict = districtRows
    .slice()
    .sort((a, b) => b.critical - a.critical)[0];

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

      <section className="surface-card p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-sm font-semibold">District scorecard</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Live comparison across monitored districts using the current complaint dataset.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            {bestResolutionDistrict ? (
              <span className="rounded-full bg-muted px-2 py-1">
                Fastest avg resolution: {bestResolutionDistrict.name}
              </span>
            ) : null}
            {mostCriticalDistrict ? (
              <span className="rounded-full bg-muted px-2 py-1">
                Highest critical load: {mostCriticalDistrict.name}
              </span>
            ) : null}
          </div>
        </div>

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
