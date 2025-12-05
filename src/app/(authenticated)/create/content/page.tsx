import type { Metadata } from "next";

import { AppPage } from "@/components/app-page";

import styles from "./content.page.module.css";

type AspectFormatId = "vertical" | "horizontal" | "square";

type AspectFormat = {
  id: AspectFormatId;
  label: string;
  description: string;
};

type LayoutHelper = {
  id: string;
  label: string;
  hint: string;
};

type MediaKind = "clip" | "image" | "bumper";

type MediaItem = {
  id: string;
  kind: MediaKind;
  title: string;
  detail: string;
  badgeLabel: string;
};

type PromptDraft = {
  id: string;
  label: string;
  text: string;
};

type ProjectSummary = {
  id: string;
  title: string;
  subtitle: string;
  tagline: string;
  aspect: string;
  duration: string;
};

const PROJECT_SUMMARY: ProjectSummary = {
  id: "proj_01",
  title: "Ranked clutch montage",
  subtitle: "Capsule neon • bold captions",
  tagline: "Match point, one chance.",
  aspect: "9:16 short",
  duration: "00:34",
};

const ASPECT_FORMATS: AspectFormat[] = [
  {
    id: "vertical",
    label: "Vertical",
    description: "9:16 – Shorts / Reels",
  },
  {
    id: "horizontal",
    label: "Horizontal",
    description: "16:9 – YouTube / VODs",
  },
  {
    id: "square",
    label: "Square",
    description: "1:1 – Feed posts",
  },
];

const LAYOUT_HELPERS: LayoutHelper[] = [
  {
    id: "safe-zones",
    label: "Safe zones",
    hint: "Ensure overlays avoid platform UI and chat.",
  },
  {
    id: "caption-style",
    label: "Caption style",
    hint: "Bold gaming subtitles with subtle outline.",
  },
  {
    id: "transitions",
    label: "Transitions",
    hint: "Quick cuts between big reactions and plays.",
  },
];

const MEDIA_ITEMS: MediaItem[] = [
  {
    id: "media_01",
    kind: "clip",
    title: "Ace on Split – Round 11",
    detail: "0:18 • Auto-clipped from last broadcast",
    badgeLabel: "Clip",
  },
  {
    id: "media_02",
    kind: "image",
    title: "Match MVP screenshot",
    detail: "PNG • Captured via Capsules overlay",
    badgeLabel: "Image",
  },
  {
    id: "media_03",
    kind: "bumper",
    title: "\"Community night\" intro sting",
    detail: "0:06 • Animated bumper",
    badgeLabel: "Bumper",
  },
];

const PROMPT_DRAFTS: PromptDraft[] = [
  {
    id: "prompt_title",
    label: "Title & hook",
    text: "He queued solo, but his aim didn't get the memo.",
  },
  {
    id: "prompt_description",
    label: "Description",
    text: "Short recap optimized for YouTube, with timestamps and a soft CTA to follow your Capsule.",
  },
  {
    id: "prompt_cross_post",
    label: "Cross-post copy",
    text: "Variants for Discord announcements, Capsule posts, and a quick X / Threads caption.",
  },
];

export const metadata: Metadata = {
  title: "Content Studio - Capsules",
  description:
    "Turn raw clips and screenshots into on-brand highlights, thumbnails, and posts with Capsules AI.",
};

export default function ContentStudioPage() {
  return (
    <AppPage activeNav="create" showPrompter layoutVariant="capsule">
      <div className={styles.shell} data-surface="content">
        <header className={styles.header}>
          <div className={styles.headerMain}>
            <div className={styles.pill}>Content Studio</div>
            <h1 className={styles.title}>Design highlights, thumbnails, and posts with AI</h1>
            <p className={styles.subtitle}>
              Drop in your footage and screenshots. Capsules helps you cut, caption, and style content so it
              feels unmistakably on-brand for your community.
            </p>
            <div className={styles.headerActions}>
              <button type="button" className={styles.primaryButton}>
                New project
              </button>
              <button type="button" className={styles.secondaryButton}>
                Upload assets
              </button>
            </div>
          </div>
          <div className={styles.headerMeta}>
            <div className={styles.metaCard}>
              <div className={styles.metaLabel}>Preset</div>
              <div className={styles.metaValue}>Highlight reel</div>
              <div className={styles.metaHint}>Best for Twitch &amp; YouTube Shorts</div>
            </div>
            <div className={styles.metaCard}>
              <div className={styles.metaLabel}>Look</div>
              <div className={styles.metaValue}>Capsule neon</div>
              <div className={styles.metaHint}>Uses your Capsule colors &amp; fonts</div>
            </div>
          </div>
        </header>

        <main className={styles.layout}>
          <section className={styles.columnPrimary} aria-label="Project canvas">
            <section className={styles.cardAccent} aria-label="Preview and timeline">
              <header className={styles.cardHeaderRow}>
                <div>
                  <h2 className={styles.cardTitle}>Project canvas</h2>
                  <p className={styles.cardSubtitle}>
                    Preview your edit with a timeline for cuts, captions, and overlays.
                  </p>
                </div>
                <div className={styles.tabStrip}>
                  <button type="button" className={styles.tabButton} data-state="active">
                    Timeline
                  </button>
                  <button type="button" className={styles.tabButton}>
                    Storyboard
                  </button>
                </div>
              </header>
              <div className={styles.previewShell}>
                <div className={styles.previewFrame}>
                  <div className={styles.previewSafeLines} aria-hidden="true" />
                  <div className={styles.previewBadge}>
                    {PROJECT_SUMMARY.aspect} • {PROJECT_SUMMARY.duration}
                  </div>
                  <div className={styles.previewTagline}>{PROJECT_SUMMARY.tagline}</div>
                  <div className={styles.previewOverlayBottom}>
                    <div className={styles.previewTitle}>{PROJECT_SUMMARY.title}</div>
                    <div className={styles.previewSubtitle}>{PROJECT_SUMMARY.subtitle}</div>
                  </div>
                </div>
                <div className={styles.timelineShell} aria-hidden="true">
                  <div className={styles.timelineWave} />
                  <div className={styles.timelineClips}>
                    <div className={styles.timelineClip} data-kind="clip" />
                    <div className={styles.timelineClip} data-kind="clip" />
                    <div className={styles.timelineClip} data-kind="clip" />
                  </div>
                  <div className={styles.timelineTracks}>
                    <div className={styles.timelineTrackLabel}>Captions</div>
                    <div className={styles.timelineTrackLine} />
                    <div className={styles.timelineTrackLabel}>Overlays</div>
                    <div className={styles.timelineTrackLine} />
                  </div>
                </div>
              </div>
            </section>

            <section className={styles.card} aria-label="Format and layout presets">
              <header className={styles.cardHeaderRow}>
                <div>
                  <h2 className={styles.cardTitle}>Format &amp; layout</h2>
                  <p className={styles.cardSubtitle}>
                    Choose aspect ratios, framing, and safe zones before you publish.
                  </p>
                </div>
                <button type="button" className={styles.chipButton}>
                  Apply Capsule theme
                </button>
              </header>
              <div className={styles.formatGrid}>
                {ASPECT_FORMATS.map((format) => (
                  <div key={format.id} className={styles.formatChoice}>
                    <div className={styles.formatBadge}>{format.label}</div>
                    <div className={styles.formatLabel}>{format.description}</div>
                  </div>
                ))}
              </div>
              <div className={styles.layoutHelpers}>
                {LAYOUT_HELPERS.map((helper) => (
                  <div key={helper.id} className={styles.layoutHelper}>
                    <div className={styles.layoutLabel}>{helper.label}</div>
                    <p className={styles.layoutHint}>{helper.hint}</p>
                  </div>
                ))}
              </div>
            </section>
          </section>

          <section className={styles.columnSecondary} aria-label="Media library and AI helpers">
            <section className={styles.card} aria-label="Media library">
              <header className={styles.cardHeaderRow}>
                <div>
                  <h2 className={styles.cardTitle}>Media library</h2>
                  <p className={styles.cardSubtitle}>
                    Clips and images pulled from your streams, uploads, and Capsules.
                  </p>
                </div>
                <button type="button" className={styles.chipButton}>
                  Import from Stream Studio
                </button>
              </header>
              <ul className={styles.mediaList}>
                {MEDIA_ITEMS.map((item) => (
                  <li
                    key={item.id}
                    className={styles.mediaItem}
                    data-kind={item.kind}
                    data-media-id={item.id}
                  >
                    <div className={styles.mediaThumb} />
                    <div className={styles.mediaMeta}>
                      <div className={styles.mediaTitle}>{item.title}</div>
                      <p className={styles.mediaHint}>{item.detail}</p>
                    </div>
                    <span className={styles.mediaTag}>{item.badgeLabel}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className={styles.card} aria-label="AI prompts and drafts">
              <header className={styles.cardHeaderStacked}>
                <h2 className={styles.cardTitle}>AI prompts &amp; drafts</h2>
                <p className={styles.cardSubtitle}>
                  Ask Capsules to name, describe, and package your edit for different platforms.
                </p>
              </header>
              <ul className={styles.promptList}>
                {PROMPT_DRAFTS.map((prompt) => (
                  <li key={prompt.id} className={styles.promptItem}>
                    <div className={styles.promptLabel}>{prompt.label}</div>
                    <p className={styles.promptText}>{prompt.text}</p>
                  </li>
                ))}
              </ul>
            </section>

            <section className={styles.card} aria-label="Brand kit and export">
              <header className={styles.cardHeaderStacked}>
                <h2 className={styles.cardTitle}>Brand kit &amp; export</h2>
                <p className={styles.cardSubtitle}>
                  Lock in colors, logos, and fonts once. Reuse them across every clip and thumbnail.
                </p>
              </header>
              <div className={styles.brandGrid}>
                <div className={styles.brandPalette}>
                  <div className={styles.brandLabel}>Palette</div>
                  <div className={styles.swatchRow}>
                    <span className={styles.swatch} data-tone="primary" />
                    <span className={styles.swatch} data-tone="accent" />
                    <span className={styles.swatch} data-tone="highlight" />
                  </div>
                </div>
                <div className={styles.brandFonts}>
                  <div className={styles.brandLabel}>Typography</div>
                  <div className={styles.fontChip}>Headline – Bold</div>
                  <div className={styles.fontChip} data-variant="sub">
                    Body – Clean
                  </div>
                </div>
                <div className={styles.brandLogos}>
                  <div className={styles.brandLabel}>Logos &amp; watermark</div>
                  <div className={styles.logoMock} />
                </div>
              </div>
              <div className={styles.exportRow}>
                <div className={styles.exportMeta}>
                  <div className={styles.exportLabel}>Ready to export</div>
                  <p className={styles.exportHint}>Create a Capsule post and optional social versions.</p>
                </div>
                <div className={styles.exportButtons}>
                  <button type="button" className={styles.secondaryButton}>
                    Save draft
                  </button>
                  <button type="button" className={styles.primaryButton}>
                    Export &amp; publish
                  </button>
                </div>
              </div>
            </section>
          </section>
        </main>
      </div>
    </AppPage>
  );
}
