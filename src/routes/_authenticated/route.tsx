import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/AppShell";
import { DataErrorState } from "@/components/civic/ErrorBoundary";
import { DetailSkeleton } from "@/components/civic/skeletons";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/civic";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    const { data: roleRow, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (roleError || !roleRow?.role) throw redirect({ to: "/auth" });
    return { user: data.user, role: roleRow.role as AppRole };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
  pendingComponent: () => (
    <AppShell>
      <DetailSkeleton />
    </AppShell>
  ),
  errorComponent: ({ error, reset }) => (
    <AppShell>
      <DataErrorState
        title="This workspace view failed to load"
        message={error instanceof Error ? error.message : undefined}
        onRetry={reset}
      />
    </AppShell>
  ),
});
