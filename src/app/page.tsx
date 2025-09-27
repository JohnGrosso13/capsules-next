import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";

import { GroupCarousel } from "@/components/group-carousel";
import { LandingAuthCard } from "@/components/landing-auth-card";
import { HowItWorks } from "@/components/how-it-works";
import { LaunchCta } from "@/components/launch-cta";
import { HomeSignedIn } from "@/components/home-signed-in";
import { PrimaryHeader } from "@/components/primary-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";

const heroPrompts = [
  "Make a hello post",
  "Summarize my feed",
  "Regenerate my last image",
  "Draft a weekly update",
];

const groupTypes = [
  "Creators",
  "Teams",
  "Families",
  "Community Founders",
  "Event Organizers",
  "Educators & Coaches",
  "Clubs",
  "Designers & Illustrators",
  "Local Groups",
  "Gaming Communities",
  "Schools",
  "Independent Sellers",
  "Streamers",
  "Leagues",
  "Writers",
  "Podcasters",
  "Photographers",
  "Alumni Networks",
];
const howSteps = [
  {
    title: "Create your Capsule",
    desc: "With Channel Memory you can recall anything from your space.",
    icon: "📦",
  },
  {
    title: "Ask AI to make anything",
    desc: "Create posts, logos, polls, and store items with prompts.",
    icon: "🛠️",
  },
  {
    title: "Open the barrier to growth",
    desc: "Post, stream, chat, and sell with built-in integrations.",
    icon: "🚀",
  },
];
const superpowers = [
  "Actionable AI outputs",
  "Live events & chat",
  "Clip Studio",
  "Memory AI",
  "Smart automation",
  "Analytics dashboard",
];

const differentiators = [
  {
    title: "Channel Memory",
    points: [
      "Time travel Q&A with timestamps",
      "People & roles history",
      "Decisions & policy recall",
      '"What changed" digests',
    ],
  },
  {
    title: "Creator Co-Pilot",
    points: [
      "One click stream highlights",
      "Complete branding accessible to anyone",
      "Auto-crop and responsive art",
      "Explain > Generate workflows",
      "Fill your store with community creations",
    ],
  },
  {
    title: "Live & Events Intelligence",
    points: [
      "Stream and event recaps",
      "On-stream overlays generated in seconds",
      "Auto stats and scores",
      "AI-built tournaments and ladders",
    ],
  },
  {
    title: "Community Operations & Health",
    points: [
      "Smart polls, prompts, and challenges",
      "Community health monitor",
      "AI search and match finder",
      "Space-specific personas",
    ],
  },
  {
    title: "Knowledge & Community Building",
    points: [
      "Auto-wiki from your feed",
      "Cross-space insights",
      "Store analytics",
      "Impressions dashboard",
    ],
  },
  {
    title: "Safety & Privacy",
    points: ["Privacy-first memory", "AI-powered safety", "Sponsor-safe kit generator"],
  },
];

export const metadata: Metadata = {
  title: "Capsules - Create AI Powered Spaces that Remember",
  description:
    "Capsules combines AI drafting, channel memory, and community tools into one workspace.",
};

export default async function HomePage() {
  const { userId } = await auth();
  const isSignedIn = Boolean(userId);

  return (
    <div className="relative flex min-h-screen flex-col">
      {!isSignedIn ? <PrimaryHeader activeKey="home" /> : null}

      <main className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col gap-24 px-5 py-16 sm:px-6 lg:px-8">
        {isSignedIn ? (
          <HomeSignedIn />
        ) : (
          <div className="contents">
            <section className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="flex flex-col gap-8">
                <div className="space-y-4">
                  <Badge
                    tone="brand"
                    variant="soft"
                    size="md"
                    className="w-max tracking-[0.2em] uppercase"
                  >
                    Capsules AI
                  </Badge>
                  <h1 className="font-display text-fg text-4xl tracking-tight sm:text-5xl lg:text-6xl">
                    Create AI powered spaces that remember
                  </h1>
                  <p className="text-fg-subtle max-w-xl text-lg leading-8">
                    The first social platform that couples channel memory with AI building blocks so
                    your community stays connected, organized, and inspired.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {heroPrompts.map((prompt) => (
                    <span
                      key={prompt}
                      className="rounded-pill border-border/50 bg-surface-muted/70 text-fg-subtle border px-3.5 py-1.5 text-sm font-medium shadow-xs backdrop-blur"
                    >
                      {prompt}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <LaunchCta size="lg" />
                  <Link
                    href="#features"
                    className="rounded-pill border-border/60 text-fg-subtle hover:border-border hover:text-fg inline-flex items-center gap-2 border px-5 py-2.5 text-sm font-medium transition"
                  >
                    Explore features
                    <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </div>
              <div className="flex items-center justify-center">
                <LandingAuthCard />
              </div>
            </section>

            <section className="space-y-8" id="how-it-works">
              <div className="space-y-3">
                <Badge
                  tone="brand"
                  variant="soft"
                  size="sm"
                  className="tracking-[0.25em] uppercase"
                >
                  Overview
                </Badge>
                <h2 className="font-display text-fg text-3xl tracking-tight">How it works</h2>
                <p className="text-fg-subtle max-w-2xl text-base">
                  Guided workflows make it easy to launch, grow, and monetize a space with AI
                  copilots at every step.
                </p>
              </div>
              <HowItWorks steps={howSteps} />
            </section>

            <section className="space-y-8" id="categories">
              <div className="space-y-3">
                <Badge
                  tone="neutral"
                  variant="outline"
                  size="sm"
                  className="tracking-[0.25em] uppercase"
                >
                  For everyone
                </Badge>
                <h2 className="font-display text-fg text-3xl tracking-tight">
                  Any group can benefit
                </h2>
                <p className="text-fg-subtle max-w-xl text-base">
                  Purpose-built templates and memory models adapt to how your community
                  collaborates.
                </p>
              </div>
              <GroupCarousel items={groupTypes} animate />
            </section>

            <section className="space-y-8" id="superpowers">
              <div className="space-y-3">
                <Badge
                  tone="brand"
                  variant="soft"
                  size="sm"
                  className="tracking-[0.25em] uppercase"
                >
                  Superpowers
                </Badge>
                <h2 className="font-display text-fg text-3xl tracking-tight">
                  Superpowers for your community
                </h2>
                <p className="text-fg-subtle max-w-xl text-base">
                  Automations and copilots keep your space lively without requiring a full-time
                  team.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {superpowers.map((power) => (
                  <div
                    key={power}
                    className="border-border/40 bg-surface-elevated/80 text-fg-subtle rounded-2xl border px-5 py-4 text-sm font-medium shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    {power}
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-8" id="features">
              <div className="space-y-3">
                <Badge
                  tone="neutral"
                  variant="outline"
                  size="sm"
                  className="tracking-[0.25em] uppercase"
                >
                  Differentiators
                </Badge>
                <h2 className="font-display text-fg text-3xl tracking-tight">
                  What makes us different
                </h2>
                <p className="text-fg-subtle max-w-xl text-base">
                  Everything you need to power a modern community, backed by AI context that
                  remembers every moment.
                </p>
              </div>
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {differentiators.map((feature) => (
                  <Card
                    key={feature.title}
                    variant="soft"
                    className="border-border/40 bg-surface-elevated/80 border backdrop-blur"
                  >
                    <CardContent className="space-y-4 pt-6">
                      <CardTitle className="text-fg text-xl">{feature.title}</CardTitle>
                      <CardDescription className="text-fg-subtle space-y-3 text-sm leading-6">
                        <ul className="space-y-2 text-left">
                          {feature.points.map((point) => (
                            <li key={point} className="flex items-start gap-2 text-left">
                              <span
                                className="bg-brand mt-1 h-1.5 w-1.5 rounded-full"
                                aria-hidden="true"
                              />
                              <span>{point}</span>
                            </li>
                          ))}
                        </ul>
                      </CardDescription>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            <section
              className="border-brand/40 bg-[color:color-mix(in srgb, var(--color-brand) 16%, transparent)] relative overflow-hidden rounded-3xl border px-8 py-16 text-center shadow-xl"
              id="revenue"
            >
              <div
                className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.3),transparent_55%)]"
                aria-hidden="true"
              />
              <div className="relative z-10 mx-auto max-w-3xl space-y-6">
                <h2 className="font-display text-brand-foreground text-3xl tracking-tight">
                  Keep 90% of your creator revenue
                </h2>
                <p className="text-brand-foreground/80 text-base">
                  Capsules only takes a 10% platform fee so you can reinvest more into your
                  community.
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  <LaunchCta variant="secondary" size="lg" label="Start earning" />
                  <Link
                    href="/pricing"
                    className="rounded-pill border-brand-foreground/40 text-brand-foreground/90 hover:border-brand-foreground inline-flex items-center gap-2 border px-5 py-2.5 text-sm font-medium transition"
                  >
                    See pricing
                  </Link>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>

      {isSignedIn ? (
        <footer className="border-border/40 bg-surface-muted/70 border-t backdrop-blur">
          <div className="text-fg-subtle mx-auto flex w-full max-w-6xl flex-col items-center gap-3 px-5 py-6 text-sm sm:flex-row sm:justify-between">
            <span className="text-fg font-medium">Capsules</span>
            <div className="flex flex-wrap items-center gap-4">
              <Link href="/settings" className="hover:text-fg transition">
                Settings
              </Link>
              <Link href="/create" className="hover:text-fg transition">
                Create
              </Link>
              <a href="mailto:hello@capsules-platform.com" className="hover:text-fg transition">
                Contact
              </a>
            </div>
            <span>&copy; {new Date().getFullYear()} Capsules</span>
          </div>
        </footer>
      ) : null}
    </div>
  );
}
