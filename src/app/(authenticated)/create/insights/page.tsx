import type { Metadata } from "next";
import Image from "next/image";
import React from "react";

import { CloudArrowUp, Headphones } from "@phosphor-icons/react/dist/ssr";

import { AppPage } from "@/components/app-page";
import { AiPrompterStage } from "@/components/ai-prompter-stage";

import styles from "./insights.page.module.css";
import { UploadDropzone } from "./upload-dropzone";

type ActionCard = {
  id: string;
  title: string;
  description: string;
  cta: string;
  tone: "upload" | "live";
  icon: React.ReactElement;
};

type UpdateCard = {
  id: string;
  title: string;
  meta: string;
  image: string;
};

type ChatMessage = {
  id: string;
  from: "coach" | "user";
  text?: string;
  title?: string;
  image?: string;
};

const ACTIONS: ActionCard[] = [
  {
    id: "upload",
    title: "Analyze My Clip",
    description: "Upload a clip, get expert analysis and tips.",
    cta: "Upload Clip",
    tone: "upload",
    icon: <CloudArrowUp size={26} weight="fill" />,
  },
  {
    id: "live",
    title: "Start Live Session",
    description: "Get real-time feedback and coaching.",
    cta: "Launch Capsule",
    tone: "live",
    icon: <Headphones size={26} weight="fill" />,
  },
];

const RECENT_UPDATES: UpdateCard[] = [
  {
    id: "update_1",
    title: "Shamna bp: Tune shorter intros.",
    meta: "2m • SCP",
    image:
      "https://images.unsplash.com/photo-1517242810446-cc8951b2be90?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "update_2",
    title: "Terns Clip Feedback.",
    meta: "20m • STP",
    image:
      "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "update_3",
    title: "Snowboarding analysts.",
    meta: "1hr • SP",
    image:
      "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "update_4",
    title: "Mountain trail review.",
    meta: "Yesterday • HD",
    image:
      "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1200&q=80",
  },
];

const CHAT_MESSAGES: ChatMessage[] = [
  {
    id: "chat_intro",
    from: "coach",
    title: "ChatGPT, your personal coach!",
    text: "Certainly! Let me analyze your mountain biking clip.",
  },
  {
    id: "chat_insight_1",
    from: "coach",
    text: "Your positioning is mostly centered, which is great for balance, but you can try lowering your center of gravity a bit more to gain better control during turns and rough terrain.",
  },
  {
    id: "chat_insight_2",
    from: "coach",
    text: "In the last segment, your speed through that rocky section appears a little fast. You might benefit from braking earlier, maintaining control, and adjusting your weight back before entering. I can create a clip to show this.",
  },
  {
    id: "chat_user",
    from: "user",
    text: "That sounds helpful. Please create a clip to demonstrate if you’d like!",
  },
  {
    id: "chat_clip",
    from: "coach",
    image:
      "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1200&q=80",
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
      <div className={styles.page} data-surface="insights">
        <div className={styles.layout}>
          <div className={styles.columnMain}>
            <section className={`${styles.panel} ${styles.heroCard}`} aria-label="Personal Coach actions">
              <header className={styles.heroHeader}>
                <p className={styles.eyebrow}>Personal Coach</p>
                <h1 className={styles.heroTitle}>
                  Personal <span className={styles.accent}>Coach</span>
                </h1>
                <p className={styles.heroSubtitle}>Upload your clips for personalized feedback and analysis.</p>
              </header>
              <div className={styles.actionGrid}>
                {ACTIONS.map((action) => (
                  <article key={action.id} className={styles.actionCard} data-tone={action.tone}>
                    <div className={styles.actionIcon} aria-hidden>
                      {action.icon}
                    </div>
                    <div className={styles.actionCopy}>
                      <p className={styles.actionTitle}>{action.title}</p>
                      <p className={styles.actionText}>{action.description}</p>
                    </div>
                    <div className={styles.actionControl}>
                      {action.tone === "upload" ? (
                        <UploadDropzone inputId="personal-coach-upload" variant="button" />
                      ) : (
                        <button type="button" className={styles.secondaryButton}>
                          {action.cta}
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className={`${styles.panel} ${styles.mediaCard}`} aria-label="Clip analysis and feedback">
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Clip Analysis &amp; Feedback</h2>
              </div>
              <div className={styles.videoFrame}>
                <div
                  className={styles.videoImage}
                  role="presentation"
                  aria-hidden="true"
                  style={{
                    backgroundImage:
                      "url(https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1600&q=80)",
                  }}
                />
                <div className={styles.videoOverlay}>
                  <div className={styles.videoScrim} />
                  <div className={styles.videoMetaRow}>
                    <div className={styles.videoProgress}>
                      <div className={styles.videoProgressFill} style={{ width: "42%" }} />
                    </div>
                    <div className={styles.videoTime}>
                      <span>1:36</span>
                      <span>/ 3:45</span>
                      <span className={styles.videoBadge}>HD</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className={`${styles.panel} ${styles.updatesCard}`} aria-label="Recent updates">
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Recent Updates</h2>
                <button type="button" className={styles.linkButton}>
                  View all
                </button>
              </div>
              <div className={styles.updatesGrid}>
                {RECENT_UPDATES.map((update) => (
                  <article
                    key={update.id}
                    className={styles.updateCard}
                    style={{ backgroundImage: `url(${update.image})` }}
                  >
                    <div className={styles.updateOverlay} />
                    <div className={styles.updateMeta}>
                      <span className={styles.updateMetaTag}>{update.meta}</span>
                      <h3 className={styles.updateTitle}>{update.title}</h3>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <aside className={styles.columnChat} aria-label="Coach chat">
            <section className={`${styles.panel} ${styles.chatCard}`}>
              <header className={styles.chatHeader}>
                <div>
                  <p className={styles.sectionLabel}>Coach Chat</p>
                  <p className={styles.sectionSubLabel}>ChatGPT, your personal coach</p>
                </div>
                <div className={styles.chatHeaderActions}>
                  <span className={styles.iconBadge} aria-hidden>
                    ↗
                  </span>
                  <span className={styles.iconBadge} aria-hidden>
                    ⚙
                  </span>
                </div>
              </header>

              <div className={styles.chatMessages} role="log" aria-live="polite">
                {CHAT_MESSAGES.map((message) => (
                  <div
                    key={message.id}
                    className={`${styles.chatBubble} ${
                      message.from === "user" ? styles.chatBubbleUser : styles.chatBubbleCoach
                    }`}
                  >
                    {message.title ? <p className={styles.chatBubbleTitle}>{message.title}</p> : null}
                    {message.text ? <p className={styles.chatBubbleText}>{message.text}</p> : null}
                    {message.image ? (
                      <div className={styles.chatImage} aria-hidden>
                        <Image src={message.image} alt="" fill sizes="(min-width: 1100px) 320px, 100vw" />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className={styles.chipRow} aria-label="Quick actions">
                {["Ask For Tip", "Clip Feedback", "More"].map((chip) => (
                  <button key={chip} type="button" className={styles.chipButton}>
                    {chip}
                  </button>
                ))}
              </div>

              <div className={styles.chatInput}>
                <AiPrompterStage
                  placeholder="Type your question..."
                  chips={[]}
                  surface="personal_coach_chat"
                  submitVariant="icon"
                  showStatusRow={false}
                  showSuggestedActions={false}
                />
              </div>
            </section>
          </aside>
        </div>
      </div>
    </AppPage>
  );
}
