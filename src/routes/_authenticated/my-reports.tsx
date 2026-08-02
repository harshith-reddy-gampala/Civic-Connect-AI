import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FileSearch } from "lucide-react";

import { ComplaintCard } from "@/components/civic/ComplaintCard";
import { EmptyState } from "@/components/civic/EmptyState";
import { CardListSkeleton } from "@/components/civic/skeletons";
import { PageHeader } from "@/components/civic/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCurrentProfile } from "@/hooks/useSession";
import { STATUS_FLOW, STATUS_META, type ComplaintStatus } from "@/lib/civic";
import { PAGE_SIZE } from "@/lib/constants";
import { useComplaints } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/my-reports")({
  head: () => ({
    meta: [
      { title: "My reports — CivicAI" },
      {
        name: "description",
        content: "Full history of the infrastructure issues you reported and their current stage.",
      },
      { property: "og:title", content: "My reports — CivicAI" },
      { property: "og:description", content: "Complaint history and live status tracking." },
    ],
  }),
  component: MyReports,
});

function MyReports() {
  const { data: me } = useCurrentProfile();
  const complaints = useComplaints(me?.profile?.id ? { citizenId: me.profile.id } : undefined);
  const [filter, setFilter] = useState<ComplaintStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const rows = useMemo(() => {
    return (complaints.data ?? []).filter((complaint) => {
      const matchesStatus = filter === "all" || complaint.status === filter;
      const term = search.trim().toLowerCase();
      const matchesSearch =
        !term ||
        complaint.title.toLowerCase().includes(term) ||
        complaint.reference.toLowerCase().includes(term) ||
        complaint.address.toLowerCase().includes(term);
      return matchesStatus && matchesSearch;
    });
  }, [complaints.data, filter, search]);

  // Client-side pagination keeps long histories fast to scan and render.
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const visible = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <>
      <PageHeader
        eyebrow="Citizen workspace"
        title="My reports"
        description="Every report you filed, with its verified stage and supporter count."
      />

      <div className="grid gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant={filter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setFilter("all");
              setPage(1);
            }}
          >
            All
          </Button>
          {STATUS_FLOW.map((status) => (
            <Button
              key={status}
              variant={filter === status ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setFilter(status);
                setPage(1);
              }}
            >
              {STATUS_META[status].label}
            </Button>
          ))}
        </div>
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value.slice(0, 80));
            setPage(1);
          }}
          aria-label="Search your reports"
          placeholder="Search title, reference or street"
          className="sm:max-w-xs"
        />
      </div>

      {complaints.isLoading ? (
        <CardListSkeleton count={4} />
      ) : visible.length ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {visible.map((complaint) => (
              <ComplaintCard key={complaint.id} complaint={complaint} />
            ))}
          </div>
          {pageCount > 1 ? (
            <nav
              className="flex flex-wrap items-center justify-between gap-3"
              aria-label="Report pagination"
            >
              <p className="text-xs text-muted-foreground">
                Showing {(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, rows.length)} of{" "}
                {rows.length}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(current - 1)}
                  disabled={current === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(current + 1)}
                  disabled={current === pageCount}
                >
                  Next
                </Button>
              </div>
            </nav>
          ) : null}
        </>
      ) : (
        <EmptyState
          icon={FileSearch}
          title="No reports match this filter"
          description="Try a different stage or clear the search box to see your full history."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setFilter("all");
                setSearch("");
                setPage(1);
              }}
            >
              Reset filters
            </Button>
          }
        />
      )}
    </>
  );
}
