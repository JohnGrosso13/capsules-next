import type { Metadata } from "next";
import type { ReactElement } from "react";
import {
  CalendarBlank,
  ChartLineUp,
  FilePdf,
  FileText,
  ImageSquare,
  MagicWand,
  NotePencil,
  PresentationChart,
  Sparkle,
  VideoCamera,
} from "@phosphor-icons/react/dist/ssr";

import { AppPage } from "@/components/app-page";

import styles from "./content.page.module.css";

type QuickAction = {
  id: string;
  title: string;
  description: string;
  icon: ReactElement;
  tone: "video" | "image" | "social" | "edit" | "deck" | "pdf";
};

type OverviewCard = {
  id: string;
  label: string;
  total: string;
  delta: string;
  action: string;
  icon: ReactElement;
};

type RecentCreation = {
  id: string;
  title: string;
  category: string;
  image: string;
};

type WorkflowShortcut = {
  id: string;
  title: string;
  description: string;
  icon: ReactElement;
  tag?: string;
};

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "video",
    title: "Generate Video",
    description: "Create eye-catching, short videos from ideas.",
    icon: <VideoCamera size={22} weight="fill" />,
    tone: "video",
  },
  {
    id: "image",
    title: "Generate Image",
    description: "Generate photos, graphics, banners, and more.",
    icon: <ImageSquare size={22} weight="fill" />,
    tone: "image",
  },
  {
    id: "social",
    title: "Create Social Post",
    description: "Compose posts with trending captions and images.",
    icon: <NotePencil size={22} weight="fill" />,
    tone: "social",
  },
  {
    id: "edit",
    title: "Edit Image",
    description: "Retouch, upscale, and clean up existing shots.",
    icon: <MagicWand size={22} weight="fill" />,
    tone: "edit",
  },
  {
    id: "deck",
    title: "Create Presentation",
    description: "Auto-build decks with branded slides and speaker notes.",
    icon: <PresentationChart size={22} weight="fill" />,
    tone: "deck",
  },
  {
    id: "pdf",
    title: "Create PDF",
    description: "Design export-ready PDFs with covers, sections, and CTAs.",
    icon: <FilePdf size={22} weight="fill" />,
    tone: "pdf",
  },
];

const OVERVIEW_CARDS: OverviewCard[] = [
  {
    id: "drafts",
    label: "Drafts",
    total: "14",
    delta: "+5 in the last 7",
    action: "View drafts",
    icon: <FileText size={22} weight="bold" />,
  },
  {
    id: "scheduled",
    label: "Scheduled",
    total: "6",
    delta: "+2 in the last 7",
    action: "Manage queue",
    icon: <CalendarBlank size={22} weight="bold" />,
  },
];

const RECENT_CREATIONS: RecentCreation[] = [
  {
    id: "city",
    title: "Rainy Cyberpunk City",
    category: "Short video",
    image:
      "https://images.unsplash.com/photo-1508057198894-247b23fe5ade?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "reading",
    title: "Cozy Reading Corner",
    category: "Image set",
    image:
      "https://images.unsplash.com/photo-1519710164239-da123dc03ef4?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "forest",
    title: "Misty Pine Forest",
    category: "Post bundle",
    image:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
  },
];

const WORKFLOW_SHORTCUTS: WorkflowShortcut[] = [
  {
    id: "templates",
    title: "Template Library",
    description: "Curated looks for intros, promos, and merch drops.",
    icon: <Sparkle size={20} weight="fill" />,
    tag: "Popular",
  },
  {
    id: "remix",
    title: "Remix & Resize",
    description: "Duplicate, switch aspect ratios, and auto-adjust captions.",
    icon: <MagicWand size={20} weight="fill" />,
    tag: "New",
  },
  {
    id: "insights",
    title: "Performance Insights",
    description: "Find the clips with the strongest retention to schedule next.",
    icon: <ChartLineUp size={20} weight="fill" />,
  },
  {
    id: "handoff",
    title: "Producer Handoff",
    description: "Lock brand kit, attach briefs, and invite editors.",
    icon: <NotePencil size={20} weight="fill" />,
  },
];

export const metadata: Metadata = {
  title: "Content Creation - Capsules",
  description: "Generate and edit videos, images, decks, and posts with Capsules AI.",
};

export default function ContentCreationPage() {
  return (
    <AppPage activeNav="create" showPrompter={false} layoutVariant="capsule">
      <div className={styles.page}>
        <header className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>Content Creation</p>
            <h1 className={styles.title}>Generate & edit videos, images, and posts</h1>
            <p className={styles.subtitle}>
              Start with a format, keep everything on-brand, and publish to every channel without leaving
              Capsules.
            </p>
          </div>
          <div className={styles.heroActions}>
            <button type="button" className={styles.primaryButton}>
              + New post
            </button>
            <button type="button" className={styles.ghostButton}>
              Upload assets
            </button>
          </div>
        </header>

        <div className={styles.topRow}>
          <section className={styles.panel}>
            <header className={styles.sectionHeader}>
              <div>
                <p className={styles.sectionEyebrow}>Quick Create</p>
                <h2 className={styles.sectionTitle}>Start with a mode</h2>
                <p className={styles.sectionSubtitle}>
                  Spin up new content with presets for every channel and deliverable.
                </p>
              </div>
              <button type="button" className={styles.linkButton}>
                View automations
              </button>
            </header>
            <div className={styles.quickGrid}>
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className={styles.quickCard}
                  data-tone={action.tone}
                  aria-label={action.title}
                >
                  <span className={styles.quickIcon} data-tone={action.tone} aria-hidden>
                    {action.icon}
                  </span>
                  <div className={styles.quickCopy}>
                    <div className={styles.quickTitle}>{action.title}</div>
                    <p className={styles.quickDescription}>{action.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <aside className={styles.panelAlt} aria-label="Post overview">
            <header className={styles.sectionHeader}>
              <div>
                <p className={styles.sectionEyebrow}>Post Overview</p>
                <h2 className={styles.sectionTitle}>Pipeline</h2>
                <p className={styles.sectionSubtitle}>Track drafts, schedules, and week-over-week lifts.</p>
              </div>
            </header>
            <div className={styles.overviewList}>
              {OVERVIEW_CARDS.map((card) => (
                <div key={card.id} className={styles.overviewCard} data-tone={card.id}>
                  <div className={styles.overviewIcon} aria-hidden>
                    {card.icon}
                  </div>
                  <div className={styles.overviewMeta}>
                    <div className={styles.overviewLabel}>{card.label}</div>
                    <div className={styles.overviewValue}>{card.total}</div>
                    <div className={styles.overviewDelta}>{card.delta}</div>
                  </div>
                  <button type="button" className={styles.secondaryButton}>
                    {card.action}
                  </button>
                </div>
              ))}
            </div>
          </aside>
        </div>

        <div className={styles.bottomRow}>
          <section className={styles.panel}>
            <header className={styles.sectionHeader}>
              <div>
                <p className={styles.sectionEyebrow}>Recent Creations</p>
                <h2 className={styles.sectionTitle}>Keep the momentum</h2>
              </div>
              <button type="button" className={styles.linkButton}>
                View all
              </button>
            </header>
            <div className={styles.recentGrid}>
              {RECENT_CREATIONS.map((creation) => (
                <article
                  key={creation.id}
                  className={styles.recentCard}
                  style={{ backgroundImage: `url(${creation.image})` }}
                >
                  <div className={styles.recentOverlay} />
                  <div className={styles.recentMeta}>
                    <span className={styles.recentTag}>{creation.category}</span>
                    <h3 className={styles.recentTitle}>{creation.title}</h3>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.panelAlt}>
            <header className={styles.sectionHeader}>
              <div>
                <p className={styles.sectionEyebrow}>Workflow Shortcuts</p>
                <h2 className={styles.sectionTitle}>Ship faster</h2>
                <p className={styles.sectionSubtitle}>
                  Replace the resource drawer with guided flows your team actually uses.
                </p>
              </div>
            </header>
            <div className={styles.workflowList}>
              {WORKFLOW_SHORTCUTS.map((workflow) => (
                <div key={workflow.id} className={styles.workflowCard}>
                  <div className={styles.workflowIcon} aria-hidden>
                    {workflow.icon}
                  </div>
                  <div className={styles.workflowCopy}>
                    <div className={styles.workflowTitle}>
                      {workflow.title}
                      {workflow.tag ? <span className={styles.workflowTag}>{workflow.tag}</span> : null}
                    </div>
                    <p className={styles.workflowDescription}>{workflow.description}</p>
                  </div>
                  <button type="button" className={styles.ghostButton}>
                    Open
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </AppPage>
  );
}
