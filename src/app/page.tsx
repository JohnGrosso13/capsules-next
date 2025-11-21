import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { GroupCarousel } from "@/components/group-carousel";
import { LandingAuthCard } from "@/components/landing-auth-card";
import { CaretDown } from "@phosphor-icons/react/dist/ssr";
import { HowItWorks } from "@/components/how-it-works";
import { LaunchCta } from "@/components/launch-cta";
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
  if (userId) {
    redirect("/home");
  }
  const contactEmail = "hello@capsules-platform.com";
  const footerLinks: Array<{ label: string; href: string; external?: boolean }> = [
    { label: "Features", href: "/#features" },
    { label: "Use Cases", href: "/#categories" },
    { label: "Pricing", href: "/#revenue" },
    { label: "Contact", href: "mailto:" + contactEmail, external: true },
  ];
  const footerYear = new Date().getFullYear();

  return (
    <div className="relative flex min-h-screen flex-col">
      {/* Header removed for signed-out landing experience */}

      <main className="layout-shell relative flex flex-1 flex-col gap-16 py-10 sm:py-14 lg:py-16">
          <div className="contents">
            <section className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="flex flex-col gap-8">
                <div className="space-y-4 text-center">
                  <h1 className="font-display text-fg text-[clamp(2.5rem,4.5vw,4rem)] leading-tight tracking-tight">
                    Create AI Powered Spaces That Remember
                  </h1>
                  <p className="text-fg-subtle mx-auto max-w-xl text-[clamp(1rem,1.6vw,1.3rem)] leading-relaxed">
                    The first social platform that couples channel memory with AI building blocks so
                    your community stays connected, organized, and inspired.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {heroPrompts.map((prompt) => (
                    <span
                      key={prompt}
                      className="glass-chip text-fg-subtle px-3.5 py-1.5 text-sm font-medium"
                    >
                      {prompt}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <LaunchCta size="lg" />
                  <Link
                    href="#features"
                    className="glass-chip inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition hover:translate-y-[-1px]"
                  >
                    Explore Features
                    <CaretDown aria-hidden="true" size={16} weight="bold" />
                  </Link>
                </div>
              </div>
              <div className="flex items-center justify-center">
                <LandingAuthCard />
              </div>
            </section>

            <section className="space-y-6" id="how-it-works">
              <div className="section-shell section-alt rounded-3xl px-6 py-10 text-center md:py-12">
                <div className="mx-auto max-w-5xl space-y-6">
                  <h2 className="font-display text-fg text-[clamp(1.9rem,3vw,2.5rem)] tracking-tight">
                    How It Works
                  </h2>
                  <p className="text-fg-subtle mx-auto max-w-2xl text-[clamp(1rem,1.45vw,1.125rem)] leading-relaxed">
                    Guided workflows make it easy to launch, grow, and monetize a space with AI
                    copilots at every step.
                  </p>
                  <HowItWorks steps={howSteps} />
                </div>
              </div>
            </section>

            <section className="space-y-6" id="categories">
              <div className="space-y-3 text-center">
                <h2 className="font-display text-fg text-[clamp(1.9rem,3vw,2.5rem)] tracking-tight">
                  Any Group Can Benefit
                </h2>
                <p className="text-fg-subtle mx-auto max-w-xl text-[clamp(1rem,1.45vw,1.125rem)] leading-relaxed">
                  Purpose-built templates and memory models adapt to how your community
                  collaborates.
                </p>
              </div>
              <GroupCarousel items={groupTypes} animate speed="slower" />
            </section>

            <section className="space-y-6" id="superpowers">
              <div className="section-shell section-alt space-y-3 rounded-3xl p-6 text-center">
                <h2 className="font-display text-fg text-[clamp(1.9rem,3vw,2.5rem)] tracking-tight">
                  Superpowers For Your Community
                </h2>
                <p className="text-fg-subtle mx-auto max-w-xl text-[clamp(1rem,1.45vw,1.125rem)] leading-relaxed">
                  Automations and copilots keep your space lively without requiring a full-time
                  team.
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {superpowers.map((power) => (
                    <div
                      key={power}
                      className="tile-neu text-fg-subtle rounded-2xl px-5 py-4 text-sm font-medium transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      {power}
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-6" id="features">
              <div className="section-shell space-y-3 rounded-3xl p-6 text-center">
                <h2 className="font-display text-fg text-[clamp(1.9rem,3vw,2.5rem)] tracking-tight">
                  What Makes Us Different
                </h2>
                <p className="text-fg-subtle mx-auto max-w-xl text-[clamp(1rem,1.45vw,1.125rem)] leading-relaxed">
                  Everything you need to power a modern community, backed by AI context that
                  remembers every moment.
                </p>
                <div className="mt-4 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {differentiators.map((feature) => (
                    <Card
                      key={feature.title}
                      variant="soft"
                      interactive
                      className="backdrop-blur-xl"
                    >
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
                className="absolute inset-0"
                style={{
                  background:
                    "radial-gradient(circle at top right, color-mix(in srgb, var(--color-accent, #22d3ee) 30%, transparent), transparent 55%)",
                }}
                aria-hidden="true"
              />
              <div className="relative z-10 mx-auto max-w-3xl space-y-6">
                <h2 className="font-display text-brand-foreground text-[clamp(1.9rem,3vw,2.5rem)] tracking-tight">
                  Keep 90% of Your Creator Revenue
                </h2>
                <p className="text-brand-foreground/80 text-[clamp(1rem,1.45vw,1.125rem)] leading-relaxed">
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

      <footer className="border-border/40 bg-surface-muted/70 border-t backdrop-blur">
        <div className="layout-shell text-fg-subtle flex flex-col items-center gap-3 py-6 text-sm sm:flex-row sm:justify-between">
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
              ),
            )}
          </div>
          <span>&copy; {footerYear} Capsules</span>
        </div>
      </footer>
    </div>
  );
}
