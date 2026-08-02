import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Reporter contact details are withheld from the general data API. Only the
 * reporter themselves, the assigned field officer, or a department admin may
 * read them — verified server-side here before any privileged read.
 */
export const getReporterContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ complaintId: z.string().uuid() }).parse(input))
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

    if (!complaint) return { allowed: false as const, name: null, phone: null };

    const isAdmin = (roles ?? []).some((row) => row.role === "department_admin");
    const allowed =
      complaint.citizen_id === context.userId ||
      isAdmin ||
      (!!officer?.id && complaint.officer_id === officer.id);

    if (!allowed) return { allowed: false as const, name: null, phone: null };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: contact } = await supabaseAdmin
      .from("complaints")
      .select("reporter_name, reporter_phone")
      .eq("id", data.complaintId)
      .maybeSingle();

    return {
      allowed: true as const,
      name: contact?.reporter_name ?? null,
      phone: contact?.reporter_phone ?? null,
    };
  });
