import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { HeaderAuth } from "@/components/header-auth";
import { GroupCarousel } from "@/components/group-carousel";
import { SignedIn } from "@clerk/nextjs";
import { LandingAuthCard } from "@/components/landing-auth-card";
import { HowItWorks } from "@/components/how-it-works";
import { LaunchCta } from "@/components/launch-cta";

import styles from "./landing.module.css";

const navLinks = [
  { label: "Home", href: "/" },
  { label: "Create", href: "/create" },
  { label: "Capsule", href: "/capsule" },
  { label: "Memory", href: "/memory" },
];

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
// New concise steps for the HowItWorks component





// New concise steps for the HowItWorks component

// Steps used by the visual HowItWorks component

// Steps used by the visual HowItWorks component

// Steps used by the visual HowItWorks component
const howSteps = [
  { title: "Create your Capsule", desc: "With Channel Memory you can recall anything from your space." },
  { title: "Ask AI to make anything", desc: "Create posts, logos, polls, and store items with prompts." },
  { title: "Open the barrier to growth", desc: "Post, stream, chat, and sell with built-in integrations." },
];const superpowers = [
  "Actionable AI outputs",
  "Live events & chat",
  "Clip Studio",
  "Memory AI",
  "Smart Automation",
  "Analytics Dashboard",
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
    points: [
      "Privacy-first memory",
      "AI-powered safety",
      "Sponsor-safe kit generator",
    ],
  },
];

export const metadata: Metadata = {
  title: "Capsules - Create AI Powered Spaces that Remember",
  description: "Capsules combines AI drafting, channel memory, and community tools into one workspace.",
};

export default async function HomePage() {
  const { userId } = await auth();
  if (userId) {
    redirect("/capsule");
  }
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand} aria-label="Capsules home">
            <span className={styles.brandMark} aria-hidden="true" />
            <span className={styles.brandName}>Capsules</span>
          </Link>
          <nav className={styles.nav} aria-label="Primary navigation">
            <SignedIn>
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`${styles.navLink} ${link.href === "/" ? styles.navLinkActive : ""}`.trim()}
                >
                  {link.label}
                </Link>
              ))}
            </SignedIn>
          </nav>
          <div className={styles.headerActions}>
            <SignedIn>
              <Link href="/settings" className={styles.secondaryAction}>
                Settings
              </Link>
            </SignedIn>
            <LaunchCta className={styles.primaryCta} hrefWhenSignedIn="/capsule" />
            <HeaderAuth />
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>Create AI Powered Spaces that Remember</h1>
            <p className={styles.heroSubtitle}>
              The first social platform that couples channel memory with AI building blocks so your community stays
              connected, organized, and inspired.
            </p>
            <div className={styles.chipList}>
              {heroPrompts.map((prompt) => (
                <span key={prompt} className={styles.chip}>
                  {prompt}
                </span>
              ))}
            </div>
            <div className={styles.heroActions}>
              <LaunchCta className={styles.primaryCta} hrefWhenSignedIn="/capsule" />
              <Link href="#features" className={styles.ghostButton}>
                Explore features
              </Link>
            </div>
          </div>
          <LandingAuthCard />
        </section>

        <section className={styles.section} id="categories">
          <div className={styles.sectionInner}>
            <h2 className={styles.sectionTitle}>Any group can benefit</h2>
            <GroupCarousel items={groupTypes} animate />
          </div>
        </section>

        <section className={styles.section} id="how-it-works">
          <div className={styles.sectionInner}>
            <h2 className={styles.sectionTitle}>How it works</h2>
            <HowItWorks steps={howSteps} />
          </div>
        </section>

        <section className={styles.section} id="superpowers">
          <div className={styles.sectionInner}>
            <h2 className={styles.sectionTitle}>Superpowers for your community</h2>
            <div className={styles.superGrid}>
              {superpowers.map((power) => (
                <div key={power} className={styles.superCard}>
                  {power}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.section} id="features">
          <div className={styles.sectionInner}>
            <h2 className={styles.sectionTitle}>What makes us different</h2>
            <div className={styles.featureGrid}>
              {differentiators.map((feature) => (
                <article key={feature.title} className={styles.featureCard}>
                  <h3 className={styles.featureTitle}>{feature.title}</h3>
                  <ul className={styles.featureList}>
                    {feature.points.map((point) => (
                      <li key={point} className={styles.featureListItem}>
                        {point}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.revenueSection} id="revenue">
          <div className={styles.revenueCard}>
            <h2 className={styles.revenueTitle}>Keep 90% of your creator revenue</h2>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span className={styles.footerBrand}>Capsules</span>
          <div className={styles.footerLinks}>
            <Link href="/settings" className={styles.footerLink}>
              Settings
            </Link>
            <Link href="/create" className={styles.footerLink}>
              Create
            </Link>
            <a href="mailto:hello@capsules-platform.com" className={styles.footerLink}>
              Contact
            </a>
          </div>
          <span className={styles.footerCopy}>&copy; 2025 Capsules</span>
        </div>
      </footer>
    </div>
  );
}





