import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

/**
 * Live workspace sync for the signed-in user.
 *
 * - New rows in `notifications` for this user raise a toast and refresh the bell.
 * - Any change to `complaints` invalidates list/detail caches so citizen,
 *   officer and department views stay in step without polling.
 *
 * Channels are created once per user and torn down on unmount to avoid
 * duplicate subscriptions.
 */
export function useRealtimeWorkspace(userId?: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`workspace:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as { title?: string; message?: string };
          queryClient.invalidateQueries({ queryKey: ["notifications"] });
          if (row.title) {
            toast(row.title, {
              description: row.message ?? undefined,
            });
          }
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "complaints" }, () => {
        queryClient.invalidateQueries({ queryKey: ["complaints"] });
        queryClient.invalidateQueries({ queryKey: ["complaint"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "status_history" }, () => {
        queryClient.invalidateQueries({ queryKey: ["complaint"] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);
}
