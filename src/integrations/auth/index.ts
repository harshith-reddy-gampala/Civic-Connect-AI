// Authentication integration and OAuth helper.
// Uses native Supabase OAuth flows for external provider sign-in.

import { supabase } from "../supabase/client";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

export const authService = {
  signInWithOAuth: async (provider: "google" | "apple" | "microsoft", opts?: SignInOptions) => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: opts?.redirect_uri ?? window.location.origin,
        queryParams: opts?.extraParams,
      },
    });

    if (error) {
      return { error };
    }

    if (data?.url) {
      window.location.assign(data.url);
      return { redirected: true };
    }

    return { redirected: false };
  },
};
