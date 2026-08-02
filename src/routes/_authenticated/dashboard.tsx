import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { useCurrentProfile } from "@/hooks/useSession";
import { ROLE_META } from "@/lib/civic";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: RoleRouter,
});

function RoleRouter() {
  const { data: me, isLoading } = useCurrentProfile();
  const navigate = useNavigate();

  useEffect(() => {
    if (!me) return;
    navigate({ to: ROLE_META[me.role].home, replace: true });
  }, [me, navigate]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
      <Loader2 className="mr-2 size-5 animate-spin" />
      {isLoading ? "Loading your workspace…" : "Redirecting…"}
    </div>
  );
}
