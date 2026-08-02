import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  Camera,
  MapPinned,
  ShieldCheck,
  Sparkles,
  ThumbsUp,
  Workflow,
} from "lucide-react";

import heroImage from "@/assets/civic-hero.jpg";
import { Button } from "@/components/ui/button";
import { STATUS_FLOW, STATUS_META } from "@/lib/civic";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CivicAI — Public Infrastructure Intelligence Platform" },
      {
        name: "description",
        content:
          "Citizens report infrastructure issues with photos and GPS. Departments get live district analytics. Field officers close the loop with verified proof.",
      },
      { property: "og:title", content: "CivicAI — Public Infrastructure Intelligence Platform" },
      {
        property: "og:description",
        content:
          "Citizens report infrastructure issues with photos and GPS. Departments get live district analytics. Field officers close the loop with verified proof.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: Camera,
    title: "Report in under a minute",
    body: "Photo, description and GPS location captured on the spot, routed to the right department.",
  },
  {
    icon: ThumbsUp,
    title: "Support, don't duplicate",
    body: "Citizens back an existing report instead of filing a new one, so severity reflects reality.",
  },
  {
    icon: BarChart3,
    title: "District intelligence",
    body: "Live trends, heat maps, department load and officer performance for the whole city.",
  },
  {
    icon: Workflow,
    title: "Verified status trail",
    body: "Every stage change is timestamped with remarks and repair proof from the field officer.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto grid max-w-[1200px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
              <ShieldCheck className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-bold">CivicAI</p>
              <p className="truncate text-[11px] text-muted-foreground">
                Public Infrastructure Intelligence
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth" search={{ mode: "signin" }}>
                Sign in
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth" search={{ mode: "signup" }}>
                Get started
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="hero-gradient relative overflow-hidden">
        <div className="grid-lines absolute inset-0 opacity-50" />
        <div className="relative mx-auto grid max-w-[1200px] gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:py-24">
          <div className="text-sidebar-foreground">
            <span className="inline-flex items-center gap-2 rounded-full border border-sidebar-border bg-sidebar-accent/60 px-3 py-1 text-[11px] font-semibold tracking-wider uppercase">
              <Sparkles className="size-3.5" /> AI triage, duplicate detection and routing — live
            </span>
            <h1 className="mt-5 font-display text-4xl leading-[1.05] font-extrabold sm:text-5xl">
              Public infrastructure, managed like a modern operations platform.
            </h1>
            <p className="mt-5 max-w-xl text-base text-sidebar-foreground/75">
              CivicAI unifies citizen reporting, department oversight and field execution — with a
              verified five-stage resolution trail on every single issue.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/auth" search={{ mode: "signup" }}>
                  Report an issue <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-sidebar-border bg-sidebar-accent/40 text-sidebar-foreground hover:bg-sidebar-accent/70"
              >
                <Link to="/auth" search={{ mode: "signin" }}>
                  Department login
                </Link>
              </Button>
            </div>
            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4">
              {[
                ["5", "districts monitored"],
                ["5", "departments live"],
                ["24/7", "citizen intake"],
              ].map(([value, label]) => (
                <div key={label}>
                  <dt className="font-display text-2xl font-bold">{value}</dt>
                  <dd className="text-[11px] text-sidebar-foreground/60 uppercase">{label}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative">
            <img
              src={heroImage}
              alt="Night aerial view of a city intersection with connected infrastructure data points"
              width={1600}
              height={1008}
              className="w-full rounded-3xl border border-sidebar-border shadow-float"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-bold sm:text-3xl">Built for three very different jobs</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Each role gets a workspace designed for its decisions — not one dashboard stretched across
          everyone.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="surface-card p-6">
              <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <feature.icon className="size-5" />
              </span>
              <h3 className="mt-4 text-base font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-muted/40">
        <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-bold sm:text-3xl">A single, auditable resolution flow</h2>
          <div className="mt-8 grid gap-3 sm:grid-cols-5">
            {STATUS_FLOW.map((status, index) => (
              <div key={status} className="surface-card p-4">
                <p className="font-mono text-xs text-muted-foreground">
                  0{index + 1}
                </p>
                <p className="mt-2 text-sm font-semibold">{STATUS_META[status].label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6">
        <div className="surface-card grid gap-6 p-8 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold">See the city as it actually is</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Nearby issue maps, district heat signals and department load — refreshed as citizens
              report.
            </p>
          </div>
          <Button asChild size="lg">
            <Link to="/auth" search={{ mode: "signup" }}>
              <MapPinned className="mr-2 size-4" /> Open the platform
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border py-8">
        <div className="mx-auto max-w-[1200px] px-4 text-xs text-muted-foreground sm:px-6">
          CivicAI · Municipal infrastructure intelligence · Demo data shown for evaluation
        </div>
      </footer>
    </div>
  );
}
