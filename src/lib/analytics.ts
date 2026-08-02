import type { Complaint, District, Department, Officer } from "@/lib/queries";
import { CATEGORIES, STATUS_FLOW, STATUS_META, categoryLabel, hoursBetween } from "@/lib/civic";

export function summarize(complaints: Complaint[]) {
  const completed = complaints.filter((c) => c.status === "completed");
  const pending = complaints.filter((c) => c.status !== "completed");
  const critical = complaints.filter((c) => c.priority === "critical" && c.status !== "completed");
  const resolutionHours = completed
    .filter((c) => c.resolved_at)
    .map((c) => hoursBetween(c.created_at, c.resolved_at!));
  const avgResolution = resolutionHours.length
    ? resolutionHours.reduce((a, b) => a + b, 0) / resolutionHours.length
    : 0;

  return {
    total: complaints.length,
    completed: completed.length,
    pending: pending.length,
    critical: critical.length,
    avgResolution,
    supporters: complaints.reduce((sum, c) => sum + c.support_count, 0),
  };
}

export function statusBreakdown(complaints: Complaint[]) {
  return STATUS_FLOW.map((status) => ({
    label: STATUS_META[status].label,
    value: complaints.filter((c) => c.status === status).length,
  }));
}

export function categoryBreakdown(complaints: Complaint[]) {
  return CATEGORIES.map((category) => ({
    label: category.label.split(" ")[0] ?? category.label,
    value: complaints.filter((c) => c.category === category.value).length,
  })).filter((row) => row.value > 0);
}

export function monthlyTrend(complaints: Complaint[], months = 6) {
  const now = new Date();
  const buckets: { label: string; reports: number; resolved: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    buckets.push({
      label: date.toLocaleString("en", { month: "short" }),
      reports: complaints.filter((c) => {
        const created = new Date(c.created_at);
        return created >= date && created < next;
      }).length,
      resolved: complaints.filter((c) => {
        if (!c.resolved_at) return false;
        const resolved = new Date(c.resolved_at);
        return resolved >= date && resolved < next;
      }).length,
    });
  }
  return buckets;
}

export function districtBreakdown(complaints: Complaint[], districts: District[]) {
  return districts
    .map((district) => {
      const rows = complaints.filter((c) => c.district_id === district.id);
      const summary = summarize(rows);
      return {
        id: district.id,
        name: district.name,
        total: summary.total,
        pending: summary.pending,
        critical: summary.critical,
        completed: summary.completed,
        avgResolution: summary.avgResolution,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export function departmentBreakdown(complaints: Complaint[], departments: Department[]) {
  return departments
    .map((department) => {
      const rows = complaints.filter((c) => c.department_id === department.id);
      const summary = summarize(rows);
      return {
        id: department.id,
        name: department.name,
        total: summary.total,
        pending: summary.pending,
        completed: summary.completed,
        avgResolution: summary.avgResolution,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export function officerLoad(complaints: Complaint[], officers: Officer[]) {
  return officers
    .map((officer) => ({
      ...officer,
      openCount: complaints.filter((c) => c.officer_id === officer.id && c.status !== "completed")
        .length,
      closedCount: complaints.filter((c) => c.officer_id === officer.id && c.status === "completed")
        .length,
    }))
    .sort((a, b) => b.resolved_count - a.resolved_count);
}

export function topCategory(complaints: Complaint[]) {
  const counts = new Map<string, number>();
  complaints.forEach((c) => counts.set(c.category, (counts.get(c.category) ?? 0) + 1));
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? categoryLabel(best[0]) : "—";
}

/**
 * Month-over-month change in report volume (%). Returns undefined when there is
 * no prior month to compare against, so KPI cards can hide the chip.
 */
export function volumeDelta(complaints: Complaint[]): number | undefined {
  const trend = monthlyTrend(complaints, 2);
  const previous = trend[0]?.reports ?? 0;
  const current = trend[1]?.reports ?? 0;
  if (!previous) return undefined;
  return ((current - previous) / previous) * 100;
}

/** Month-over-month change in resolved volume (%). */
export function resolvedDelta(complaints: Complaint[]): number | undefined {
  const trend = monthlyTrend(complaints, 2);
  const previous = trend[0]?.resolved ?? 0;
  const current = trend[1]?.resolved ?? 0;
  if (!previous) return undefined;
  return ((current - previous) / previous) * 100;
}
