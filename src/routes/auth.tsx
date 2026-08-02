import { useMemo, useState } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { authService } from "@/integrations/auth/index";
import { ROLE_META, type AppRole } from "@/lib/civic";

const authSearch = z.object({ mode: z.enum(["signin", "signup"]).optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: authSearch,
  head: () => ({
    meta: [
      { title: "Sign in — CivicAI" },
      {
        name: "description",
        content:
          "Access the CivicAI workspace as a citizen, department admin or field officer to report and resolve infrastructure issues.",
      },
      { property: "og:title", content: "Sign in — CivicAI" },
      {
        property: "og:description",
        content: "Role-based access for citizens, departments and field officers.",
      },
    ],
  }),
  component: AuthPage,
});

type FormValues = { fullName: string; email: string; password: string; phone: string };

function AuthPage() {
  const search = useSearch({ from: "/auth" });
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">(search.mode ?? "signin");
  const [role, setRole] = useState<AppRole>("citizen");
  const [pending, setPending] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  const { register, handleSubmit, formState } = useForm<FormValues>({
    defaultValues: { fullName: "", email: "", password: "", phone: "" },
  });

  const roles = useMemo(() => Object.entries(ROLE_META) as [AppRole, typeof ROLE_META.citizen][], []);

  async function onSubmit(values: FormValues) {
    setPending(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: values.email.trim(),
          password: values.password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: values.fullName.trim(), phone: values.phone.trim(), role },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setConfirmSent(true);
          return;
        }
        navigate({ to: ROLE_META[role].home });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: values.email.trim(),
          password: values.password,
        });
        if (error) throw error;
        navigate({ to: "/dashboard" });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Authentication failed";
      toast.error(
        /invalid login credentials/i.test(message)
          ? "Email or password is incorrect. If you just created an account, try signing up again."
          : message,
      );
    } finally {
      setPending(false);
    }
  }

  async function googleSignIn() {
    const result = await authService.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Google sign-in failed");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="hero-gradient relative hidden flex-col justify-between p-10 lg:flex">
        <div className="grid-lines absolute inset-0 opacity-60" />
        <div className="relative flex items-center gap-3 text-sidebar-foreground">
          <span className="grid size-10 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
            <ShieldCheck className="size-5" />
          </span>
          <div>
            <p className="font-display text-lg font-bold">CivicAI</p>
            <p className="text-xs text-sidebar-foreground/60">Public Infrastructure Intelligence</p>
          </div>
        </div>
        <div className="relative max-w-md text-sidebar-foreground">
          <h2 className="font-display text-3xl leading-tight font-bold">
            One platform for citizens, departments and field crews.
          </h2>
          <p className="mt-4 text-sm text-sidebar-foreground/70">
            Report an issue in under a minute, track it through five verified stages, and give
            departments live district intelligence instead of spreadsheets.
          </p>
          <dl className="mt-8 grid grid-cols-3 gap-4 text-sidebar-foreground">
            {[
              ["5", "resolution stages"],
              ["3", "role workspaces"],
              ["100%", "audit trail"],
            ].map(([value, label]) => (
              <div key={label}>
                <dt className="font-display text-2xl font-bold">{value}</dt>
                <dd className="text-[11px] text-sidebar-foreground/60 uppercase">{label}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="relative text-[11px] text-sidebar-foreground/45">
          Secure role-based access · Verified status history
        </p>
      </div>

      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <div className="surface-card p-6 sm:p-8">
            <div className="flex rounded-xl bg-muted p-1">
              {(["signin", "signup"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setMode(option);
                    setConfirmSent(false);
                  }}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                    mode === option
                      ? "bg-card text-foreground shadow-card"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {option === "signin" ? "Sign in" : "Create account"}
                </button>
              ))}
            </div>

            {confirmSent ? (
              <div className="mt-6 space-y-3 text-sm">
                <h2 className="text-lg font-semibold">Confirm your email</h2>
                <p className="text-muted-foreground">
                  We sent a confirmation link to your inbox. Click it to activate your CivicAI
                  workspace, then sign in.
                </p>
                <Button variant="outline" onClick={() => setMode("signin")} className="w-full">
                  Back to sign in
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
                {mode === "signup" ? (
                  <>
                    <div className="space-y-2">
                      <Label>Choose your workspace</Label>
                      <div className="grid gap-2">
                        {roles.map(([value, meta]) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setRole(value)}
                            className={`rounded-xl border p-3 text-left transition-colors ${
                              role === value
                                ? "border-primary bg-primary/5"
                                : "border-border hover:bg-muted"
                            }`}
                          >
                            <p className="text-sm font-semibold">{meta.label}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{meta.description}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fullName">Full name</Label>
                      <Input
                        id="fullName"
                        autoComplete="name"
                        {...register("fullName", { required: true, maxLength: 100 })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone (optional)</Label>
                      <Input id="phone" autoComplete="tel" {...register("phone", { maxLength: 20 })} />
                    </div>
                  </>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    {...register("email", { required: true, maxLength: 255 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    {...register("password", { required: true, minLength: 6, maxLength: 72 })}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={pending || formState.isSubmitting}>
                  {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  {mode === "signup" ? "Create workspace" : "Sign in"}
                </Button>

                <div className="relative py-1 text-center">
                  <span className="relative z-10 bg-card px-3 text-xs text-muted-foreground">or</span>
                  <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
                </div>

                <Button type="button" variant="outline" className="w-full" onClick={googleSignIn}>
                  Continue with Google
                </Button>
              </form>
            )}
          </div>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Department and officer accounts are provisioned by your municipal administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
