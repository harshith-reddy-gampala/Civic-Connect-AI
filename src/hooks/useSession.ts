import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/civic";
import { OFFICER_COLUMNS } from "@/lib/queries";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, user: session?.user ?? null, ready };
}

export function useCurrentProfile() {
  const { user } = useSession();

  return useQuery({
    queryKey: ["me", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const [profileRes, roleRes, officerRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user!.id).limit(1).maybeSingle(),
        supabase.from("officers").select(OFFICER_COLUMNS).eq("profile_id", user!.id).maybeSingle(),
      ]);

      return {
        profile: profileRes.data,
        role: (roleRes.data?.role ?? "citizen") as AppRole,
        officer: officerRes.data,
        email: user!.email ?? "",
      };
    },
  });
}
