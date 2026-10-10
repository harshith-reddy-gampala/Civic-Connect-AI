import { useMemo, useState } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  CheckCircle2,
  ClipboardList,
  Loader2,
  ShieldCheck,
  Timer,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { PriorityBadge, StatusBadge } from "@/components/civic/badges";
import { AiErrorState, AiSection, AiThinking, ConfidenceMeter } from "@/components/civic/ai";
import { PageHeader } from "@/components/civic/PageHeader";
import { StatCard } from "@/components/civic/StatCard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CardListSkeleton, StatGridSkeleton } from "@/components/civic/skeletons";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentProfile } from "@/hooks/useSession";
import { LIMITS } from "@/lib/constants";
import { fileToDataUrl, useAiRepairVerification } from "@/hooks/useAiModules";
import { STATUS_META, nextStatuses, relativeTime, type ComplaintStatus } from "@/lib/civic";
import {
  useComplaints,
  useOfficers,
  useUpdateComplaintStatus,
} from "@/lib/queries";


export const Route = createFileRoute("/_authenticated/officer")({
  beforeLoad: ({ context }) => {
    if (context.role !== "field_officer") throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Field officer queue — CivicAI" },
      {
        name: "description",
        content:
          "Assigned repair queue with location map, stage updates and photo proof of completed work.",
      },
      { property: "og:title", content: "Field officer queue — CivicAI" },
      { property: "og:description", content: "Update assigned issues and upload repair proof." },
    ],
  }),
  component: OfficerQueue,
});

function OfficerQueue() {
  const { data: me } = useCurrentProfile();
  const officers = useOfficers();
  const officer = useMemo(
    () => (officers.data ?? []).find((row) => row.profile_id === me?.profile?.id),
    [officers.data, me?.profile?.id],
  );
  const complaints = useComplaints(officer?.id ? { officerId: officer.id } : undefined);
  const update = useUpdateComplaintStatus({
    id: me?.profile?.id,
    name: officer?.full_name ?? me?.profile?.full_name ?? "Field officer",
  });

  const verification = useAiRepairVerification();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [status, setStatus] = useState<ComplaintStatus | "">("");
  const [remarks, setRemarks] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [proofData, setProofData] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function runVerification(complaintId: string) {
    if (!proofData) {
      toast.error("Attach the after-repair photo first");
      return;
    }
    await verification.mutateAsync({
      complaintId,
      afterImageUrl: proofData,
      remarks: remarks.trim(),
    });
  }


  const rows = complaints.data ?? [];
  const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 } as const;
  const open = [...rows]
    .filter((row) => row.status !== "completed")
    .sort((a, b) => {
      const severityDelta =
        (severityOrder[b.priority ?? "low"] ?? 0) - (severityOrder[a.priority ?? "low"] ?? 0);
      if (severityDelta !== 0) return severityDelta;

      const aiDelta = Number(b.ai_priority_score ?? 0) - Number(a.ai_priority_score ?? 0);
      if (aiDelta !== 0) return aiDelta;

      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  const done = rows.filter((row) => row.status === "completed");
  const active = rows.find((row) => row.id === activeId) ?? null;
  const options = active ? nextStatuses(active.status) : [];
  const completionVerificationReady =
    status !== "completed" ||
    (!!proofData && verification.data?.verdict === "repair_completed" && !verification.isPending);

  async function submit() {
    if (!active || !status) {
      toast.error("Pick the next stage first");
      return;
    }
    setUploading(true);
    try {
      if (status === "completed") {
        if (!proofData) {
          throw new Error("Attach an after-repair photo and run AI repair verification before completing this issue.");
        }
        if (verification.isPending) {
          throw new Error("Repair verification is still running. Wait for it to finish before saving.");
        }
        if (verification.isError || verification.data?.verdict !== "repair_completed") {
          throw new Error("Repair must be reinspected before it can be marked completed.");
        }
      }

      let aiNote = "";
      if (status === "completed" && verification.data) {
        aiNote = ` [AI verification: repair completed · ${Math.round(verification.data.confidence * 100)}% confidence]`;
      }

      if (status === "completed" && !proofData) {
        throw new Error("The after-repair photo could not be uploaded.");
      }
      const finalRemarks = `${remarks.trim()}${aiNote}`.trim().slice(0, 500);
      await update.mutateAsync({
        complaintId: active.id,
        status,
        remarks: finalRemarks || undefined,
        afterImageDataUrl: proofData,
        citizenId: active.citizen_id,
      });
      setActiveId(null);
      setStatus("");
      setRemarks("");
      setProof(null);
      setProofData(null);
      verification.reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed");
    } finally {
      setUploading(false);
    }

  }

  if (officers.isLoading || complaints.isLoading) {
    return (
      <div className="space-y-6">
        <StatGridSkeleton count={3} />
        <CardListSkeleton count={3} />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Field workspace"
        title={officer ? `Queue for ${officer.full_name}` : "Assigned queue"}
        description="Work through auto-assigned repairs, log each stage and attach photo proof at completion."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Open assignments" value={open.length} icon={ClipboardList} tone="warning" />
        <StatCard label="Completed" value={officer?.resolved_count ?? done.length} icon={CheckCircle2} tone="success" />
        <StatCard
          label="Avg turnaround"
          value={`${Math.round(Number(officer?.avg_resolution_hours ?? 0))}h`}
          icon={Timer}
          tone="accent"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Assigned issues</h2>
          {open.length ? (
            open.map((complaint) => (
              <article key={complaint.id} className="surface-card p-5">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {complaint.reference}
                      </span>
                      <PriorityBadge priority={complaint.priority} />
                    </div>
                    <h3 className="mt-1.5 truncate text-base font-semibold">{complaint.title}</h3>
                    <p className="truncate text-xs text-muted-foreground">
                      {complaint.address} · {relativeTime(complaint.created_at)}
                    </p>
                  </div>
                  <StatusBadge status={complaint.status} />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={activeId === complaint.id ? "secondary" : "default"}
                    onClick={() => {
                      setActiveId(complaint.id);
                      setStatus("");
                      setRemarks("");
                      setProof(null);
                      setProofData(null);
                      verification.reset();
                    }}

                  >
                    Update status
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/complaints/$id" params={{ id: complaint.id }}>
                      Open detail
                    </Link>
                  </Button>
                </div>

                {activeId === complaint.id ? (
                  <div className="mt-5 space-y-4 rounded-xl border border-border bg-muted/40 p-4">
                    <div className="space-y-2">
                      <Label>Next stage</Label>
                      <Select
                        value={status}
                        onValueChange={(value) => {
                          const nextStatus = value as ComplaintStatus;
                          setStatus(nextStatus);

                          if (nextStatus !== "completed") {
                            setRemarks("");
                            setProof(null);
                            setProofData(null);
                            verification.reset();
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select stage" />
                        </SelectTrigger>
                        <SelectContent>
                          {options.map((option) => (
                            <SelectItem key={option} value={option}>
                              {STATUS_META[option].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {status === "completed" ? (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor={`remarks-${complaint.id}`}>Field remarks</Label>
                          <Textarea
                            id={`remarks-${complaint.id}`}
                            rows={3}
                            value={remarks}
                            maxLength={LIMITS.remarksMax}
                            onChange={(event) => setRemarks(event.target.value)}
                            placeholder="What was done on site?"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`proof-${complaint.id}`}>Repair proof photo</Label>
                          <label
                            htmlFor={`proof-${complaint.id}`}
                            className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground"
                          >
                            <Upload className="size-4" />
                            {proof ? proof.name : "Attach after-repair photo"}
                          </label>
                          <input
                            id={`proof-${complaint.id}`}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={async (event) => {
                              const selected = event.target.files?.[0] ?? null;
                              setProof(selected);
                              setProofData(null);
                              verification.reset();
                              if (selected) {
                                try {
                                  setProofData(await fileToDataUrl(selected));
                                } catch {
                                  toast.error("Could not prepare that photo for AI verification");
                                }
                              }
                            }}
                          />
                        </div>

                        <AiSection
                          title="AI repair verification"
                          hint="Compares the citizen's original photo with your proof photo."
                          action={
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => runVerification(complaint.id)}
                              disabled={verification.isPending || !proofData}
                            >
                              <ShieldCheck className="mr-2 size-3.5" /> Verify
                            </Button>
                          }
                        >
                          {verification.isPending ? (
                            <AiThinking label="Comparing before and after photos…" />
                          ) : null}

                          {verification.isError && !verification.isPending ? (
                            <AiErrorState
                              message={
                                verification.error instanceof Error
                                  ? verification.error.message
                                  : "Verification failed."
                              }
                              onRetry={() => runVerification(complaint.id)}
                              pending={verification.isPending}
                            />
                          ) : null}

                          {verification.data && !verification.isPending ? (
                            <div className="space-y-3">
                              <p
                                className={
                                  verification.data.verdict === "repair_completed"
                                    ? "inline-flex items-center gap-2 text-sm font-semibold text-success"
                                    : "inline-flex items-center gap-2 text-sm font-semibold text-warning"
                                }
                              >
                                <ShieldCheck className="size-4" />
                                {verification.data.verdict === "repair_completed"
                                  ? "Repair completed"
                                  : "Needs reinspection"}
                              </p>
                              <ConfidenceMeter value={verification.data.confidence} />
                              <p className="text-xs text-muted-foreground">{verification.data.notes}</p>
                              {verification.data.observations.length ? (
                                <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
                                  {verification.data.observations.map((item) => (
                                    <li key={item}>{item}</li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                          ) : null}

                          {!verification.data && !verification.isPending && !verification.isError ? (
                            <p className="text-xs text-muted-foreground">
                              Attach the after-repair photo and run AI repair verification before completing the issue.
                            </p>
                          ) : null}
                          {status === "completed" && !verification.isPending ? (
                            <p className="text-xs font-medium text-warning">
                              {verification.data?.verdict === "repair_completed"
                                ? "Repair verification passed. You can save this issue as completed."
                                : "Repair must be reinspected before this issue can be marked completed."}
                            </p>
                          ) : null}
                        </AiSection>
                      </>
                    ) : null}

                    <Button
                      onClick={submit}
                      disabled={uploading || update.isPending || !completionVerificationReady}
                    >
                      {uploading || update.isPending ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : null}
                      Save update
                    </Button>
                  </div>
                ) : null}
              </article>
            ))
          ) : (
            <div className="surface-card p-10 text-center text-sm text-muted-foreground">
              Nothing assigned right now. New work appears here automatically.
            </div>
          )}
        </section>

        <div className="space-y-6">
          <section className="surface-card p-5">
            <h3 className="text-sm font-semibold">Recently completed</h3>
            <ul className="mt-3 divide-y divide-border">
              {done.slice(0, 6).map((row) => (
                <li key={row.id} className="py-2.5">
                  <p className="truncate text-sm font-medium">{row.title}</p>
                  <p className="text-xs text-muted-foreground">
                    Closed {relativeTime(row.resolved_at ?? row.created_at)}
                  </p>
                </li>
              ))}
              {done.length === 0 ? (
                <li className="py-2.5 text-sm text-muted-foreground">No closures logged yet.</li>
              ) : null}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
