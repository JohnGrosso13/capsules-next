"use client";

import * as React from "react";

import summaryStyles from "../styles/composer-summary.module.css";
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
    <section className={summaryStyles.summaryContextPanel} aria-label="Summary references">
      <header className={summaryStyles.summaryContextHeader}>
        <h3 className={summaryStyles.summaryContextTitle}>Referenced updates</h3>
        <p className={summaryStyles.summaryContextSubtitle}>
          Ask follow-up questions, jump to a post, or draft a quick reply without leaving the flow.
        </p>
      </header>

      <ul className={summaryStyles.summaryContextList}>
        {entries.map((entry, index) => {
          const authorLabel = entry.author ?? `Update ${index + 1}`;
          const snippet =
            entry.summary.length > 320
              ? `${entry.summary.slice(0, 317).trimEnd()}...`
              : entry.summary;
          return (
            <li key={entry.id} className={summaryStyles.summaryContextItem}>
              <div className={summaryStyles.summaryContextMeta}>
                <span className={summaryStyles.summaryContextName}>{authorLabel}</span>
                {entry.relativeTime ? (
                  <span className={summaryStyles.summaryContextTime}>{entry.relativeTime}</span>
                ) : null}
              </div>

              <p className={summaryStyles.summaryContextSnippet}>{snippet}</p>

              {entry.highlights && entry.highlights.length ? (
                <div className={summaryStyles.summaryContextHighlights}>
                  {entry.highlights.map((highlight, highlightIndex) => (
                    <span
                      key={`${entry.id}-highlight-${highlightIndex}`}
                      className={summaryStyles.summaryContextHighlight}
                    >
                      {highlight}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className={summaryStyles.summaryContextActions}>
                <button
                  type="button"
                  className={summaryStyles.summaryContextActionBtn}
                  onClick={() => onAsk(entry)}
                >
                  Ask Capsule
                </button>
                {entry.postId ? (
                  <>
                    <button
                      type="button"
                      className={summaryStyles.summaryContextActionBtn}
                      onClick={() => onView(entry)}
                    >
                      View Post
                    </button>
                    <button
                      type="button"
                      className={summaryStyles.summaryContextActionBtn}
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
