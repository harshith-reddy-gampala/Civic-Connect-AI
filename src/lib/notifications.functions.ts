import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server-side notification helper for officer-to-citizen status updates.
 *
 * Cross-user notification inserts are intentionally routed through this
 * authenticated server function so the client cannot write arbitrary rows into
 * public.notifications. The handler authorizes the caller by checking that they
 * are the assigned field officer (or department admin) for the complaint.
 */
export const notifyComplaintCitizen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        complaintId: z.string().uuid(),
        title: z.string().min(1).max(200),
        message: z.string().max(500).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;

    const [{ data: complaint }, { data: roles }, { data: officer }] = await Promise.all([
      supabase
        .from("complaints")
        .select("id, citizen_id, officer_id")
        .eq("id", data.complaintId)
        .maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", context.userId),
      supabase.from("officers").select("id").eq("profile_id", context.userId).maybeSingle(),
    ]);

    if (!complaint) throw new Error("Complaint not found");

    const isAdmin = (roles ?? []).some((row) => row.role === "department_admin");
    const isAssignedOfficer = !!officer?.id && complaint.officer_id === officer.id;

    if (!isAdmin && !isAssignedOfficer) {
      throw new Error("Not permitted to notify the complaint owner.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("notifications")
      .select("id")
      .eq("complaint_id", complaint.id)
      .eq("user_id", complaint.citizen_id)
      .eq("title", data.title)
      .limit(1);

    if ((existing ?? []).length) {
      return { created: false };
    }

    const { error } = await supabaseAdmin.from("notifications").insert({
      user_id: complaint.citizen_id,
      title: data.title,
      message: data.message,
      complaint_id: complaint.id,
    });

    if (error) throw error;

    return { created: true };
  });
