import type { Metadata } from "next";

import { AppPage } from "@/components/app-page";

import styles from "./content.page.module.css";

export const metadata: Metadata = {
  title: "Content Studio - Capsules",
  description:
    "Turn raw clips and screenshots into on-brand highlights, thumbnails, and posts with Capsules AI.",
};

export default function ContentStudioPage() {
  return (
    <AppPage activeNav="create" showPrompter={false} layoutVariant="capsule">
      <div className={styles.shell} data-surface="content">
        <header className={styles.header}>
          <div className={styles.headerMain}>
            <div className={styles.pill}>Content Studio</div>
            <h1 className={styles.title}>Design highlights, thumbnails, and posts with AI</h1>
            <p className={styles.subtitle}>
              Drop in your footage and screenshots. Capsules helps you cut, caption, and style content
              so it feels unmistakably on-brand for your community.
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
                  <div className={styles.previewBadge}>9:16 Short · 00:34</div>
                  <div className={styles.previewTagline}>“Match point, one chance.”</div>
                  <div className={styles.previewOverlayBottom}>
                    <div className={styles.previewTitle}>Ranked clutch montage</div>
                    <div className={styles.previewSubtitle}>Capsule neon · bold captions</div>
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
                <div className={styles.formatChoice}>
                  <div className={styles.formatBadge}>Vertical</div>
                  <div className={styles.formatLabel}>9:16 · Shorts / Reels</div>
                </div>
                <div className={styles.formatChoice}>
                  <div className={styles.formatBadge}>Horizontal</div>
                  <div className={styles.formatLabel}>16:9 · YouTube / VODs</div>
                </div>
                <div className={styles.formatChoice}>
                  <div className={styles.formatBadge}>Square</div>
                  <div className={styles.formatLabel}>1:1 · Feed posts</div>
                </div>
              </div>
              <div className={styles.layoutHelpers}>
                <div className={styles.layoutHelper}>
                  <div className={styles.layoutLabel}>Safe zones</div>
                  <p className={styles.layoutHint}>Ensure overlays avoid platform UI and chat.</p>
                </div>
                <div className={styles.layoutHelper}>
                  <div className={styles.layoutLabel}>Caption style</div>
                  <p className={styles.layoutHint}>Bold gaming subtitles with subtle outline.</p>
                </div>
                <div className={styles.layoutHelper}>
                  <div className={styles.layoutLabel}>Transitions</div>
                  <p className={styles.layoutHint}>Quick cuts between big reactions and plays.</p>
                </div>
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
                <li className={styles.mediaItem}>
                  <div className={styles.mediaThumb} />
                  <div className={styles.mediaMeta}>
                    <div className={styles.mediaTitle}>Ace on Split · Round 11</div>
                    <p className={styles.mediaHint}>0:18 · Auto-clipped from last broadcast</p>
                  </div>
                  <span className={styles.mediaTag}>Clip</span>
                </li>
                <li className={styles.mediaItem}>
                  <div className={styles.mediaThumb} />
                  <div className={styles.mediaMeta}>
                    <div className={styles.mediaTitle}>Match MVP screenshot</div>
                    <p className={styles.mediaHint}>PNG · Captured via Capsules overlay</p>
                  </div>
                  <span className={styles.mediaTag}>Image</span>
                </li>
                <li className={styles.mediaItem}>
                  <div className={styles.mediaThumb} />
                  <div className={styles.mediaMeta}>
                    <div className={styles.mediaTitle}>“Community night” intro sting</div>
                    <p className={styles.mediaHint}>0:06 · Animated bumper</p>
                  </div>
                  <span className={styles.mediaTag}>Bumper</span>
                </li>
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
                <li className={styles.promptItem}>
                  <div className={styles.promptLabel}>Title &amp; hook</div>
                  <p className={styles.promptText}>
                    “He queued solo, but his aim didn&apos;t get the memo.”
                  </p>
                </li>
                <li className={styles.promptItem}>
                  <div className={styles.promptLabel}>Description</div>
                  <p className={styles.promptText}>
                    Short recap optimized for YouTube, with timestamps and a soft CTA to follow your
                    Capsule.
                  </p>
                </li>
                <li className={styles.promptItem}>
                  <div className={styles.promptLabel}>Cross-post copy</div>
                  <p className={styles.promptText}>
                    Variants for Discord announcements, Capsule posts, and a quick X / Threads caption.
                  </p>
                </li>
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
                  <div className={styles.fontChip}>Headline · Bold</div>
                  <div className={styles.fontChip} data-variant="sub">
                    Body · Clean
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

