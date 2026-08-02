import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Loader2,
  MapPin,
  Phone,
  RefreshCw,
  Sparkles,
  ThumbsUp,
  User,
} from "lucide-react";

import { PriorityBadge, StatusBadge } from "@/components/civic/badges";
import { AiErrorState, AiSection, AiThinking } from "@/components/civic/ai";
import { MapPanel } from "@/components/civic/MapPanel";
import { Timeline } from "@/components/civic/Timeline";
import { Button } from "@/components/ui/button";
import { DetailSkeleton } from "@/components/civic/skeletons";
import { useCurrentProfile } from "@/hooks/useSession";
import { useAiPriority, useAiTriage } from "@/hooks/useAiModules";
import { categoryLabel, statusProgress, PRIORITY_META } from "@/lib/civic";
import { useComplaint, useMySupports, useSupportComplaint } from "@/lib/queries";
import { getReporterContact } from "@/lib/reporter.functions";


export const Route = createFileRoute("/_authenticated/complaints/$id")({
  head: () => ({
    meta: [
      { title: "Complaint detail — CivicAI" },
      {
        name: "description",
        content: "Full status trail, photo evidence and location for a reported infrastructure issue.",
      },
      { property: "og:title", content: "Complaint detail — CivicAI" },
      { property: "og:description", content: "Verified timeline and field proof for this report." },
    ],
  }),
  component: ComplaintDetail,
});

function ComplaintDetail() {
  const { id } = Route.useParams();
  const { data, isLoading } = useComplaint(id);
  const { data: me } = useCurrentProfile();
  const supports = useMySupports(me?.profile?.id ?? undefined);
  const support = useSupportComplaint(me?.profile?.id ?? undefined);
  const triage = useAiTriage();
  const priority = useAiPriority();
  const fetchContact = useServerFn(getReporterContact);
  const contact = useQuery({
    queryKey: ["reporter-contact", id],
    queryFn: () => fetchContact({ data: { complaintId: id } }),
  });


  if (isLoading) {
    return <DetailSkeleton />;
  }
  if (!data?.complaint) {
    return (
      <div className="surface-card p-10 text-center">
        <p className="font-semibold">Complaint not found</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    );
  }

  const complaint = data.complaint;
  const before = data.images.filter((image) => image.kind === "before");
  const after = data.images.filter((image) => image.kind === "after");
  const supported = (supports.data ?? []).includes(complaint.id);

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="w-fit px-2">
        <Link to="/dashboard">
          <ArrowLeft className="mr-1.5 size-4" /> Back
        </Link>
      </Button>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <section className="surface-card p-6">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{complaint.reference}</span>
                  <PriorityBadge priority={complaint.priority} />
                </div>
                <h1 className="mt-2 text-xl font-bold sm:text-2xl">{complaint.title}</h1>
              </div>
              <StatusBadge status={complaint.status} />
            </div>

            <p className="mt-4 text-sm text-muted-foreground">{complaint.description}</p>

            <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${statusProgress(complaint.status)}%` }}
              />
            </div>

            <dl className="mt-6 grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground uppercase">Category</dt>
                <dd className="mt-1 text-sm font-medium">{categoryLabel(complaint.category)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase">Reported</dt>
                <dd className="mt-1 text-sm font-medium">
                  {new Date(complaint.created_at).toLocaleDateString()}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase">Supporters</dt>
                <dd className="mt-1 text-sm font-medium">{complaint.support_count}</dd>
              </div>
            </dl>

            {complaint.citizen_id !== me?.profile?.id ? (
              <Button
                className="mt-6"
                variant={supported ? "secondary" : "default"}
                disabled={supported}
                onClick={() => support.mutate(complaint.id)}
              >
                <ThumbsUp className="mr-2 size-4" />
                {supported ? "You supported this" : "Support this report"}
              </Button>
            ) : null}
          </section>

          {before.length || after.length ? (
            <section className="surface-card p-6">
              <h2 className="text-sm font-semibold">Evidence</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {[...before, ...after].map((image) => (
                  <figure key={image.id} className="overflow-hidden rounded-xl border border-border">
                    <img
                      src={image.image_url}
                      alt={`${image.kind} repair evidence`}
                      loading="lazy"
                      className="h-44 w-full object-cover"
                    />
                    <figcaption className="bg-muted px-3 py-2 text-xs text-muted-foreground uppercase">
                      {image.kind}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          ) : null}

          <section className="surface-card p-6">
            <h2 className="text-sm font-semibold">Status history</h2>
            <div className="mt-5">
              <Timeline history={data.history} />
            </div>
          </section>
        </div>

        <div className="space-y-6">
          {complaint.lat && complaint.lng ? (
            <MapPanel
              center={{ lat: complaint.lat, lng: complaint.lng }}
              zoom={15}
              height="h-[280px]"
              markers={[
                {
                  id: complaint.id,
                  lat: complaint.lat,
                  lng: complaint.lng,
                  label: complaint.title,
                  priority: complaint.priority,
                  meta: complaint.address,
                },
              ]}
            />
          ) : null}

          <section className="surface-card space-y-3 p-6">
            <h2 className="text-sm font-semibold">Reporter</h2>
            <p className="inline-flex items-center gap-2 text-sm">
              <User className="size-4 text-muted-foreground" />{" "}
              {contact.data?.allowed ? (contact.data.name ?? "Citizen") : "Protected"}
            </p>
            {contact.data?.allowed && contact.data.phone ? (
              <p className="inline-flex items-center gap-2 text-sm">
                <Phone className="size-4 text-muted-foreground" /> {contact.data.phone}
              </p>
            ) : null}
            <p className="inline-flex items-start gap-2 text-sm">
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span>{complaint.address || "Location not specified"}</span>
            </p>
          </section>

          <AiSection
            title="AI assessment"
            hint="Classification, priority score and automatic routing produced at intake."
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() => triage.mutate(complaint.id)}
                disabled={triage.isPending}
              >
                <RefreshCw className="mr-2 size-3.5" /> Re-run
              </Button>
            }
          >
            {triage.isPending ? <AiThinking label="Re-running AI triage…" /> : null}

            {triage.isError && !triage.isPending ? (
              <AiErrorState
                message={triage.error instanceof Error ? triage.error.message : "AI triage failed."}
                onRetry={() => triage.mutate(complaint.id)}
                pending={triage.isPending}
              />
            ) : null}

            {complaint.ai_priority_score != null ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="rounded-lg bg-primary/10 px-3 py-2 text-lg font-bold text-primary">
                    {Math.round(Number(complaint.ai_priority_score))}
                  </span>
                  <div>
                    <p className="text-sm font-semibold">
                      {PRIORITY_META[complaint.priority].label} priority
                    </p>
                    <p className="text-xs text-muted-foreground">AI priority score out of 100</p>
                  </div>
                </div>
                {complaint.ai_category_suggestion ? (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Detected asset</p>
                    <p className="mt-0.5 text-sm font-medium">{complaint.ai_category_suggestion}</p>
                  </div>
                ) : null}
                {complaint.ai_assignment_reason ? (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Routing decision</p>
                    <p className="mt-0.5 text-sm">{complaint.ai_assignment_reason}</p>
                  </div>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  className="px-2"
                  onClick={() => priority.mutate(complaint.id)}
                  disabled={priority.isPending}
                >
                  {priority.isPending ? (
                    <Loader2 className="mr-2 size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 size-3.5" />
                  )}
                  Recalculate priority
                </Button>
              </div>
            ) : !triage.isPending && !triage.isError ? (
              <p className="text-xs text-muted-foreground">
                No AI assessment stored yet for this report. Run the triage to classify it, score its
                priority and assign a field officer.
              </p>
            ) : null}
          </AiSection>

        </div>
      </div>
    </>
  );
}
