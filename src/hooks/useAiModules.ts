import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  aiAnalyzeComplaint,
  aiCheckDuplicate,
  aiPredictiveInsights,
  aiRecomputePriority,
  aiTriageComplaint,
  aiVerifyRepair,
} from "@/lib/ai.functions";

export async function fileToDataUrl(file: File, maxSide = 1024): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read the selected image");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

function aiError(error: unknown) {
  const message = error instanceof Error ? error.message : "AI request failed";
  return message.replace(/^Error:\s*/, "");
}

/** Module 1 */
export function useAiUnderstanding() {
  const analyze = useServerFn(aiAnalyzeComplaint);
  return useMutation({
    mutationFn: (input: {
      title: string;
      description: string;
      address: string;
      district?: string;
      imageUrl?: string | null;
    }) => analyze({ data: input }),
    onError: (error) => toast.error(aiError(error)),
  });
}

/** Module 2 */
export function useAiDuplicateCheck() {
  const check = useServerFn(aiCheckDuplicate);
  return useMutation({
    mutationFn: (input: {
      title: string;
      description: string;
      category: string;
      address: string;
      lat: number | null;
      lng: number | null;
      imageUrl?: string | null;
    }) => check({ data: input }),
    onError: (error) => toast.error(aiError(error)),
  });
}

/** Modules 1 + 3 + 4 */
export function useAiTriage() {
  const qc = useQueryClient();
  const triage = useServerFn(aiTriageComplaint);
  return useMutation({
    mutationFn: (complaintId: string) => triage({ data: { complaintId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["complaint"] });
      qc.invalidateQueries({ queryKey: ["complaints"] });
    },
    onError: (error) => toast.error(aiError(error)),
  });
}

/** Module 3 */
export function useAiPriority() {
  const qc = useQueryClient();
  const recompute = useServerFn(aiRecomputePriority);
  return useMutation({
    mutationFn: (complaintId: string) => recompute({ data: { complaintId } }),
    onSuccess: () => {
      toast.success("Priority recalculated");
      qc.invalidateQueries({ queryKey: ["complaint"] });
      qc.invalidateQueries({ queryKey: ["complaints"] });
    },
    onError: (error) => toast.error(aiError(error)),
  });
}

/** Module 5 */
export function useAiRepairVerification() {
  const verify = useServerFn(aiVerifyRepair);
  return useMutation({
    mutationFn: (input: { complaintId: string; afterImageUrl: string; remarks?: string }) =>
      verify({
        data: {
          complaintId: input.complaintId,
          afterImageUrl: input.afterImageUrl,
          remarks: input.remarks ?? "",
        },
      }),
    onError: (error) => toast.error(aiError(error)),
  });
}

/** Module 6 */
export function useAiInsights(months = 6, enabled = true) {
  const insights = useServerFn(aiPredictiveInsights);
  return useQuery({
    queryKey: ["ai-insights", months],
    enabled,
    staleTime: 15 * 60 * 1000,
    retry: 1,
    queryFn: () => insights({ data: { months } }),
  });
}
