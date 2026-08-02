import type { ComplaintPriority } from "@/lib/civic";

/** Module 1 — Complaint understanding */
export type AiUnderstanding = {
  infrastructureType: string;
  category: string;
  severity: ComplaintPriority;
  suggestedDepartmentCode: string;
  summary: string;
  confidence: number;
};

/** Module 2 — Duplicate detection */
export type AiDuplicate = {
  isDuplicate: boolean;
  complaintId: string | null;
  confidence: number;
  reason: string;
  signals: { image: string; location: string; description: string };
};

/** Module 3 — Priority engine */
export type AiPriority = {
  score: number;
  priority: ComplaintPriority;
  reason: string;
  factors: { label: string; weight: number }[];
};

/** Module 4 — Automatic routing */
export type AiRouting = {
  departmentId: string | null;
  departmentName: string;
  districtId: string | null;
  districtName: string;
  officerId: string | null;
  officerName: string;
  reason: string;
  confidence: number;
};

/** Full intake result (modules 1, 3 and 4 applied to a saved complaint) */
export type AiTriage = {
  understanding: AiUnderstanding;
  priority: AiPriority;
  routing: AiRouting;
};

/** Module 5 — Repair verification */
export type AiRepairVerification = {
  verdict: "repair_completed" | "needs_reinspection";
  confidence: number;
  notes: string;
  observations: string[];
};

/** Module 6 — Predictive insights */
export type AiRecommendation = {
  title: string;
  area: string;
  category: string;
  urgency: ComplaintPriority;
  rationale: string;
  action: string;
};

export type AiInsights = {
  recommendations: AiRecommendation[];
  summary: string;
  basedOn: number;
};

export const PRIORITY_THRESHOLDS: { min: number; priority: ComplaintPriority }[] = [
  { min: 80, priority: "critical" },
  { min: 60, priority: "high" },
  { min: 35, priority: "medium" },
  { min: 0, priority: "low" },
];

export function scoreToPriority(score: number): ComplaintPriority {
  return PRIORITY_THRESHOLDS.find((row) => score >= row.min)?.priority ?? "low";
}

/**
 * Deterministic baseline for the priority engine. The AI refines the score and
 * writes the rationale, but this keeps output stable and explainable.
 */
export function basePriorityScore(input: {
  severity: ComplaintPriority;
  supporters: number;
  hoursPending: number;
  category: string;
}) {
  const severityWeight: Record<ComplaintPriority, number> = {
    low: 20,
    medium: 40,
    high: 62,
    critical: 82,
  };
  const impact = Math.min(20, input.supporters * 3);
  const pending = Math.min(14, input.hoursPending / 24 / 2);
  const safetyBoost = ["safety", "electricity", "water"].includes(input.category) ? 6 : 0;
  return Math.round(
    Math.min(100, severityWeight[input.severity] + impact + pending + safetyBoost),
  );
}
