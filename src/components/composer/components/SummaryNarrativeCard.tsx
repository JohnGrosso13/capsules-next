"use client";

import * as React from "react";

import summaryStyles from "../styles/composer-summary.module.css";
import type { SummaryResult } from "@/types/summary";
import type { SummaryConversationEntry, SummaryPresentationOptions } from "@/lib/composer/summary-context";

type SummaryNarrativeCardProps = {
  result: SummaryResult;
  options: SummaryPresentationOptions | null;
  entries: SummaryConversationEntry[];
  selectedEntry: SummaryConversationEntry | null;
  onSelectEntry(entry: SummaryConversationEntry | null): void;
  onAsk(entry: SummaryConversationEntry): void;
  onComment(entry: SummaryConversationEntry): void;
  onView(entry: SummaryConversationEntry): void;
};

const NORMALIZE_REGEX = /[^a-z0-9]+/gi;

function normalizeText(input: string | null | undefined): string {
  if (!input) return "";
  return input.toLowerCase().replace(NORMALIZE_REGEX, " ").trim();
}

function buildEntryResolver(entries: SummaryConversationEntry[]) {
  const index = entries.map((entry) => {
    const keys = new Set<string>();
    const register = (value: string | null | undefined) => {
      const normalized = normalizeText(value);
      if (normalized.length) {
        keys.add(normalized);
      }
    };
    register(entry.title);
    register(entry.summary);
    register(entry.author);
    (entry.highlights ?? []).forEach((highlight) => register(highlight));
    if (entry.summary) {
      entry.summary.split(/[\n.?!]/).forEach((segment) => register(segment));
    }
    return { entry, keys };
  });

  return (text: string, fallbackId: string): SummaryConversationEntry => {
    const normalized = normalizeText(text);
    if (!normalized.length) {
      return {
        id: fallbackId,
        summary: text,
        title: text,
        postId: null,
      };
    }
    let bestMatch: SummaryConversationEntry | null = null;
    let bestScore = 0;
    for (const { entry, keys } of index) {
      if (keys.has(normalized)) {
        return entry;
      }
      for (const key of keys) {
        if (!key.length) continue;
        if (key.includes(normalized) || normalized.includes(key)) {
          const score = Math.min(key.length, normalized.length);
          if (score > bestScore) {
            bestMatch = entry;
            bestScore = score;
          }
        }
      }
    }
    if (bestMatch) {
      return bestMatch;
    }
    return {
      id: fallbackId,
      summary: text,
      title: text,
      postId: null,
      highlights: [text],
    };
  };
}

export function SummaryNarrativeCard({
  result,
  options,
  entries,
  selectedEntry,
  onSelectEntry,
  onAsk,
  onComment,
  onView,
}: SummaryNarrativeCardProps) {
  const resolveEntry = React.useMemo(() => buildEntryResolver(entries), [entries]);

  const headlineHighlights = React.useMemo(() => {
    return result.highlights.slice(0, 5);
  }, [result.highlights]);

  const remainingHighlightCount = Math.max(0, result.highlights.length - headlineHighlights.length);

  const handleLineSelect = React.useCallback(
    (entry: SummaryConversationEntry) => {
      if (selectedEntry?.id === entry.id) {
        onSelectEntry(null);
        return;
      }
      onSelectEntry(entry);
    },
    [onSelectEntry, selectedEntry?.id],
  );

  const renderLine = React.useCallback(
    (text: string, id: string) => {
      const entry = resolveEntry(text, id);
      const isActive = selectedEntry?.id === entry.id;
      const hasPost = Boolean(entry.postId);
      return (
        <li key={id} className={summaryStyles.summaryNarrativeItem} data-active={isActive ? "true" : undefined}>
          <button
            type="button"
            className={summaryStyles.summaryNarrativeLineBtn}
            data-active={isActive ? "true" : undefined}
            onClick={() => handleLineSelect(entry)}
          >
            {text}
          </button>
          {isActive ? (
            <div className={summaryStyles.summaryDetailPanel}>
              <div className={summaryStyles.summaryDetailHeader}>
                <div className={summaryStyles.summaryDetailHeading}>
                  {entry.title ? <p className={summaryStyles.summaryDetailTitle}>{entry.title}</p> : null}
                  {entry.author ? (
                    <span className={summaryStyles.summaryDetailAuthor}>{entry.author}</span>
                  ) : null}
                </div>
                {entry.relativeTime ? (
                  <span className={summaryStyles.summaryDetailTimestamp}>{entry.relativeTime}</span>
                ) : null}
              </div>
              {entry.summary ? (
                <p className={summaryStyles.summaryDetailSummary}>{entry.summary}</p>
              ) : null}
              {entry.highlights && entry.highlights.length ? (
                <div className={summaryStyles.summaryDetailHighlights}>
                  {entry.highlights.map((highlight, index) => (
                    <span key={`${entry.id}-detail-highlight-${index}`} className={summaryStyles.summaryDetailHighlight}>
                      {highlight}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className={summaryStyles.summaryDetailActions}>
                <button type="button" className={summaryStyles.summaryNarrativeActionBtn} onClick={() => onAsk(entry)}>
                  Ask Capsule
                </button>
                <button
                  type="button"
                  className={summaryStyles.summaryNarrativeActionBtn}
                  onClick={() => onView(entry)}
                  disabled={!hasPost}
                  data-disabled={!hasPost ? "true" : undefined}
                >
                  View Post
                </button>
                <button
                  type="button"
                  className={summaryStyles.summaryNarrativeActionBtn}
                  onClick={() => onComment(entry)}
                  disabled={!hasPost}
                  data-disabled={!hasPost ? "true" : undefined}
                >
                  Draft Comment
                </button>
              </div>
            </div>
          ) : null}
        </li>
      );
    },
    [handleLineSelect, onAsk, onComment, onView, resolveEntry, selectedEntry?.id],
  );

  return (
    <section
      className={summaryStyles.summaryNarrativeCard}
      aria-label={options?.title ?? "Highlighted feed moments"}
    >
      {headlineHighlights.length ? (
        <div className={summaryStyles.summaryNarrativeSection}>
          <div className={summaryStyles.summaryHighlightHeading}>
            <h4 className={summaryStyles.summaryNarrativeSectionTitle}>Don&rsquo;t miss these</h4>
            {remainingHighlightCount ? (
              <span className={summaryStyles.summaryHighlightBadge}>
                +{remainingHighlightCount} more in feed
              </span>
            ) : null}
          </div>
          <div className={summaryStyles.summaryNarrativeListScroll}>
            <ul className={summaryStyles.summaryNarrativeList}>
              {headlineHighlights.map((highlight, index) =>
                renderLine(highlight, `highlight-${index}`),
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}




