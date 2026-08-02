import { useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  Building2,
  ClipboardList,
  Gauge,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Menu,
  Moon,
  PlusCircle,
  ShieldCheck,
  Sun,
  Users,
  X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { NotificationCenter } from "@/components/layout/NotificationCenter";
import { ErrorBoundary } from "@/components/civic/ErrorBoundary";
import { useRealtimeWorkspace } from "@/hooks/useRealtimeWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentProfile } from "@/hooks/useSession";
import { useTheme } from "@/hooks/useTheme";
import { useNotifications } from "@/lib/queries";
import { ROLE_META, type AppRole } from "@/lib/civic";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: typeof Gauge };

const NAV: Record<AppRole, NavItem[]> = {
  citizen: [
    { to: "/citizen", label: "Overview", icon: LayoutDashboard },
    { to: "/report", label: "Report an issue", icon: PlusCircle },
    { to: "/my-reports", label: "My reports", icon: ClipboardList },
    { to: "/nearby", label: "Nearby issues", icon: MapPinned },
  ],
  department_admin: [
    { to: "/department", label: "Command centre", icon: Gauge },
    { to: "/analytics", label: "District analytics", icon: Building2 },
    { to: "/officers", label: "Officer performance", icon: Users },
    { to: "/nearby", label: "City map", icon: MapPinned },
  ],
  field_officer: [
    { to: "/officer", label: "My queue", icon: ClipboardList },
    { to: "/nearby", label: "Field map", icon: MapPinned },
  ],
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: me } = useCurrentProfile();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const role: AppRole = me?.role ?? "citizen";
  const items = NAV[role];
  const userId = me?.profile?.id ?? undefined;
  const { data: notifications } = useNotifications(userId);
  const unread = (notifications ?? []).filter((n) => !n.is_read).length;

  // Live notifications + cross-role complaint sync.
  useRealtimeWorkspace(userId);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const sidebar = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
          <ShieldCheck className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-bold tracking-tight">CivicAI</p>
          <p className="truncate text-[11px] text-sidebar-foreground/60">Infrastructure Intelligence</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3" aria-label="Primary">
        <p className="px-2 pt-2 pb-1 text-[10px] font-semibold tracking-[0.18em] text-sidebar-foreground/45 uppercase">
          {ROLE_META[role].label}
        </p>
        {items.map((item) => {
          const active = pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              <item.icon className="size-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}

        <p className="px-2 pt-5 pb-1 text-[10px] font-semibold tracking-[0.18em] text-sidebar-foreground/45 uppercase">
          Account
        </p>
        <Link
          to="/notifications"
          onClick={() => setMobileOpen(false)}
          aria-current={pathname === "/notifications" ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
            pathname === "/notifications"
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
          )}
        >
          <Bell className="size-4 shrink-0" />
          <span className="truncate">Notifications</span>
          {unread ? (
            <span className="ml-auto rounded-full bg-sidebar-primary px-1.5 py-0.5 text-[10px] font-bold text-sidebar-primary-foreground">
              {unread}
            </span>
          ) : null}
        </Link>
      </nav>

      <div className="m-3 rounded-2xl bg-sidebar-accent/50 p-3">
        <p className="text-[11px] font-semibold text-sidebar-foreground/80">AI routing engine</p>
        <p className="mt-1 text-[11px] leading-relaxed text-sidebar-foreground/55">
          Live triage, duplicate detection and officer assignment run on every new report.
        </p>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-dvh w-full bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Skip to main content
      </a>
      <aside className="hidden w-[260px] shrink-0 border-r border-sidebar-border lg:block">
        <div className="sticky top-0 h-dvh">{sidebar}</div>
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="animate-fade-in absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="animate-slide-in-left absolute inset-y-0 left-0 w-[268px] shadow-float">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
              className="absolute top-4 right-3 z-10 text-sidebar-foreground/70"
            >
              <X className="size-5" />
            </button>
            {sidebar}
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation"
              >
                <Menu className="size-5" />
              </Button>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {me?.profile?.full_name || me?.email || "Signed in"}
                </p>
                <p className="truncate text-xs text-muted-foreground">{ROLE_META[role].label} workspace</p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                variant="ghost"
                size="icon"
                className="min-h-11 min-w-11"
                onClick={toggle}
                aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              >
                {theme === "dark" ? (
                  <Sun className="size-4" aria-hidden="true" />
                ) : (
                  <Moon className="size-4" aria-hidden="true" />
                )}
              </Button>
              <NotificationCenter userId={userId} />
              <Button variant="outline" size="sm" onClick={signOut} className="min-h-11">
                <LogOut className="size-3.5 sm:mr-1.5" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">Sign out</span>
              </Button>
            </div>
          </div>
        </header>

        <main
          id="main-content"
          className="mx-auto w-full max-w-[1400px] flex-1 space-y-6 px-4 py-6 sm:px-6 sm:py-8"
        >
          <ErrorBoundary label="app_shell_outlet">{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
