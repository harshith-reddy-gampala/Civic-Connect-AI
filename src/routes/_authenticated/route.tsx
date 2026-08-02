import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/AppShell";
import { DataErrorState } from "@/components/civic/ErrorBoundary";
import { DetailSkeleton } from "@/components/civic/skeletons";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
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
