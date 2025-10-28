"use client";

import * as React from "react";

import styles from "../../ai-composer.module.css";
import type { SummaryConversationEntry } from "@/lib/composer/summary-context";

type SummaryContextPanelProps = {
  entries: SummaryConversationEntry[];
  onAsk(entry: SummaryConversationEntry): void;
  onComment(entry: SummaryConversationEntry): void;
  onView(entry: SummaryConversationEntry): void;
};

export function SummaryContextPanel({
  entries,
  onAsk,
  onComment,
  onView,
}: SummaryContextPanelProps) {
  if (!entries.length) return null;

  return (
    <section className={styles.summaryContextPanel} aria-label="Summary references">
      <header className={styles.summaryContextHeader}>
        <h3 className={styles.summaryContextTitle}>Referenced updates</h3>
        <p className={styles.summaryContextSubtitle}>
          Ask follow-up questions, jump to a post, or draft a quick reply without leaving the flow.
        </p>
      </header>

      <ul className={styles.summaryContextList}>
        {entries.map((entry, index) => {
          const authorLabel = entry.author ?? `Update ${index + 1}`;
          const snippet =
            entry.summary.length > 320
              ? `${entry.summary.slice(0, 317).trimEnd()}...`
              : entry.summary;
          return (
            <li key={entry.id} className={styles.summaryContextItem}>
              <div className={styles.summaryContextMeta}>
                <span className={styles.summaryContextName}>{authorLabel}</span>
                {entry.relativeTime ? (
                  <span className={styles.summaryContextTime}>{entry.relativeTime}</span>
                ) : null}
              </div>

              <p className={styles.summaryContextSnippet}>{snippet}</p>

              {entry.highlights && entry.highlights.length ? (
                <div className={styles.summaryContextHighlights}>
                  {entry.highlights.map((highlight, highlightIndex) => (
                    <span
                      key={`${entry.id}-highlight-${highlightIndex}`}
                      className={styles.summaryContextHighlight}
                    >
                      {highlight}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className={styles.summaryContextActions}>
                <button
                  type="button"
                  className={styles.summaryContextActionBtn}
                  onClick={() => onAsk(entry)}
                >
                  Ask Capsule
                </button>
                {entry.postId ? (
                  <>
                    <button
                      type="button"
                      className={styles.summaryContextActionBtn}
                      onClick={() => onView(entry)}
                    >
                      View Post
                    </button>
                    <button
                      type="button"
                      className={styles.summaryContextActionBtn}
                      onClick={() => onComment(entry)}
                    >
                      Draft Comment
                    </button>
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
