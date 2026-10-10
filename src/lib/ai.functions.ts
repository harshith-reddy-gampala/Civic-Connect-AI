import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AiUnderstanding } from "@/lib/ai/types";
import { IMAGE_SCREENING_SUSPICIOUS_THRESHOLD, LIMITS } from "@/lib/constants";

/** Columns readable without elevated privileges (reporter contact withheld). */
const COMPLAINT_COLUMNS =
  "id, reference, citizen_id, title, description, category, status, priority, address, lat, lng, district_id, department_id, officer_id, support_count, remarks, ai_priority_score, ai_category_suggestion, ai_assignment_reason, resolved_at, created_at, updated_at";

const imageSchema = z.string().max(8_000_000).optional().nullable();
const imageDataUrlSchema = z
  .string()
  .regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/, "Unsupported image data")
  .max(8_000_000);

/** Module 1 — Complaint understanding (pre-submit, no persistence). */
export const aiAnalyzeComplaint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        title: z.string().max(200).default(""),
        description: z.string().max(2000).default(""),
        address: z.string().max(200).default(""),
        district: z.string().max(120).optional(),
        imageUrl: imageSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { understandComplaint } = await import("@/lib/ai/modules.server");
    return understandComplaint({
      title: data.title,
      description: data.description,
      address: data.address,
      ...(data.district ? { district: data.district } : {}),
      imageUrl: data.imageUrl ?? null,
      dedupeScope: context.userId,
    });
  });

function screeningMessage(verdict: string) {
  if (verdict === "likely_ai_generated") {
    return "This image may be AI-generated. Upload an original camera photo or an unedited source image.";
  }
  if (verdict === "likely_manipulated") {
    return "This image may be heavily manipulated. Upload an original camera photo or an unedited source image.";
  }
  if (verdict === "uncertain") {
    return "Image authenticity screening was inconclusive. Retry with an original camera photo or a clearer source image.";
  }
  return "The image did not pass authenticity screening.";
}

function decodeImageDataUrl(imageDataUrl: string) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/.exec(imageDataUrl);
  if (!match) throw new Error("Only JPEG, PNG, and WebP images are supported.");
  const mimeType = match[1];
  const encoded = match[2];
  if (!mimeType || !encoded) throw new Error("The image data is incomplete.");
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length || buffer.length > LIMITS.imageMaxBytes) {
    throw new Error("Image must be under 5 MB.");
  }
  return { mimeType, buffer };
}

async function cleanupSubmission(input: { storagePath: string; complaintId?: string }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const storageResult = await supabaseAdmin.storage
    .from("complaint-images")
    .remove([input.storagePath]);
  const complaintResult = input.complaintId
    ? await supabaseAdmin.from("complaints").delete().eq("id", input.complaintId)
    : null;
  if (storageResult.error || complaintResult?.error) {
    throw new Error("Submission failed and cleanup could not be completed safely.");
  }
}

/**
 * Final complaint submission boundary. Client analysis is only a preview;
 * relevance and image screening are recomputed before any complaint row exists.
 */
export const submitComplaint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        title: z.string().trim().min(LIMITS.titleMin).max(LIMITS.titleMax),
        description: z.string().trim().min(LIMITS.descriptionMin).max(LIMITS.descriptionMax),
        category: z.enum(["roads", "water", "electricity", "sanitation", "safety", "other"]),
        priority: z.enum(["low", "medium", "high", "critical"]),
        address: z.string().trim().max(LIMITS.addressMax),
        lat: z.number().finite().nullable(),
        lng: z.number().finite().nullable(),
        districtId: z.string().uuid().nullable(),
        departmentId: z.string().uuid().nullable(),
        imageDataUrl: imageDataUrlSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { understandComplaint } = await import("@/lib/ai/modules.server");
    const { buffer, mimeType } = decodeImageDataUrl(data.imageDataUrl);
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("id", context.userId)
      .maybeSingle();
    const understanding = await understandComplaint({
      title: data.title,
      description: data.description,
      address: data.address,
      imageUrl: data.imageDataUrl,
      dedupeScope: context.userId,
    });

    if (!understanding.imageRelevant) {
      throw new Error(
        understanding.imageRelevanceReason ||
          "Upload a clearer photo that visibly supports this civic complaint.",
      );
    }
    const screening = understanding.imageScreening;
    if (
      screening.verdict === "uncertain" ||
      ((screening.verdict === "likely_ai_generated" ||
        screening.verdict === "likely_manipulated") &&
        screening.confidence >= IMAGE_SCREENING_SUSPICIOUS_THRESHOLD)
    ) {
      throw new Error(screeningMessage(screening.verdict));
    }

    const storagePath = `${context.userId}/${crypto.randomUUID()}.jpg`;
    let complaintId: string | undefined;
    try {
      const upload = await context.supabase.storage
        .from("complaint-images")
        .upload(storagePath, new Blob([buffer], { type: mimeType }), {
          contentType: mimeType,
          upsert: false,
        });
      if (upload.error) throw upload.error;

      const { data: complaint, error: complaintError } = await context.supabase
        .from("complaints")
        .insert({
          citizen_id: context.userId,
          title: data.title,
          description: data.description,
          category: data.category,
          priority: data.priority,
          address: data.address,
          lat: data.lat,
          lng: data.lng,
          district_id: data.districtId,
          department_id: data.departmentId,
          reporter_name: profile?.full_name || "Citizen",
          reporter_phone: profile?.phone ?? null,
          ai_priority_score: null,
          ai_category_suggestion: null,
        })
        .select("id")
        .single();
      if (complaintError || !complaint) {
        throw complaintError ?? new Error("Complaint was not created.");
      }
      complaintId = complaint.id;

      const signed = await context.supabase.storage
        .from("complaint-images")
        .createSignedUrl(storagePath, 60 * 60 * 24);
      if (signed.error || !signed.data?.signedUrl) {
        throw signed.error ?? new Error("Could not secure the uploaded image.");
      }

      const { error: imageError } = await context.supabase.from("complaint_images").insert({
        complaint_id: complaint.id,
        image_url: signed.data.signedUrl,
        kind: "before",
        uploaded_by: context.userId,
      });
      if (imageError) throw imageError;

      const { error: historyError } = await context.supabase.from("status_history").insert({
        complaint_id: complaint.id,
        status: "submitted",
        remarks: "Complaint registered by citizen.",
        changed_by: context.userId,
        changed_by_name: profile?.full_name || "Citizen",
      });
      if (historyError) throw historyError;

      return { id: complaint.id, understanding };
    } catch (error) {
      const cleanupInput = complaintId ? { storagePath, complaintId } : { storagePath };
      await cleanupSubmission(cleanupInput);
      throw error;
    }
  });

/** Module 2 — Duplicate detection (pre-submit). */
export const aiCheckDuplicate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        title: z.string().max(200).default(""),
        description: z.string().max(2000).default(""),
        category: z.string().max(40).default("other"),
        address: z.string().max(200).default(""),
        lat: z.number().nullable().default(null),
        lng: z.number().nullable().default(null),
        imageUrl: imageSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { detectDuplicate, distanceMeters } = await import("@/lib/ai/modules.server");
    const supabase = context.supabase;

    const { data: open } = await supabase
      .from("complaints")
      .select(
        "id, reference, title, description, category, address, lat, lng, support_count, status",
      )
      .neq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(60);

    const rows = open ?? [];
    const scored = rows
      .map((row) => ({
        row,
        distance:
          data.lat != null && data.lng != null && row.lat != null && row.lng != null
            ? distanceMeters({ lat: data.lat, lng: data.lng }, { lat: row.lat, lng: row.lng })
            : null,
      }))
      .filter((entry) => entry.distance == null || entry.distance <= 600)
      .sort((a, b) => (a.distance ?? 9e9) - (b.distance ?? 9e9))
      .slice(0, 5);

    const imagesByComplaint = new Map<string, string>();
    if (scored.length) {
      const { data: images } = await supabase
        .from("complaint_images")
        .select("complaint_id, image_url, kind")
        .in(
          "complaint_id",
          scored.map((entry) => entry.row.id),
        )
        .eq("kind", "before");
      for (const image of images ?? []) {
        if (!imagesByComplaint.has(image.complaint_id)) {
          imagesByComplaint.set(image.complaint_id, image.image_url);
        }
      }
    }

    const result = await detectDuplicate({
      newComplaint: {
        title: data.title,
        description: data.description,
        category: data.category,
        address: data.address,
        imageUrl: data.imageUrl ?? null,
      },
      candidates: scored.map((entry) => ({
        id: entry.row.id,
        title: entry.row.title,
        description: entry.row.description,
        category: entry.row.category,
        address: entry.row.address,
        distanceMeters: entry.distance,
        imageUrl: imagesByComplaint.get(entry.row.id) ?? null,
      })),
    });

    const match = scored.find((entry) => entry.row.id === result.complaintId)?.row ?? null;
    return {
      ...result,
      match: match
        ? {
            id: match.id,
            reference: match.reference,
            title: match.title,
            address: match.address,
            status: match.status,
            supportCount: match.support_count,
          }
        : null,
    };
  });

/** Modules 1 + 3 + 4 — full intake triage for a saved complaint. */
export const aiTriageComplaint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        complaintId: z.string().uuid(),
        understanding: z
          .object({
            infrastructureType: z.string(),
            category: z.string(),
            severity: z.enum(["low", "medium", "high", "critical"]),
            suggestedDepartmentCode: z.string(),
            summary: z.string(),
            confidence: z.number(),
            imageRelevant: z.boolean(),
            imageRelevanceReason: z.string(),
            imageScreening: z.object({
              verdict: z.enum([
                "likely_authentic",
                "likely_ai_generated",
                "likely_manipulated",
                "uncertain",
              ]),
              confidence: z.number().min(0).max(1),
              reason: z.string(),
            }),
          })
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { understandComplaint, computePriority, routeComplaint } =
      await import("@/lib/ai/modules.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const supabase = context.supabase;

    const { data: complaint, error } = await supabase
      .from("complaints")
      .select(COMPLAINT_COLUMNS)
      .eq("id", data.complaintId)
      .maybeSingle();
    if (error || !complaint) throw new Error("Complaint not found");

    const [{ data: images }, { data: departments }, { data: districts }, { data: officers }] =
      await Promise.all([
        supabase
          .from("complaint_images")
          .select("image_url")
          .eq("complaint_id", complaint.id)
          .eq("kind", "before")
          .limit(1),
        supabase.from("departments").select("id, name, code, category"),
        supabase.from("districts").select("id, name, center_lat, center_lng"),
        supabase
          .from("officers")
          .select(
            "id, profile_id, full_name, department_id, district_id, active_count, avg_resolution_hours, rating",
          ),
      ]);

    const districtName = (districts ?? []).find((d) => d.id === complaint.district_id)?.name;

    const understanding: AiUnderstanding = await understandComplaint({
      title: complaint.title,
      description: complaint.description,
      address: complaint.address,
      ...(districtName ? { district: districtName } : {}),
      imageUrl: images?.[0]?.image_url ?? null,
      dedupeScope: context.userId,
    });

    const hoursPending = (Date.now() - new Date(complaint.created_at).getTime()) / 3_600_000;
    const priority = await computePriority({
      title: complaint.title,
      description: complaint.description,
      category: understanding.category,
      severity: understanding.severity,
      supporters: complaint.support_count,
      hoursPending,
    });

    const routing = await routeComplaint({
      complaint: {
        title: complaint.title,
        category: understanding.category,
        severity: priority.priority,
        address: complaint.address,
        lat: complaint.lat,
        lng: complaint.lng,
      },
      departments: departments ?? [],
      districts: districts ?? [],
      officers: officers ?? [],
    });

    await supabase
      .from("complaints")
      .update({
        category: understanding.category,
        priority: priority.priority,
        department_id: routing.departmentId,
        district_id: routing.districtId ?? complaint.district_id,
        officer_id: routing.officerId,
        status: routing.officerId ? "assigned" : "under_review",
        ai_priority_score: priority.score,
        ai_category_suggestion: `${understanding.infrastructureType} · ${understanding.category} (${Math.round(
          understanding.confidence * 100,
        )}% confidence)`,
        ai_assignment_reason: routing.reason,
      })
      .eq("id", complaint.id);

    await supabase.from("status_history").insert({
      complaint_id: complaint.id,
      status: routing.officerId ? "assigned" : "under_review",
      remarks: `AI triage: ${understanding.summary} Routed to ${routing.departmentName} · ${routing.officerName}.`,
      changed_by: context.userId,
      changed_by_name: "CivicAI",
    });

    if (routing.officerId) {
      const assignedOfficer = (officers ?? []).find((row) => row.id === routing.officerId);
      if (assignedOfficer?.profile_id) {
        const { data: existingNotifications } = await supabaseAdmin
          .from("notifications")
          .select("id")
          .eq("user_id", assignedOfficer.profile_id)
          .eq("complaint_id", complaint.id)
          .eq("title", "Complaint assigned")
          .limit(1);

        if (!(existingNotifications ?? []).length) {
          await supabaseAdmin.from("notifications").insert({
            user_id: assignedOfficer.profile_id,
            title: "Complaint assigned",
            message: `${complaint.title} has been assigned to ${routing.officerName}.`,
            complaint_id: complaint.id,
          });
        }
      }
    }

    return { understanding, priority, routing };
  });

/** Module 3 — recompute priority for an existing complaint. */
export const aiRecomputePriority = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ complaintId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { computePriority } = await import("@/lib/ai/modules.server");
    const supabase = context.supabase;

    const { data: complaint } = await supabase
      .from("complaints")
      .select(COMPLAINT_COLUMNS)
      .eq("id", data.complaintId)
      .maybeSingle();
    if (!complaint) throw new Error("Complaint not found");

    const priority = await computePriority({
      title: complaint.title,
      description: complaint.description,
      category: complaint.category,
      severity: complaint.priority,
      supporters: complaint.support_count,
      hoursPending: (Date.now() - new Date(complaint.created_at).getTime()) / 3_600_000,
    });

    await supabase
      .from("complaints")
      .update({ priority: priority.priority, ai_priority_score: priority.score })
      .eq("id", complaint.id);

    return priority;
  });

/** Module 5 — repair verification from before/after photos. */
export const aiVerifyRepair = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        complaintId: z.string().uuid(),
        afterImageUrl: z.string().max(8_000_000),
        remarks: z.string().max(500).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { verifyRepair } = await import("@/lib/ai/modules.server");
    const supabase = context.supabase;

    const [{ data: complaint }, { data: images }] = await Promise.all([
      supabase
        .from("complaints")
        .select("title, description, category, officer_id")
        .eq("id", data.complaintId)
        .maybeSingle(),
      supabase
        .from("complaint_images")
        .select("image_url, kind, created_at")
        .eq("complaint_id", data.complaintId)
        .eq("kind", "before")
        .order("created_at", { ascending: true })
        .limit(1),
    ]);

    if (!complaint) throw new Error("Complaint not found");
    const before = images?.[0]?.image_url;
    if (!before) {
      await supabase
        .from("complaints")
        .update({ repair_verification_status: "needs_reinspection" })
        .eq("id", data.complaintId);
      return {
        verdict: "needs_reinspection" as const,
        confidence: 0.3,
        notes: "No original photo was attached to this report, so the repair cannot be compared.",
        observations: ["Missing before image"],
      };
    }

    const result = await verifyRepair({
      title: complaint.title,
      description: complaint.description,
      category: complaint.category,
      remarks: data.remarks,
      beforeImageUrl: before,
      afterImageUrl: data.afterImageUrl,
    });

    await supabase
      .from("complaints")
      .update({
        repair_verification_status:
          result.verdict === "repair_completed" ? "verified" : "needs_reinspection",
      })
      .eq("id", data.complaintId);

    if (result.verdict === "needs_reinspection" && complaint.officer_id) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: officer } = await supabase
        .from("officers")
        .select("profile_id")
        .eq("id", complaint.officer_id)
        .maybeSingle();

      if (officer?.profile_id) {
        const { data: existingNotifications } = await supabaseAdmin
          .from("notifications")
          .select("id")
          .eq("user_id", officer.profile_id)
          .eq("complaint_id", data.complaintId)
          .eq("title", "Repair needs reinspection")
          .limit(1);

        if (!(existingNotifications ?? []).length) {
          await supabaseAdmin.from("notifications").insert({
            user_id: officer.profile_id,
            title: "Repair needs reinspection",
            message: `The repair for ${complaint.title} needs another inspection before completion.`,
            complaint_id: data.complaintId,
          });
        }
      }
    }

    return result;
  });

/**
 * Authenticated officer status boundary. Completion is authorized only after
 * this server function rechecks the persisted before image and the submitted
 * after image; client verification flags are never accepted.
 */
export const updateComplaintStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        complaintId: z.string().uuid(),
        status: z.enum(["submitted", "under_review", "assigned", "in_progress", "completed"]),
        remarks: z.string().max(500).default(""),
        afterImageDataUrl: imageDataUrlSchema.optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { verifyRepair } = await import("@/lib/ai/modules.server");
    const [{ data: complaint }, { data: officer }, { data: profile }] = await Promise.all([
      context.supabase
        .from("complaints")
        .select("id, title, description, category, officer_id, citizen_id")
        .eq("id", data.complaintId)
        .maybeSingle(),
      context.supabase
        .from("officers")
        .select("id")
        .eq("profile_id", context.userId)
        .maybeSingle(),
      context.supabase.from("profiles").select("full_name").eq("id", context.userId).maybeSingle(),
    ]);

    if (!complaint || !officer || complaint.officer_id !== officer.id) {
      throw new Error("You are not authorized to update this complaint.");
    }

    if (data.status === "completed" && !data.afterImageDataUrl) {
      throw new Error("Completion requires an after-repair photo.");
    }

    const { data: beforeImages } = await context.supabase
      .from("complaint_images")
      .select("image_url")
      .eq("complaint_id", data.complaintId)
      .eq("kind", "before")
      .order("created_at", { ascending: true })
      .limit(1);
    const beforeImageUrl = beforeImages?.[0]?.image_url;

    if (data.status === "completed" && !beforeImageUrl) {
      throw new Error("Completion requires the original complaint photo.");
    }

    if (data.status === "completed" && beforeImageUrl && data.afterImageDataUrl) {
      const verification = await verifyRepair({
        title: complaint.title,
        description: complaint.description,
        category: complaint.category,
        remarks: data.remarks,
        beforeImageUrl,
        afterImageUrl: data.afterImageDataUrl,
      });
      if (verification.verdict !== "repair_completed") {
        throw new Error("Repair must be reinspected before this issue can be completed.");
      }
    }

    const decodedAfter = data.afterImageDataUrl
      ? decodeImageDataUrl(data.afterImageDataUrl)
      : null;
    const storagePath = decodedAfter
      ? `${context.userId}/${crypto.randomUUID()}.jpg`
      : null;
    let insertedImageId: string | undefined;

    try {
      if (decodedAfter && storagePath) {
        const upload = await context.supabase.storage
          .from("complaint-images")
          .upload(storagePath, new Blob([decodedAfter.buffer], { type: decodedAfter.mimeType }), {
            contentType: decodedAfter.mimeType,
            upsert: false,
          });
        if (upload.error) throw upload.error;

        const signed = await context.supabase.storage
          .from("complaint-images")
          .createSignedUrl(storagePath, 60 * 60 * 24);
        if (signed.error || !signed.data?.signedUrl) {
          throw signed.error ?? new Error("Could not secure the uploaded image.");
        }

        const { data: image, error: imageError } = await context.supabase
          .from("complaint_images")
          .insert({
            complaint_id: data.complaintId,
            image_url: signed.data.signedUrl,
            kind: "after",
            uploaded_by: context.userId,
          })
          .select("id")
          .single();
        if (imageError || !image) throw imageError ?? new Error("Could not save repair evidence.");
        insertedImageId = image.id;
      }

      const { error: complaintError } = await context.supabase
        .from("complaints")
        .update({
          status: data.status,
          remarks: data.remarks || null,
          repair_verification_status: data.status === "completed" ? "verified" : null,
          resolved_at: data.status === "completed" ? new Date().toISOString() : null,
        })
        .eq("id", data.complaintId);
      if (complaintError) throw complaintError;

      const { error: historyError } = await context.supabase.from("status_history").insert({
        complaint_id: data.complaintId,
        status: data.status,
        remarks: data.remarks || null,
        changed_by: context.userId,
        changed_by_name: profile?.full_name || "Field officer",
      });
      if (historyError) throw historyError;

      return { citizenId: complaint.citizen_id };
    } catch (error) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      if (storagePath) await supabaseAdmin.storage.from("complaint-images").remove([storagePath]);
      if (insertedImageId) await supabaseAdmin.from("complaint_images").delete().eq("id", insertedImageId);
      throw error;
    }
  });

/** Module 6 — predictive preventive-maintenance insights. */
export const aiPredictiveInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ months: z.number().min(1).max(24).default(6) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { generateInsights } = await import("@/lib/ai/modules.server");
    const supabase = context.supabase;

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const isAdmin = (roles ?? []).some((row) => row.role === "department_admin");

    if (!isAdmin) {
      throw new Error("Not permitted to generate predictive insights.");
    }

    const since = new Date(Date.now() - data.months * 30 * 86_400_000).toISOString();
    const [{ data: complaints }, { data: districts }] = await Promise.all([
      supabase
        .from("complaints")
        .select("category, status, priority, district_id, created_at, resolved_at")
        .gte("created_at", since),
      supabase.from("districts").select("id, name"),
    ]);

    const rows = complaints ?? [];
    const districtName = (id: string | null) =>
      (districts ?? []).find((d) => d.id === id)?.name ?? "Unmapped";

    const categoryMap = new Map<string, { total: number; completed: number; hours: number[] }>();
    const districtMap = new Map<
      string,
      { total: number; critical: number; categories: Set<string> }
    >();
    const recurringMap = new Map<string, number>();

    for (const row of rows) {
      const cat = categoryMap.get(row.category) ?? { total: 0, completed: 0, hours: [] };
      cat.total += 1;
      if (row.status === "completed") {
        cat.completed += 1;
        if (row.resolved_at) {
          cat.hours.push(
            (new Date(row.resolved_at).getTime() - new Date(row.created_at).getTime()) / 3_600_000,
          );
        }
      }
      categoryMap.set(row.category, cat);

      const name = districtName(row.district_id);
      const dist = districtMap.get(name) ?? {
        total: 0,
        critical: 0,
        categories: new Set<string>(),
      };
      dist.total += 1;
      if (row.priority === "critical") dist.critical += 1;
      dist.categories.add(row.category);
      districtMap.set(name, dist);

      const key = `${name}|${row.category}`;
      recurringMap.set(key, (recurringMap.get(key) ?? 0) + 1);
    }

    return generateInsights({
      totalComplaints: rows.length,
      windowMonths: data.months,
      byCategory: [...categoryMap.entries()].map(([category, value]) => ({
        category,
        total: value.total,
        completed: value.completed,
        avgResolutionHours: value.hours.length
          ? Math.round(value.hours.reduce((a, b) => a + b, 0) / value.hours.length)
          : 0,
      })),
      byDistrict: [...districtMap.entries()].map(([district, value]) => ({
        district,
        total: value.total,
        critical: value.critical,
        repeatCategories: [...value.categories],
      })),
      recurring: [...recurringMap.entries()]
        .filter(([, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([key, count]) => {
          const [district, category] = key.split("|");
          return { district: district ?? "Unmapped", category: category ?? "other", count };
        }),
    });
  });
