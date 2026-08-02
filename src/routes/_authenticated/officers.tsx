import { createFileRoute } from "@tanstack/react-router";
import { Sparkles, Star } from "lucide-react";

import { PageHeader } from "@/components/civic/PageHeader";
import { StatGridSkeleton, TableSkeleton } from "@/components/civic/skeletons";
import { officerLoad } from "@/lib/analytics";
import { formatHours } from "@/lib/civic";
import { useComplaints, useDepartments, useDistricts, useOfficers } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/officers")({
  head: () => ({
    meta: [
      { title: "Officer performance — CivicAI" },
      {
        name: "description",
        content:
          "Field officer workload, closure counts, average resolution time and citizen ratings by department.",
      },
      { property: "og:title", content: "Officer performance — CivicAI" },
      { property: "og:description", content: "Workload and resolution quality per field officer." },
    ],
  }),
  component: OfficersPage,
});

function OfficersPage() {
  const officers = useOfficers();
  const complaints = useComplaints();
  const departments = useDepartments();
  const districts = useDistricts();

  if (officers.isLoading)
    return (
      <div className="space-y-6">
        <StatGridSkeleton count={4} />
        <TableSkeleton rows={6} />
      </div>
    );

  const rows = officerLoad(complaints.data ?? [], officers.data ?? []);
  const maxResolved = Math.max(1, ...rows.map((row) => row.resolved_count));

  return (
    <>
      <PageHeader
        eyebrow="Department workspace"
        title="Officer performance"
        description="Read-only performance view. Assignment stays automated — admins never route tickets by hand."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map((officer) => {
          const department = departments.data?.find((d) => d.id === officer.department_id);
          const district = districts.data?.find((d) => d.id === officer.district_id);
          return (
            <article key={officer.id} className="surface-card p-5">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold">{officer.full_name}</h3>
                  <p className="truncate text-xs text-muted-foreground">
                    {officer.employee_code} · {department?.name ?? "Unassigned"} ·{" "}
                    {district?.name ?? "City-wide"}
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-warning/15 px-2 py-1 text-xs font-semibold text-warning">
                  <Star className="size-3.5" /> {Number(officer.rating).toFixed(1)}
                </span>
              </div>

              <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-muted/60 py-3">
                  <dt className="text-[10px] text-muted-foreground uppercase">Open</dt>
                  <dd className="font-display text-lg font-bold">{officer.openCount}</dd>
                </div>
                <div className="rounded-xl bg-muted/60 py-3">
                  <dt className="text-[10px] text-muted-foreground uppercase">Resolved</dt>
                  <dd className="font-display text-lg font-bold">{officer.resolved_count}</dd>
                </div>
                <div className="rounded-xl bg-muted/60 py-3">
                  <dt className="text-[10px] text-muted-foreground uppercase">Avg time</dt>
                  <dd className="font-display text-lg font-bold">
                    {formatHours(Number(officer.avg_resolution_hours))}
                  </dd>
                </div>
              </dl>

              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(officer.resolved_count / maxResolved) * 100}%` }}
                />
              </div>
            </article>
          );
        })}
      </div>

      <section className="surface-card space-y-2 border-dashed p-6">
        <p className="inline-flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4 text-accent-foreground" /> AI workload balancing (reserved)
        </p>
        <p className="text-xs text-muted-foreground">
          The routing model will weigh skill, district proximity and current load before assigning
          each complaint to an officer.
        </p>
      </section>
    </>
  );
}
