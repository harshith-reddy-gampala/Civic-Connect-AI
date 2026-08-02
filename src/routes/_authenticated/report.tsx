import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { Crosshair, ImagePlus, Loader2, Sparkles, ThumbsUp } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/civic/PageHeader";
import { AiBadge, AiErrorState, AiSection, AiThinking, ConfidenceMeter } from "@/components/civic/ai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { z } from "zod";

import { useCurrentProfile } from "@/hooks/useSession";
import { LIMITS } from "@/lib/constants";
import {
  fileToDataUrl,
  useAiDuplicateCheck,
  useAiTriage,
  useAiUnderstanding,
} from "@/hooks/useAiModules";
import { CATEGORIES, PRIORITY_META, type ComplaintPriority } from "@/lib/civic";
import { useCreateComplaint, useDepartments, useDistricts, useSupportComplaint } from "@/lib/queries";


export const Route = createFileRoute("/_authenticated/report")({
  head: () => ({
    meta: [
      { title: "Report an issue — CivicAI" },
      {
        name: "description",
        content: "Submit a public infrastructure issue with a photo, description and GPS location.",
      },
      { property: "og:title", content: "Report an issue — CivicAI" },
      { property: "og:description", content: "Photo, description and precise location in one form." },
    ],
  }),
  component: ReportPage,
});

/**
 * Client-side contract for a citizen report. Mirrors the database column limits
 * in `LIMITS` so bad input is rejected before it reaches the network.
 */
const reportSchema = z.object({
  title: z
    .string()
    .trim()
    .min(LIMITS.titleMin, `Give the issue a clearer title (at least ${LIMITS.titleMin} characters)`)
    .max(LIMITS.titleMax, `Keep the title under ${LIMITS.titleMax} characters`),
  description: z
    .string()
    .trim()
    .min(
      LIMITS.descriptionMin,
      `Describe the issue in at least ${LIMITS.descriptionMin} characters so officers can act on it`,
    )
    .max(LIMITS.descriptionMax, `Keep the description under ${LIMITS.descriptionMax} characters`),
  address: z.string().trim().max(LIMITS.addressMax, "Address is too long"),
});

type FormValues = z.infer<typeof reportSchema>;

const CATEGORY_DEPARTMENT: Record<string, string> = {
  roads: "ROAD",
  water: "WATER",
  electricity: "ELEC",
  sanitation: "SANI",
  safety: "SAFE",
};

function ReportPage() {
  const { data: me } = useCurrentProfile();
  const navigate = useNavigate();
  const districts = useDistricts();
  const departments = useDepartments();
  const create = useCreateComplaint(me?.profile?.id ?? undefined);
  const support = useSupportComplaint(me?.profile?.id ?? undefined);

  const understanding = useAiUnderstanding();
  const duplicate = useAiDuplicateCheck();
  const triage = useAiTriage();

  const [category, setCategory] = useState<string>("roads");
  const [priority, setPriority] = useState<ComplaintPriority>("medium");
  const [districtId, setDistrictId] = useState<string>("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [imageData, setImageData] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [forceSubmit, setForceSubmit] = useState(false);

  const { register, handleSubmit, getValues } = useForm<FormValues>({
    defaultValues: { title: "", description: "", address: "" },
  });

  const duplicateHit = duplicate.data?.isDuplicate ? duplicate.data : null;

  function captureLocation() {
    if (!navigator.geolocation) {
      toast.error("Location is not available in this browser");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocating(false);
        toast.success("GPS location captured");
      },
      () => {
        setLocating(false);
        toast.error("Could not read your location — pick a district instead");
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  async function runUnderstanding() {
    const values = getValues();
    if (values.description.trim().length < 10 && !imageData) {
      toast.error("Add a photo or a longer description before running AI analysis");
      return;
    }
    const district = districts.data?.find((d) => d.id === districtId);
    const result = await understanding.mutateAsync({
      title: values.title.trim(),
      description: values.description.trim(),
      address: values.address.trim(),
      ...(district ? { district: district.name } : {}),
      imageUrl: imageData,
    });
    setCategory(result.category);
    setPriority(result.severity);
    toast.success("AI classified this issue");
  }

  async function onSubmit(raw: FormValues) {
    const parsed = reportSchema.safeParse(raw);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check the form and try again");
      return;
    }
    const values = parsed.data;
    const district = districts.data?.find((d) => d.id === districtId);
    const lat = coords?.lat ?? district?.center_lat ?? null;
    const lng = coords?.lng ?? district?.center_lng ?? null;

    if (!forceSubmit) {
      try {
        const check = await duplicate.mutateAsync({
          title: values.title.trim(),
          description: values.description.trim(),
          category,
          address: values.address.trim(),
          lat,
          lng,
          imageUrl: imageData,
        });
        if (check.isDuplicate && check.match) {
          toast.info("A matching report already exists — support it instead of duplicating.");
          return;
        }
      } catch {
        // Duplicate detection is advisory — never block a citizen report on AI failure.
      }
    }

    const departmentCode = CATEGORY_DEPARTMENT[category];
    const department = departments.data?.find((d) => d.code === departmentCode);

    const id = await create.mutateAsync({
      title: values.title.slice(0, LIMITS.titleMax),
      description: values.description.slice(0, LIMITS.descriptionMax),
      category,
      priority,
      address: values.address.slice(0, LIMITS.addressMax),
      lat,
      lng,
      districtId: districtId || null,
      departmentId: department?.id ?? null,
      reporterName: me?.profile?.full_name || me?.email || "Citizen",
      reporterPhone: me?.profile?.phone ?? null,
      imageFile: file,
    });

    // Modules 1 + 3 + 4: classify, score and auto-assign. Never blocks submission.
    try {
      await triage.mutateAsync(id);
    } catch {
      // Triage failure keeps the complaint in review; it can be retried from the detail page.
    }

    navigate({ to: "/complaints/$id", params: { id } });
  }


  return (
    <>
      <PageHeader
        eyebrow="Citizen workspace"
        title="Report an infrastructure issue"
        description="Everything you add here becomes part of a permanent, timestamped municipal record."
      />

      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <div className="surface-card space-y-5 p-6">
          <div className="space-y-2">
            <Label htmlFor="title">Issue title</Label>
            <Input id="title" placeholder="Deep pothole near the bus depot" maxLength={LIMITS.titleMax} {...register("title", { required: true })} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Severity</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as ComplaintPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["low", "medium", "high", "critical"] as const).map((item) => (
                    <SelectItem key={item} value={item}>
                      {PRIORITY_META[item].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">What is happening?</Label>
            <Textarea
              id="description"
              rows={5}
              maxLength={LIMITS.descriptionMax}
              placeholder="Describe the issue, how long it has been there and who it affects."
              {...register("description", { required: true })}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>District</Label>
              <Select value={districtId} onValueChange={setDistrictId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select district" />
                </SelectTrigger>
                <SelectContent>
                  {(districts.data ?? []).map((district) => (
                    <SelectItem key={district.id} value={district.id}>
                      {district.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Street / landmark</Label>
              <Input id="address" maxLength={LIMITS.addressMax} placeholder="Lane 4, near the school gate" {...register("address")} />
            </div>
          </div>

          {duplicateHit?.match ? (
            <div className="space-y-3 rounded-xl border border-warning/50 bg-warning/5 p-4">
              <p className="inline-flex items-center gap-2 text-sm font-semibold">
                <AiBadge label="Duplicate" /> This looks like an existing report
              </p>
              <p className="text-xs text-muted-foreground">{duplicateHit.reason}</p>
              <div className="rounded-lg border border-border bg-card p-3">
                <p className="font-mono text-xs text-muted-foreground">
                  {duplicateHit.match.reference}
                </p>
                <p className="mt-1 text-sm font-medium">{duplicateHit.match.title}</p>
                <p className="text-xs text-muted-foreground">
                  {duplicateHit.match.address} · {duplicateHit.match.supportCount} supporters
                </p>
              </div>
              <ConfidenceMeter value={duplicateHit.confidence} label="Match confidence" />
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>Location: {duplicateHit.signals.location}</li>
                <li>Description: {duplicateHit.signals.description}</li>
                <li>Image: {duplicateHit.signals.image}</li>
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    support.mutate(duplicateHit.match!.id);
                    navigate({ to: "/complaints/$id", params: { id: duplicateHit.match!.id } });
                  }}
                >
                  <ThumbsUp className="mr-2 size-4" /> Support existing report
                </Button>
                <Button asChild type="button" size="sm" variant="outline">
                  <Link to="/complaints/$id" params={{ id: duplicateHit.match.id }}>
                    View it first
                  </Link>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setForceSubmit(true);
                    duplicate.reset();
                    toast.info("Duplicate check skipped — submit again to file a new report");
                  }}
                >
                  This is a different issue
                </Button>
              </div>
            </div>
          ) : null}

          <Button
            type="submit"
            size="lg"
            disabled={create.isPending || duplicate.isPending || triage.isPending}
          >
            {create.isPending || duplicate.isPending || triage.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : null}
            {duplicate.isPending
              ? "Checking for duplicates…"
              : triage.isPending
                ? "AI triage running…"
                : "Submit report"}
          </Button>
        </div>

        <div className="space-y-6">
          <section className="surface-card space-y-3 p-6">
            <Label>GPS location</Label>
            <p className="text-xs text-muted-foreground">
              Precise coordinates help field crews find the exact spot.
            </p>
            <Button type="button" variant="outline" onClick={captureLocation} disabled={locating}>
              {locating ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Crosshair className="mr-2 size-4" />
              )}
              Use my current location
            </Button>
            <p className="font-mono text-xs text-muted-foreground">
              {coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : "No coordinates captured"}
            </p>
          </section>

          <section className="surface-card space-y-3 p-6">
            <Label htmlFor="photo">Photo evidence</Label>
            <label
              htmlFor="photo"
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-4 py-8 text-center transition-colors hover:bg-muted/60"
            >
              <ImagePlus className="size-5 text-muted-foreground" />
              <span className="text-sm font-medium">{file ? file.name : "Upload a photo"}</span>
              <span className="text-xs text-muted-foreground">JPG, PNG or WebP up to 5 MB</span>
            </label>
            <input
              id="photo"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (event) => {
                const selected = event.target.files?.[0] ?? null;
                if (selected && !LIMITS.imageTypes.includes(selected.type as never)) {
                  toast.error("Upload a JPG, PNG or WebP image");
                  event.target.value = "";
                  return;
                }
                if (selected && selected.size > LIMITS.imageMaxBytes) {
                  toast.error("Image must be under 5 MB");
                  event.target.value = "";
                  return;
                }
                setFile(selected);
                setImageData(null);
                if (selected) {
                  try {
                    setImageData(await fileToDataUrl(selected));
                  } catch {
                    toast.error("Could not prepare that image for AI analysis");
                  }
                }
              }}
            />
          </section>

          <AiSection
            title="AI complaint understanding"
            hint="Detects the infrastructure asset, category, severity and the right department."
            action={
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={runUnderstanding}
                disabled={understanding.isPending}
              >
                <Sparkles className="mr-2 size-3.5" /> Analyse
              </Button>
            }
          >
            {understanding.isPending ? <AiThinking /> : null}

            {understanding.isError && !understanding.isPending ? (
              <AiErrorState
                message={
                  understanding.error instanceof Error
                    ? understanding.error.message
                    : "AI analysis failed."
                }
                onRetry={runUnderstanding}
                pending={understanding.isPending}
              />
            ) : null}

            {understanding.data && !understanding.isPending ? (
              <div className="space-y-3">
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted-foreground uppercase">Infrastructure</dt>
                    <dd className="mt-0.5 text-sm font-medium">
                      {understanding.data.infrastructureType}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground uppercase">Severity</dt>
                    <dd className="mt-0.5 text-sm font-medium">
                      {PRIORITY_META[understanding.data.severity].label}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground uppercase">Category</dt>
                    <dd className="mt-0.5 text-sm font-medium">
                      {CATEGORIES.find((c) => c.value === understanding.data!.category)?.label}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground uppercase">Department</dt>
                    <dd className="mt-0.5 text-sm font-medium">
                      {understanding.data.suggestedDepartmentCode}
                    </dd>
                  </div>
                </dl>
                <p className="text-xs text-muted-foreground">{understanding.data.summary}</p>
                <ConfidenceMeter value={understanding.data.confidence} />
                <p className="text-xs text-muted-foreground">
                  Category and severity above have been applied to the form — you can still change
                  them.
                </p>
              </div>
            ) : null}

            {!understanding.data && !understanding.isPending && !understanding.isError ? (
              <p className="text-xs text-muted-foreground">
                Add a photo or description, then run the analysis. On submission CivicAI also checks
                for duplicates, scores priority and assigns a field officer automatically.
              </p>
            ) : null}
          </AiSection>

        </div>
      </form>
    </>
  );
}
