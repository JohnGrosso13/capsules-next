import type { Metadata } from "next";

import { AppPage } from "@/components/app-page";
import { AiPrompterStage } from "@/components/ai-prompter-stage";

import styles from "./insights.page.module.css";
import { UploadDropzone } from "./upload-dropzone";

type AnalysisEntry = {
  id: string;
  timestamp: string;
  title: string;
  notes: string[];
};

const ANALYSIS_ENTRIES: AnalysisEntry[] = [
  {
    id: "analysis_1",
    timestamp: "02:14",
    title: "Early pressure fight",
    notes: ["Great positioning but rotated out late", "Callouts were calm, need earlier ult plan"],
  },
  {
    id: "analysis_2",
    timestamp: "14:52",
    title: "Mid-game reset",
    notes: [
      "Energy dip after wipe — take a 60s reset",
      "Warmup routine helped mechanics; keep the same opener next session",
    ],
  },
  {
    id: "analysis_3",
    timestamp: "26:18",
    title: "Clutch push",
    notes: ["Decision-making looked confident", "Great tempo; keep pacing at this speed"],
  },
];

export const metadata: Metadata = {
  title: "Personal Coach Studio - Capsules",
  description:
    "Upload sessions or clips and let Capsules surface key moments, coaching notes, and a focused practice plan.",
};

export default function PersonalCoachPage() {
  return (
    <AppPage activeNav="create" showPrompter={false} layoutVariant="capsule">
      <div className={styles.shell} data-surface="insights">
        <header className={`${styles.header} ${styles.headerUpload}`} aria-label="Upload your clip">
          <div className={styles.headerMain}>
            <div className={styles.pill}>Personal Coach</div>
            <h1 className={styles.title}>Upload your clip</h1>
            <p className={styles.subtitle}>
              Drop a video clip you&apos;d like us to analyze and improve. Drag and drop or browse to upload MP4
              or MOV files up to 1GB.
            </p>
          </div>
          <div className={styles.headerUploadDrop}>
            <UploadDropzone />
          </div>
        </header>

        <main className={styles.layout}>
          <section className={styles.columnPrimary} aria-label="Chat and coach feedback">
            <section className={styles.card} aria-label="Chat with your coach">
              <header className={styles.cardHeaderStacked}>
                <h2 className={styles.cardTitle}>Chat with your coach</h2>
                <p className={styles.cardSubtitle}>
                  Discuss your coach&apos;s analysis, ask follow-up questions, or turn it into a simple plan you
                  can run next session.
                </p>
              </header>
              <div className={styles.chatShell}>
                <div className={styles.chatContext}>
                  <div className={styles.chatCoachBubble}>
                    <p className={styles.chatCoachLabel}>Coach</p>
                    <p className={styles.chatCoachLead}>Here&apos;s what I&apos;m seeing in this session.</p>
                    <p className={styles.chatCoachText}>
                      Your focus is strongest once you&apos;re warmed up. Ask about any moment you&apos;re unsure
                      about, or what to practice next so we can turn this analysis into clear steps.
                    </p>
                  </div>
                  <p className={styles.chatHintLine}>
                    Try asking: <span>&quot;What should I work on first?&quot;</span>{" "}
                    <span>&quot;Turn this into a 3-step plan.&quot;</span>
                  </p>
                </div>
                <div className={styles.chatPrompter}>
                  <AiPrompterStage
                    placeholder="Ask for a highlight reel, next steps, or clarification..."
                    chips={[]}
                    surface="personal_coach_chat"
                    submitVariant="icon"
                    showStatusRow={false}
                    showSuggestedActions={false}
                  />
                </div>
              </div>
            </section>
          </section>

          <section className={styles.columnSecondary} aria-label="Written analysis">
            <section className={styles.card} aria-label="Written analysis">
              <header className={styles.cardHeaderStacked}>
                <h2 className={styles.cardTitle}>Written analysis</h2>
                <p className={styles.cardSubtitle}>
                  Time-stamped highlights from your coach so you can revisit key moments quickly.
                </p>
              </header>
              <ul className={styles.analysisList}>
                {ANALYSIS_ENTRIES.map((entry) => (
                  <li key={entry.id} className={styles.analysisItem}>
                    <div className={styles.analysisTimestamp}>{entry.timestamp}</div>
                    <div className={styles.analysisContent}>
                      <div className={styles.analysisTitle}>{entry.title}</div>
                      <ul className={styles.analysisNotes}>
                        {entry.notes.map((note, index) => (
                          <li key={`${entry.id}_note_${index}`} className={styles.analysisNote}>
                            {note}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </section>
        </main>
      </div>
    </AppPage>
  );
}
