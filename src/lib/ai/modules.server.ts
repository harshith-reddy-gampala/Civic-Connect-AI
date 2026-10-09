import type { ComplaintPriority } from "@/lib/civic";
import { clampConfidence, runAiJson } from "@/lib/ai/provider.server";
import {
  duplicatePrompt,
  insightsPrompt,
  priorityPrompt,
  repairVerificationPrompt,
  routingPrompt,
  understandingPrompt,
} from "@/lib/ai/prompts.server";
import {
  basePriorityScore,
  scoreToPriority,
  type AiDuplicate,
  type AiInsights,
  type AiPriority,
  type AiRepairVerification,
  type AiRouting,
  type AiUnderstanding,
} from "@/lib/ai/types";

const CATEGORIES = ["roads", "water", "electricity", "sanitation", "safety", "other"];
const SEVERITIES: ComplaintPriority[] = ["low", "medium", "high", "critical"];

function pickCategory(value: unknown) {
  const raw = String(value ?? "").toLowerCase();
  return CATEGORIES.find((c) => raw.includes(c)) ?? "other";
}

function pickSeverity(value: unknown, fallback: ComplaintPriority = "medium") {
  const raw = String(value ?? "").toLowerCase();
  return SEVERITIES.find((s) => raw.includes(s)) ?? fallback;
}

function text(value: unknown, fallback = "") {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw ? raw.slice(0, 600) : fallback;
}

export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6_371_000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** Module 1 — Complaint understanding */
export async function understandComplaint(input: {
  title: string;
  description: string;
  address: string;
  district?: string;
  imageUrl?: string | null;
}): Promise<AiUnderstanding> {
  const raw = await runAiJson<Record<string, unknown>>({
    system: understandingPrompt.system,
    user: understandingPrompt.user({ ...input, hasImage: !!input.imageUrl }),
    images: [input.imageUrl],
  });

  const category = pickCategory(raw["category"]);
  const codeByCategory: Record<string, string> = {
    roads: "ROAD",
    water: "WATER",
    electricity: "ELEC",
    sanitation: "SANI",
    safety: "SAFE",
    other: "GEN",
  };

  return {
    infrastructureType: text(raw["infrastructureType"], "Unidentified asset"),
    category,
    severity: pickSeverity(raw["severity"]),
    suggestedDepartmentCode:
      text(raw["suggestedDepartmentCode"]).toUpperCase() || codeByCategory[category] || "GEN",
    summary: text(raw["summary"], "No summary available."),
    confidence: clampConfidence(raw["confidence"]),
    imageRelevant: raw["imageRelevant"] === true && !!input.imageUrl,
    imageRelevanceReason: text(
      raw["imageRelevanceReason"],
      "The image does not provide clear, relevant evidence for this complaint.",
    ),
  };
}

/** Module 2 — Duplicate detection */
export async function detectDuplicate(input: {
  newComplaint: {
    title: string;
    description: string;
    category: string;
    address: string;
    imageUrl?: string | null;
  };
  candidates: {
    id: string;
    title: string;
    description: string;
    category: string;
    address: string;
    distanceMeters: number | null;
    imageUrl?: string | null;
  }[];
}): Promise<AiDuplicate> {
  if (!input.candidates.length) {
    return {
      isDuplicate: false,
      complaintId: null,
      confidence: 0.9,
      reason: "No open complaints were found nearby.",
      signals: { image: "not compared", location: "no nearby reports", description: "no matches" },
    };
  }

  const raw = await runAiJson<Record<string, unknown>>({
    system: duplicatePrompt.system,
    user: duplicatePrompt.user({
      newComplaint: {
        title: input.newComplaint.title,
        description: input.newComplaint.description,
        category: input.newComplaint.category,
        address: input.newComplaint.address,
      },
      candidates: input.candidates.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description.slice(0, 400),
        category: c.category,
        address: c.address,
        distanceMeters: c.distanceMeters,
        hasImage: !!c.imageUrl,
      })),
    }),
    images: [input.newComplaint.imageUrl, ...input.candidates.slice(0, 3).map((c) => c.imageUrl)],
  });

  const id = typeof raw["complaintId"] === "string" ? raw["complaintId"] : null;
  const matched = input.candidates.find((c) => c.id === id) ?? null;
  const signals = (raw["signals"] ?? {}) as Record<string, unknown>;

  return {
    isDuplicate: raw["isDuplicate"] === true && !!matched,
    complaintId: matched?.id ?? null,
    confidence: clampConfidence(raw["confidence"], 0.5),
    reason: text(raw["reason"], "No strong duplicate signal."),
    signals: {
      image: text(signals["image"], "not compared"),
      location: text(signals["location"], "unknown"),
      description: text(signals["description"], "unknown"),
    },
  };
}

/** Module 3 — Priority engine */
export async function computePriority(input: {
  title: string;
  description: string;
  category: string;
  severity: ComplaintPriority;
  supporters: number;
  hoursPending: number;
}): Promise<AiPriority> {
  const baselineScore = basePriorityScore({
    severity: input.severity,
    supporters: input.supporters,
    hoursPending: input.hoursPending,
    category: input.category,
  });

  let raw: Record<string, unknown> = {};
  try {
    raw = await runAiJson<Record<string, unknown>>({
      system: priorityPrompt.system,
      user: priorityPrompt.user({ ...input, baselineScore }),
    });
  } catch {
    raw = {};
  }

  const aiScore = Number(raw["score"]);
  const score = Number.isFinite(aiScore)
    ? Math.round(Math.min(100, Math.max(0, Math.min(baselineScore + 15, Math.max(baselineScore - 15, aiScore)))))
    : baselineScore;

  const factors = Array.isArray(raw["factors"])
    ? (raw["factors"] as Record<string, unknown>[])
        .slice(0, 4)
        .map((f) => ({
          label: text(f["label"], "Factor").slice(0, 60),
          weight: Math.max(0, Math.min(40, Math.round(Number(f["weight"]) || 0))),
        }))
    : [
        { label: `Severity: ${input.severity}`, weight: 30 },
        { label: `${input.supporters} citizens affected`, weight: Math.min(20, input.supporters * 3) },
        { label: `${Math.round(input.hoursPending / 24)} days pending`, weight: 10 },
      ];

  return {
    score,
    priority: scoreToPriority(score),
    reason: text(raw["reason"], "Scored from severity, citizen impact and time pending."),
    factors,
  };
}

/** Module 4 — Automatic routing */
export async function routeComplaint(input: {
  complaint: {
    title: string;
    category: string;
    severity: ComplaintPriority;
    address: string;
    lat: number | null;
    lng: number | null;
  };
  departments: { id: string; name: string; code: string; category: string }[];
  districts: { id: string; name: string; center_lat: number; center_lng: number }[];
  officers: {
    id: string;
    full_name: string;
    department_id: string | null;
    district_id: string | null;
    active_count: number;
    avg_resolution_hours: number | string;
    rating: number | string;
  }[];
}): Promise<AiRouting> {
  const raw = await runAiJson<Record<string, unknown>>({
    system: routingPrompt.system,
    user: routingPrompt.user({
      complaint: input.complaint,
      departments: input.departments,
      districts: input.districts.map((d) => ({
        id: d.id,
        name: d.name,
        centerLat: d.center_lat,
        centerLng: d.center_lng,
      })),
      officers: input.officers.map((o) => ({
        id: o.id,
        name: o.full_name,
        departmentId: o.department_id,
        districtId: o.district_id,
        activeCount: o.active_count,
        avgResolutionHours: Number(o.avg_resolution_hours),
        rating: Number(o.rating),
      })),
    }),
  });

  // Deterministic fallbacks keep routing complete even if a pick is invalid.
  const codeByCategory: Record<string, string> = {
    roads: "ROAD",
    water: "WATER",
    electricity: "ELEC",
    sanitation: "SANI",
    safety: "SAFE",
  };
  const department =
    input.departments.find((d) => d.id === raw["departmentId"]) ??
    input.departments.find((d) => d.code === codeByCategory[input.complaint.category]) ??
    input.departments[0] ??
    null;

  const nearestDistrict =
    input.complaint.lat != null && input.complaint.lng != null
      ? [...input.districts].sort(
          (a, b) =>
            distanceMeters(
              { lat: input.complaint.lat!, lng: input.complaint.lng! },
              { lat: a.center_lat, lng: a.center_lng },
            ) -
            distanceMeters(
              { lat: input.complaint.lat!, lng: input.complaint.lng! },
              { lat: b.center_lat, lng: b.center_lng },
            ),
        )[0]
      : undefined;
  const district =
    input.districts.find((d) => d.id === raw["districtId"]) ?? nearestDistrict ?? null;

  const candidates = input.officers.filter(
    (o) => !department || !o.department_id || o.department_id === department.id,
  );
  const fallbackOfficer =
    [...(candidates.length ? candidates : input.officers)].sort(
      (a, b) =>
        (a.district_id === district?.id ? -1 : 0) - (b.district_id === district?.id ? -1 : 0) ||
        a.active_count - b.active_count,
    )[0] ?? null;
  const officer = input.officers.find((o) => o.id === raw["officerId"]) ?? fallbackOfficer;

  return {
    departmentId: department?.id ?? null,
    departmentName: department?.name ?? "Unassigned",
    districtId: district?.id ?? null,
    districtName: district?.name ?? "Unmapped",
    officerId: officer?.id ?? null,
    officerName: officer?.full_name ?? "Awaiting officer",
    reason: text(
      raw["reason"],
      officer
        ? `Routed to ${officer.full_name} based on department match and current workload.`
        : "No matching officer available yet.",
    ),
    confidence: clampConfidence(raw["confidence"], 0.7),
  };
}

/** Module 5 — Repair verification */
export async function verifyRepair(input: {
  title: string;
  description: string;
  category: string;
  remarks: string;
  beforeImageUrl: string;
  afterImageUrl: string;
}): Promise<AiRepairVerification> {
  const raw = await runAiJson<Record<string, unknown>>({
    system: repairVerificationPrompt.system,
    user: repairVerificationPrompt.user(input),
    images: [input.beforeImageUrl, input.afterImageUrl],
  });

  const verdict = String(raw["verdict"] ?? "").includes("completed")
    ? "repair_completed"
    : "needs_reinspection";
  const observations = Array.isArray(raw["observations"])
    ? (raw["observations"] as unknown[]).slice(0, 4).map((o) => text(o).slice(0, 160)).filter(Boolean)
    : [];

  return {
    verdict,
    confidence: clampConfidence(raw["confidence"], 0.5),
    notes: text(raw["notes"], "No additional notes."),
    observations,
  };
}

/** Module 6 — Predictive insights */
export async function generateInsights(input: {
  totalComplaints: number;
  windowMonths: number;
  byCategory: { category: string; total: number; completed: number; avgResolutionHours: number }[];
  byDistrict: { district: string; total: number; critical: number; repeatCategories: string[] }[];
  recurring: { district: string; category: string; count: number }[];
}): Promise<AiInsights> {
  if (input.totalComplaints < 3) {
    return {
      recommendations: [],
      summary: "Not enough complaint history yet to recommend preventive inspections.",
      basedOn: input.totalComplaints,
    };
  }

  const raw = await runAiJson<Record<string, unknown>>({
    system: insightsPrompt.system,
    user: insightsPrompt.user(input),
    temperature: 0.3,
  });

  const list = Array.isArray(raw["recommendations"]) ? (raw["recommendations"] as Record<string, unknown>[]) : [];

  return {
    summary: text(raw["summary"], "Recommendations derived from recent complaint trends."),
    basedOn: input.totalComplaints,
    recommendations: list.slice(0, 5).map((item) => ({
      title: text(item["title"], "Preventive inspection"),
      area: text(item["area"], "City-wide"),
      category: pickCategory(item["category"]),
      urgency: pickSeverity(item["urgency"], "medium"),
      rationale: text(item["rationale"], ""),
      action: text(item["action"], "Schedule an inspection round."),
    })),
  };
}
