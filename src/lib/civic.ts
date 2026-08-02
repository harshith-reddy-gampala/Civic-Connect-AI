import type { Database } from "@/integrations/supabase/types";

export type ComplaintStatus = Database["public"]["Enums"]["complaint_status"];
export type ComplaintPriority = Database["public"]["Enums"]["complaint_priority"];
export type AppRole = Database["public"]["Enums"]["app_role"];

export const STATUS_FLOW: ComplaintStatus[] = [
  "submitted",
  "under_review",
  "assigned",
  "in_progress",
  "completed",
];

export const STATUS_META: Record<
  ComplaintStatus,
  { label: string; tone: "info" | "warning" | "primary" | "accent" | "success" }
> = {
  submitted: { label: "Submitted", tone: "info" },
  under_review: { label: "Under Review", tone: "warning" },
  assigned: { label: "Assigned", tone: "primary" },
  in_progress: { label: "In Progress", tone: "accent" },
  completed: { label: "Completed", tone: "success" },
};

export const PRIORITY_META: Record<
  ComplaintPriority,
  { label: string; tone: "muted" | "info" | "warning" | "critical" }
> = {
  low: { label: "Low", tone: "muted" },
  medium: { label: "Medium", tone: "info" },
  high: { label: "High", tone: "warning" },
  critical: { label: "Critical", tone: "critical" },
};

export const CATEGORIES = [
  { value: "roads", label: "Roads & Potholes" },
  { value: "water", label: "Water Supply" },
  { value: "electricity", label: "Electricity & Lighting" },
  { value: "sanitation", label: "Sanitation & Waste" },
  { value: "safety", label: "Public Safety" },
  { value: "other", label: "Other" },
] as const;

export const ROLE_META: Record<AppRole, { label: string; home: string; description: string }> = {
  citizen: {
    label: "Citizen",
    home: "/citizen",
    description: "Report issues, track progress and support neighbourhood reports.",
  },
  department_admin: {
    label: "Department Admin",
    home: "/department",
    description: "City-wide intelligence, analytics and officer performance.",
  },
  field_officer: {
    label: "Field Officer",
    home: "/officer",
    description: "Work the assigned queue, update status and upload proof.",
  },
};

export function categoryLabel(value: string) {
  return CATEGORIES.find((c) => c.value === value)?.label ?? "Other";
}

export function statusProgress(status: ComplaintStatus) {
  return ((STATUS_FLOW.indexOf(status) + 1) / STATUS_FLOW.length) * 100;
}

export function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function hoursBetween(a: string, b: string) {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 3_600_000;
}

export function formatHours(hours: number) {
  if (!hours) return "—";
  if (hours < 48) return `${hours.toFixed(0)} hrs`;
  return `${(hours / 24).toFixed(1)} days`;
}

export function nextStatuses(status: ComplaintStatus): ComplaintStatus[] {
  const index = STATUS_FLOW.indexOf(status);
  return STATUS_FLOW.slice(index + 1);
}
