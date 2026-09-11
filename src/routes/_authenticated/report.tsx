import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { Camera, Crosshair, ImagePlus, Loader2, Sparkles, ThumbsUp } from "lucide-react";
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
  beforeLoad: ({ context }) => {
    if (context.role !== "citizen") throw redirect({ to: "/dashboard" });
  },
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
type ReportMode = "live" | "gallery";

const CATEGORY_DEPARTMENT: Record<string, string> = {
  roads: "ROAD",
  water: "WATER",
  electricity: "ELEC",
  sanitation: "SANI",
  safety: "SAFE",
};

const SUPPORTED_DISTRICTS = new Set(["Hyderabad", "Rangareddy", "Medchal-Malkajgiri"]);

function nearestDistrict(
  districts: { id: string; name: string; center_lat: number; center_lng: number }[],
  coords: { lat: number; lng: number },
) {
  return districts
    .filter((district) => SUPPORTED_DISTRICTS.has(district.name))
    .sort(
      (a, b) =>
        (a.center_lat - coords.lat) ** 2 + (a.center_lng - coords.lng) ** 2 -
        ((b.center_lat - coords.lat) ** 2 + (b.center_lng - coords.lng) ** 2),
    )[0];
}

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
  const [mode, setMode] = useState<ReportMode | null>(null);
  const [districtId, setDistrictId] = useState<string>("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [imageData, setImageData] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [forceSubmit, setForceSubmit] = useState(false);
  const [analysisFingerprint, setAnalysisFingerprint] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const submissionLock = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraRequestRef = useRef(0);

  const { register, handleSubmit, getValues, setValue, watch } = useForm<FormValues>({
    defaultValues: { title: "", description: "", address: "" },
  });

  const duplicateHit = duplicate.data?.isDuplicate ? duplicate.data : null;
  const selectedDistrict = districts.data?.find((district) => district.id === districtId);
  const derivedAddress = selectedDistrict
    ? `${selectedDistrict.name}${coords ? ` · ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : ""}`
    : coords
      ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
      : "";
  const watchedValues = watch();
  const currentAnalysisFingerprint = JSON.stringify({
    title: watchedValues.title.trim(),
    description: watchedValues.description.trim(),
    address: mode === "live" ? derivedAddress : watchedValues.address.trim(),
    category,
    mode,
    districtId,
    coords,
    imageData,
    fileKey: file ? `${file.name}:${file.size}:${file.lastModified}` : null,
  });
  const analysisCurrent =
    !!understanding.data &&
    !understanding.isPending &&
    !understanding.isError &&
    analysisFingerprint === currentAnalysisFingerprint;

  useEffect(() => {
    if (analysisFingerprint && analysisFingerprint !== currentAnalysisFingerprint) {
      understanding.reset();
      setAnalysisFingerprint(null);
    }
  }, [analysisFingerprint, currentAnalysisFingerprint, understanding]);

  useEffect(() => {
    if (mode !== "live" || !coords || districtId || !districts.data?.length) return;
    const district = nearestDistrict(districts.data, coords);
    if (district) setDistrictId(district.id);
  }, [coords, districtId, districts.data, mode]);

  function captureLocation() {
    if (!navigator.geolocation) {
      toast.error("Location is not available in this browser");
      return;
    }
    setLocationError(null);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextCoords = { lat: position.coords.latitude, lng: position.coords.longitude };
        const district = nearestDistrict(districts.data ?? [], nextCoords);
        setCoords(nextCoords);
        if (district) setDistrictId(district.id);
        else setLocationError("Your location is outside the three supported districts. Choose a district manually in gallery mode.");
        setLocating(false);
        toast.success("GPS location captured");
      },
      () => {
        setLocating(false);
        setLocationError("We could not access your location. Please allow GPS access and retry.");
        toast.error("Could not read your location — pick a district instead");
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  function stopCamera() {
    cameraRequestRef.current += 1;
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraReady(false);
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
    setCameraStarting(false);
  }

  function clearReportAnalysis() {
    understanding.reset();
    setAnalysisFingerprint(null);
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera access is not supported in this browser.");
      return;
    }
    setCameraError(null);
    setCameraStarting(true);
    setCameraReady(false);
    const requestId = ++cameraRequestRef.current;
    try {
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      if (requestId !== cameraRequestRef.current || mode !== "live") {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      cameraStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        if (videoRef.current.readyState >= HTMLMediaElement.HAVE_METADATA) {
          setCameraReady(videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0);
        }
      }
      setCameraActive(true);
    } catch {
      setCameraError("Camera access was denied or unavailable. Please allow camera access and retry.");
    } finally {
      setCameraStarting(false);
    }
  }

  async function capturePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setCameraError("The camera is not ready yet. Please try again.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) {
      setCameraError("Could not capture that image. Please try again.");
      return;
    }
    const captured = new File([blob], `live-report-${Date.now()}.jpg`, { type: "image/jpeg" });
    setFile(captured);
    setImageData(await fileToDataUrl(captured));
    stopCamera();
  }

  function selectMode(nextMode: ReportMode) {
    stopCamera();
    clearReportAnalysis();
    setFile(null);
    setImageData(null);
    setLocationError(null);
    setCameraError(null);
    setCoords(null);
    setDistrictId("");
    if (nextMode === "live") setValue("address", "");
    setMode(nextMode);
  }

  useEffect(() => {
    if (mode !== "live") return;
    void startCamera();
    captureLocation();
    return stopCamera;
  }, [mode]);

  useEffect(() => () => stopCamera(), []);

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
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
        toast.error("Could not prepare that photo for AI analysis");
      }
    }
  }

  async function runUnderstanding() {
    const values = getValues();
    if (mode === "live" && !file) {
      toast.error("Capture a camera photo before running AI analysis");
      return;
    }
    if (values.description.trim().length < 10 && !imageData) {
      toast.error("Add a photo or a longer description before running AI analysis");
      return;
    }
    const address = mode === "live" ? derivedAddress : values.address.trim();
    const district = selectedDistrict;
    if (mode === "live" && (!coords || !district)) {
      toast.error("Capture a GPS location inside a supported district before analysing.");
      return;
    }
    const result = await understanding.mutateAsync({
      title: values.title.trim(),
      description: values.description.trim(),
      address,
      ...(district ? { district: district.name } : {}),
      imageUrl: imageData,
    });
    setCategory(result.category);
    setPriority(result.severity);
    setAnalysisFingerprint(
      JSON.stringify({
        title: values.title.trim(),
        description: values.description.trim(),
        address: mode === "live" ? derivedAddress : values.address.trim(),
        category: result.category,
        mode,
        districtId,
        coords,
        imageData,
        fileKey: file ? `${file.name}:${file.size}:${file.lastModified}` : null,
      }),
    );
    toast.success("AI classified this issue");
  }

  async function onSubmit(raw: FormValues) {
    if (submissionLock.current) return;
    submissionLock.current = true;
    setSubmitting(true);
    try {
      if (!analysisCurrent) {
        toast.error("Analyse the current complaint details before submitting the report.");
        return;
      }

      const parsed = reportSchema.safeParse(raw);
      if (!parsed.success) {
        toast.error(parsed.error.issues[0]?.message ?? "Please check the form and try again");
        return;
      }
      const values = parsed.data;
      const district = selectedDistrict;
      if (mode === "live" && (!coords || !district)) {
        toast.error("Capture a GPS location inside a supported district before submitting.");
        return;
      }
      if (mode === "live" && !file) {
        toast.error("Capture a camera photo before submitting.");
        return;
      }
      const address = mode === "live" ? derivedAddress : values.address.trim();
      const lat = coords?.lat ?? district?.center_lat ?? null;
      const lng = coords?.lng ?? district?.center_lng ?? null;

      if (!forceSubmit) {
        try {
          const check = await duplicate.mutateAsync({
            title: values.title.trim(),
            description: values.description.trim(),
            category,
            address,
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
        address: address.slice(0, LIMITS.addressMax),
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
        await triage.mutateAsync({
          complaintId: id,
          understanding: understanding.data ?? undefined,
        });
      } catch {
        // Triage failure keeps the complaint in review; it can be retried from the detail page.
      }

      navigate({ to: "/complaints/$id", params: { id } });
    } finally {
      submissionLock.current = false;
      setSubmitting(false);
    }
  }


  if (!mode) {
    return (
      <>
        <PageHeader
          eyebrow="Citizen workspace"
          title="Report an infrastructure issue"
          description="Choose how you want to capture the issue."
        />
        <section className="surface-card mx-auto max-w-3xl space-y-4 p-6 sm:p-8">
          <div>
            <h2 className="text-lg font-semibold">How would you like to report?</h2>
            <p className="mt-1 text-sm text-muted-foreground">Choose a live camera report or use an existing photo.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => selectMode("live")} className="flex items-start gap-3 rounded-xl border border-border p-5 text-left transition-colors hover:border-primary/50 hover:bg-muted">
              <Camera className="mt-0.5 size-6 shrink-0 text-primary" />
              <span><span className="block text-sm font-semibold">Capture with camera</span><span className="mt-1 block text-xs text-muted-foreground">Take a live photo and detect your location with GPS.</span></span>
            </button>
            <button type="button" onClick={() => selectMode("gallery")} className="flex items-start gap-3 rounded-xl border border-border p-5 text-left transition-colors hover:border-primary/50 hover:bg-muted">
              <ImagePlus className="mt-0.5 size-6 shrink-0 text-primary" />
              <span><span className="block text-sm font-semibold">Upload from gallery</span><span className="mt-1 block text-xs text-muted-foreground">Use a prepared civic-issue image and enter its location.</span></span>
            </button>
          </div>
        </section>
      </>
    );
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
          <Button type="button" variant="ghost" size="sm" onClick={() => setMode(null)} className="w-fit px-0">
            Change reporting mode
          </Button>
          <div className="space-y-2">
            <Label htmlFor="title">Issue title</Label>
            <Input id="title" placeholder="Deep pothole near the bus depot" maxLength={LIMITS.titleMax} {...register("title", { required: true })} />
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

          {mode === "gallery" ? <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>District</Label>
              <Select value={districtId} onValueChange={setDistrictId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select district" />
                </SelectTrigger>
                <SelectContent>
                  {(districts.data ?? []).filter((district) => SUPPORTED_DISTRICTS.has(district.name)).map((district) => (
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
          </div> : (
            <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-4">
              <Label>Detected location</Label>
              <p className="text-sm font-medium">{selectedDistrict?.name ?? "Waiting for GPS location"}</p>
              <p className="text-xs text-muted-foreground">
                {coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : "Allow location access to detect your district."}
              </p>
              {locationError ? <p className="text-xs font-medium text-warning">{locationError}</p> : null}
              <Button type="button" variant="outline" size="sm" onClick={captureLocation} disabled={locating}>
                {locating ? <Loader2 className="mr-2 size-4 animate-spin" /> : null} Retry GPS
              </Button>
            </div>
          )}

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
            disabled={
              submitting ||
              !analysisCurrent ||
              create.isPending ||
              duplicate.isPending ||
              triage.isPending
            }
          >
            {submitting || create.isPending || duplicate.isPending || triage.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : null}
            {submitting
              ? "Submitting…"
              : duplicate.isPending
              ? "Checking for duplicates…"
              : triage.isPending
                ? "AI triage running…"
                : "Submit report"}
          </Button>
        </div>

        <div className="space-y-6">
          {mode === "gallery" ? (
            <section className="surface-card space-y-3 p-6">
              <Label>GPS location</Label>
              <p className="text-xs text-muted-foreground">
                Precise coordinates help field crews find the exact spot.
              </p>
              <Button type="button" variant="outline" onClick={captureLocation} disabled={locating}>
                {locating ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Crosshair className="mr-2 size-4" />}
                Use my current location
              </Button>
              <p className="font-mono text-xs text-muted-foreground">
                {coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : "No coordinates captured"}
              </p>
              {locationError ? <p className="text-xs font-medium text-warning">{locationError}</p> : null}
            </section>
          ) : (
            <section className="surface-card space-y-3 p-6">
              <Label>Live camera</Label>
              {file && imageData ? (
                <img src={imageData} alt="Captured civic issue" className="aspect-video w-full rounded-xl object-cover" />
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  onLoadedMetadata={(event) => {
                    void event.currentTarget.play().then(() => setCameraReady(true)).catch(() => {
                      setCameraError("The camera preview could not start. Please retry camera access.");
                    });
                  }}
                  onCanPlay={() => setCameraReady(true)}
                  className="aspect-video w-full rounded-xl bg-black object-cover"
                />
              )}
              {cameraError ? <p className="text-xs font-medium text-warning">{cameraError}</p> : null}
              {cameraStarting ? <p className="text-xs text-muted-foreground">Opening camera…</p> : null}
              <div className="flex flex-wrap gap-2">
                {file ? (
                  <Button type="button" variant="outline" onClick={() => { setFile(null); setImageData(null); clearReportAnalysis(); void startCamera(); }}>
                    <Camera className="mr-2 size-4" /> Retake photo
                  </Button>
                ) : (
                  <Button type="button" onClick={capturePhoto} disabled={!cameraActive || !cameraReady || cameraStarting}>
                    <Camera className="mr-2 size-4" /> Take photo
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {locating ? "Detecting your location…" : selectedDistrict ? `Detected district: ${selectedDistrict.name}` : "GPS location is required for live reports."}
              </p>
              {coords ? <p className="font-mono text-xs text-muted-foreground">{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</p> : null}
              {locationError ? <p className="text-xs font-medium text-warning">{locationError}</p> : null}
              {locationError ? <Button type="button" variant="outline" size="sm" onClick={captureLocation} disabled={locating}>Retry GPS</Button> : null}
            </section>
          )}

          {mode === "gallery" ? <section className="surface-card space-y-3 p-6">
            <Label htmlFor="photo">Photo evidence</Label>
            <label
              htmlFor="photo"
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-4 py-8 text-center transition-colors hover:bg-muted/60"
            >
              <ImagePlus className="size-5 text-muted-foreground" />
              <span className="text-sm font-medium">{file ? file.name : "Upload a photo"}</span>
              <span className="text-xs text-muted-foreground">
                JPG, PNG or WebP up to 5 MB
              </span>
            </label>
            <input
              id="photo"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoChange}
            />
          </section> : null}

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
                  Category, severity, department and infrastructure classification are controlled by
                  this AI analysis.
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
