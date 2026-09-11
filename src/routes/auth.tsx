import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { ArrowLeft, BriefcaseBusiness, HardHat, Loader2, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

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
type AuthRole = "citizen" | "field_officer" | "department_admin";

const ROLE_OPTIONS: { value: AuthRole; label: string; description: string; icon: typeof UserRound }[] = [
  { value: "citizen", label: "Citizen", description: "Report and track civic issues", icon: UserRound },
  { value: "field_officer", label: "Field Officer", description: "Manage assigned civic issues", icon: HardHat },
  { value: "department_admin", label: "Admin", description: "Monitor city-wide operations", icon: BriefcaseBusiness },
];

function AuthPage() {
  const search = useSearch({ from: "/auth" });
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState<AuthRole | null>(null);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [pending, setPending] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  const { register, handleSubmit, formState } = useForm<FormValues>({
    defaultValues: { fullName: "", email: "", password: "", phone: "" },
  });

  useEffect(() => {
    let active = true;

    const redirectVerifiedUser = async () => {
      const { data } = await supabase.auth.getSession();
      if (active && data.session?.user.email_confirmed_at) {
        navigate({ to: "/citizen", replace: true });
      }
    };

    redirectVerifiedUser();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        active &&
        (event === "SIGNED_IN" || event === "USER_UPDATED") &&
        session?.user.email_confirmed_at
      ) {
        navigate({ to: "/citizen", replace: true });
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  function selectRole(role: AuthRole) {
    setSelectedRole(role);
    setMode("signin");
    setConfirmSent(false);
  }

  async function onSubmit(values: FormValues) {
    setPending(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: values.email.trim(),
          password: values.password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth?mode=signin`,
            data: { full_name: values.fullName.trim(), phone: values.phone.trim() },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setConfirmSent(true);
          return;
        }
        navigate({ to: "/citizen" });
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
            {selectedRole === null ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h1 className="text-lg font-semibold">Choose your role</h1>
                    <p className="mt-1 text-sm text-muted-foreground">Select a workspace to continue.</p>
                  </div>
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/">
                      <ArrowLeft className="mr-1.5 size-4" /> Back
                    </Link>
                  </Button>
                </div>
                <div className="grid gap-3">
                  {ROLE_OPTIONS.map((role) => (
                    <button
                      key={role.value}
                      type="button"
                      onClick={() => selectRole(role.value)}
                      className="flex items-center gap-3 rounded-xl border border-border p-4 text-left transition-colors hover:border-primary/50 hover:bg-muted/60"
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                        <role.icon className="size-5" />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold">{role.label}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{role.description}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : confirmSent ? (
              <div className="mt-6 space-y-3 text-sm">
                <h2 className="text-lg font-semibold">Check your email</h2>
                <p className="text-muted-foreground">
                  We sent a verification link to your inbox. Click it to verify your email; you will
                  then be redirected to your citizen dashboard.
                </p>
                <Button variant="outline" onClick={() => setMode("signin")} className="w-full">
                  Back to sign in
                </Button>
              </div>
            ) : (
              <div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mb-3 -ml-2"
                  onClick={() => {
                    setSelectedRole(null);
                    setConfirmSent(false);
                  }}
                >
                  <ArrowLeft className="mr-1.5 size-4" /> Back to roles
                </Button>
                <div className="flex rounded-xl bg-muted p-1">
                  {(["signin", ...(selectedRole === "citizen" ? ["signup"] : [])] as const).map((option) => (
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
                <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
                {mode === "signup" ? (
                  <>
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
                </form>
              </div>
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
