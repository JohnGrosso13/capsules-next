import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";

import { GroupCarousel } from "@/components/group-carousel";
import { LandingAuthCard } from "@/components/landing-auth-card";
import { CaretRight } from "@phosphor-icons/react/dist/ssr";
import { HowItWorks } from "@/components/how-it-works";
import { LaunchCta } from "@/components/launch-cta";
import { HomeSignedIn } from "@/components/home-signed-in";
// Removed Badge labels on signed-out landing
import { Card, CardContent, CardTitle } from "@/components/ui/card";

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
    title: "Create Your Capsule",
    desc: "With Channel Memory you can recall anything from your space.",
  },
  {
    title: "Ask AI To Make Anything",
    desc: "Create posts, logos, polls, and store items with prompts.",
  },
  {
    title: "Enjoy a New Era",
    desc: "Post, stream, chat, and sell with built-in integrations.",
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
  const contactEmail = "hello@capsules-platform.com";
  const footerLinks: Array<{ label: string; href: string; external?: boolean }> = isSignedIn
    ? [
        { label: "Settings", href: "/settings" },
        { label: "Create", href: "/create" },
        { label: "Contact", href: "mailto:" + contactEmail, external: true },
      ]
    : [
        { label: "Features", href: "/#features" },
        { label: "Use Cases", href: "/#categories" },
        { label: "Pricing", href: "/#revenue" },
        { label: "Contact", href: "mailto:" + contactEmail, external: true },
      ];
  const footerYear = new Date().getFullYear();

  return (
    <div className="relative flex min-h-screen flex-col">
      {/* Header removed for signed-out landing experience */}

      {isSignedIn ? (
        <HomeSignedIn />
      ) : (
        <main className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col gap-16 px-5 py-10 sm:px-6 lg:px-8">
          <div className="contents">
            <section className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="flex flex-col gap-8">
                <div className="space-y-4 text-center">
                  <h1 className="font-display text-fg text-4xl tracking-tight sm:text-5xl lg:text-6xl">
                    Create AI Powered Spaces That Remember
                  </h1>
                  <p className="text-fg-subtle max-w-xl text-lg leading-8 mx-auto">
                    The first social platform that couples channel memory with AI building blocks so
                    your community stays connected, organized, and inspired.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {heroPrompts.map((prompt) => (
                    <span
                      key={prompt}
                      className="glass-chip text-fg-subtle px-3.5 py-1.5 text-sm font-medium"
                    >
                      {prompt}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-3 justify-center">
                  <LaunchCta size="lg" />
                  <Link
                    href="#features"
                    className="glass-chip inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium hover:translate-y-[-1px] transition"
                  >
                    Explore Features
                    <CaretRight aria-hidden="true" size={16} weight="bold" />
                  </Link>
                </div>
              </div>
              <div className="flex items-center justify-center">
                <LandingAuthCard />
              </div>
            </section>

            <section className="space-y-6" id="how-it-works">
              <div className="section-shell section-alt rounded-3xl px-6 py-10 md:py-12 text-center">
                <div className="mx-auto max-w-5xl space-y-6">
                  <h2 className="font-display text-fg text-3xl tracking-tight">How It Works</h2>
                  <p className="text-fg-subtle max-w-2xl text-base mx-auto">
                    Guided workflows make it easy to launch, grow, and monetize a space with AI
                    copilots at every step.
                  </p>
                  <HowItWorks steps={howSteps} />
                </div>
              </div>
            </section>

            <section className="space-y-6" id="categories">
              <div className="space-y-3 text-center">
                <h2 className="font-display text-fg text-3xl tracking-tight">
                  Any Group Can Benefit
                </h2>
                <p className="text-fg-subtle max-w-xl text-base mx-auto">
                  Purpose-built templates and memory models adapt to how your community
                  collaborates.
                </p>
              </div>
              <GroupCarousel items={groupTypes} animate speed="slower" />
            </section>

            <section className="space-y-6" id="superpowers">
              <div className="space-y-3 section-shell section-alt rounded-3xl p-6 text-center">
                <h2 className="font-display text-fg text-3xl tracking-tight">
                  Superpowers For Your Community
                </h2>
                <p className="text-fg-subtle max-w-xl text-base mx-auto">
                  Automations and copilots keep your space lively without requiring a full-time
                  team.
                </p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-4">
                  {superpowers.map((power) => (
                    <div
                      key={power}
                      className="tile-neu text-fg-subtle rounded-2xl px-5 py-4 text-sm font-medium transition hover:-translate-y-0.5 hover:shadow-lg"
                    >
                      {power}
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-6" id="features">
              <div className="space-y-3 section-shell rounded-3xl p-6 text-center">
                <h2 className="font-display text-fg text-3xl tracking-tight">
                  What Makes Us Different
                </h2>
                <p className="text-fg-subtle max-w-xl text-base mx-auto">
                  Everything you need to power a modern community, backed by AI context that
                  remembers every moment.
                </p>
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3 mt-4">
                  {differentiators.map((feature) => (
                    <Card key={feature.title} variant="soft" interactive className="backdrop-blur-xl">
                      <CardContent className="space-y-4 pt-6">
                        <CardTitle className="text-fg text-xl">{feature.title}</CardTitle>
                        <div className="text-fg-subtle space-y-3 text-sm leading-6">
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
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
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
                  Keep 90% of Your Creator Revenue
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
        </main>
      )}

      <footer className="border-border/40 bg-surface-muted/70 border-t backdrop-blur">
        <div className="text-fg-subtle mx-auto flex w-full max-w-6xl flex-col items-center gap-3 px-5 py-6 text-sm sm:flex-row sm:justify-between">
          <span className="text-fg font-medium">Capsules</span>
          <div className="flex flex-wrap items-center gap-4">
            {footerLinks.map((link) =>
              link.external ? (
                <a key={link.label} href={link.href} className="hover:text-fg transition">
                  {link.label}
                </a>
              ) : (
                <Link key={link.label} href={link.href} className="hover:text-fg transition">
                  {link.label}
                </Link>
              )
            )}
          </div>
          <span>&copy; {footerYear} Capsules</span>
        </div>
      </footer>

    </div>
  );
}
