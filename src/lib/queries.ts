import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { ComplaintStatus } from "@/lib/civic";
import { STALE_TIME } from "@/lib/constants";
import type { Tables } from "@/integrations/supabase/types";
import { notifyComplaintCitizen } from "@/lib/notifications.functions";
import { submitComplaint, updateComplaintStatus } from "@/lib/ai.functions";

export type District = Tables<"districts">;
export type Department = Tables<"departments">;
/** Personal fields (officer phone, reporter contact, actor/uploader ids) are not
 * readable through the client data API, so app types exclude them. */
export type Officer = Omit<Tables<"officers">, "phone">;
export type Complaint = Omit<Tables<"complaints">, "reporter_name" | "reporter_phone">;
export type StatusHistory = Omit<Tables<"status_history">, "changed_by">;
export type Notification = Tables<"notifications">;
export type ComplaintImage = Omit<Tables<"complaint_images">, "uploaded_by">;

/** Columns readable by any signed-in user. Reporter contact details are withheld
 * at the database level and fetched separately by authorised parties. */
export const COMPLAINT_COLUMNS =
  "id, reference, citizen_id, title, description, category, status, priority, address, lat, lng, district_id, department_id, officer_id, support_count, remarks, ai_priority_score, ai_category_suggestion, ai_assignment_reason, resolved_at, created_at, updated_at";
export const HISTORY_COLUMNS = "id, complaint_id, status, remarks, changed_by_name, created_at";
export const IMAGE_COLUMNS = "id, complaint_id, image_url, kind, created_at";
export const OFFICER_COLUMNS =
  "id, profile_id, full_name, employee_code, department_id, district_id, resolved_count, active_count, avg_resolution_hours, rating, created_at";

export function useDistricts() {
  return useQuery({
    queryKey: ["districts"],
    staleTime: STALE_TIME.reference,
    queryFn: async () => {
      const { data, error } = await supabase.from("districts").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useDepartments() {
  return useQuery({
    queryKey: ["departments"],
    staleTime: STALE_TIME.reference,
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useOfficers() {
  return useQuery({
    queryKey: ["officers"],
    staleTime: STALE_TIME.reference,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("officers")
        .select(OFFICER_COLUMNS)
        .order("resolved_count", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Complaint list. `limit` caps the payload for dashboard widgets; full list
 * views paginate client-side from the cached window.
 */
export function useComplaints(filters?: {
  citizenId?: string;
  officerId?: string;
  districtId?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ["complaints", filters ?? null],
    staleTime: STALE_TIME.list,
    queryFn: async () => {
      let query = supabase
        .from("complaints")
        .select(COMPLAINT_COLUMNS)
        .order("created_at", { ascending: false });
      if (filters?.citizenId) query = query.eq("citizen_id", filters.citizenId);
      if (filters?.officerId) query = query.eq("officer_id", filters.officerId);
      if (filters?.districtId) query = query.eq("district_id", filters.districtId);
      if (filters?.limit) query = query.limit(filters.limit);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useComplaint(id: string) {
  return useQuery({
    queryKey: ["complaint", id],
    staleTime: STALE_TIME.detail,
    queryFn: async () => {
      const [complaint, history, images] = await Promise.all([
        supabase.from("complaints").select(COMPLAINT_COLUMNS).eq("id", id).maybeSingle(),
        supabase
          .from("status_history")
          .select(HISTORY_COLUMNS)
          .eq("complaint_id", id)
          .order("created_at", { ascending: true }),
        supabase.from("complaint_images").select(IMAGE_COLUMNS).eq("complaint_id", id),
      ]);
      if (complaint.error) throw complaint.error;
      return {
        complaint: complaint.data,
        history: history.data ?? [],
        images: images.data ?? [],
      };
    },
  });
}

export function useMySupports(citizenId?: string) {
  return useQuery({
    queryKey: ["supports", citizenId],
    enabled: !!citizenId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("complaint_supports")
        .select("complaint_id")
        .eq("citizen_id", citizenId!);
      if (error) throw error;
      return data.map((row) => row.complaint_id);
    },
  });
}

export function useSupportComplaint(citizenId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (complaintId: string) => {
      if (!citizenId) throw new Error("Sign in to support a report");
      const { error } = await supabase
        .from("complaint_supports")
        .insert({ complaint_id: complaintId, citizen_id: citizenId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Support added — no duplicate report created");
      qc.invalidateQueries({ queryKey: ["complaints"] });
      qc.invalidateQueries({ queryKey: ["supports"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useNotifications(userId?: string) {
  return useQuery({
    queryKey: ["notifications", userId],
    enabled: !!userId,
    staleTime: STALE_TIME.notifications,
    queryFn: async () => {
      // RLS already scopes rows to the caller; the explicit filter keeps the
      // index in play and makes intent obvious.
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });
}

export function useMarkAllNotificationsRead(userId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!userId) return;
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", userId)
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("All notifications marked as read");
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useUpdateComplaintStatus(actor: { id?: string | undefined; name: string }) {
  const qc = useQueryClient();
  const notifyCitizen = useServerFn(notifyComplaintCitizen);
  const updateStatus = useServerFn(updateComplaintStatus);

  return useMutation({
    mutationFn: async (input: {
      complaintId: string;
      status: ComplaintStatus;
      remarks?: string | undefined;
      afterImageDataUrl?: string | null;
      citizenId?: string | null;
    }) => {
      const result = await updateStatus({
        data: {
          complaintId: input.complaintId,
          status: input.status,
          remarks: input.remarks ?? "",
          afterImageDataUrl: input.afterImageDataUrl ?? null,
        },
      });

      const citizenId = result.citizenId ?? input.citizenId;
      if (citizenId && (input.status === "in_progress" || input.status === "completed")) {
        await notifyCitizen({
          data: {
            complaintId: input.complaintId,
            title: `Status updated: ${input.status.replace(/_/g, " ")}`,
            message: input.remarks || "Your report has a new update from the field team.",
          },
        });
      }
    },
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["complaints"] });
      qc.invalidateQueries({ queryKey: ["complaint"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export async function uploadComplaintImage(file: File, userId: string) {
  const path = `${userId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
  const { error } = await supabase.storage.from("complaint-images").upload(path, file);
  if (error) throw error;
  const { data } = await supabase.storage
    .from("complaint-images")
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  return data?.signedUrl ?? null;
}

export function useCreateComplaint(citizenId?: string) {
  const qc = useQueryClient();
  const submit = useServerFn(submitComplaint);
  return useMutation({
    mutationFn: async (input: {
      title: string;
      description: string;
      category: string;
      priority: "low" | "medium" | "high" | "critical";
      address: string;
      lat: number | null;
      lng: number | null;
      districtId: string | null;
      departmentId: string | null;
      imageDataUrl: string;
    }) => {
      if (!citizenId) throw new Error("Sign in to submit a report");
      const result = await submit({
        data: {
          title: input.title,
          description: input.description,
          category: input.category,
          priority: input.priority,
          address: input.address,
          lat: input.lat,
          lng: input.lng,
          districtId: input.districtId,
          departmentId: input.departmentId,
          imageDataUrl: input.imageDataUrl,
        },
      });
      return result.id;
    },
    onSuccess: () => {
      toast.success("Report submitted");
      qc.invalidateQueries({ queryKey: ["complaints"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

/**
 * Latest status transitions across the city — powers the "recent activity"
 * feeds. Kept to a small window so the payload stays light.
 */
export function useRecentActivity(limit = 8) {
  return useQuery({
    queryKey: ["activity", limit],
    staleTime: STALE_TIME.list,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("status_history")
        .select(`${HISTORY_COLUMNS}, complaints(title, reference)`)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as (StatusHistory & {
        complaints: { title: string; reference: string } | null;
      })[];
    },
  });
}
