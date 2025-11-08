"use client";

import * as React from "react";

import styles from "../../ai-composer.module.css";
import type { SummaryResult } from "@/types/summary";
import type {
  SummaryConversationEntry,
  SummaryPresentationOptions,
} from "@/lib/composer/summary-context";

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

  const introLabel = React.useMemo(() => {
    const sourceLabel = options?.sourceLabel?.trim();
    if (sourceLabel && sourceLabel.length) {
      return `You're all caught up on ${sourceLabel}.`;
    }
    return "You're all caught up.";
  }, [options?.sourceLabel]);

  const summaryParagraphs = React.useMemo(() => {
    return result.summary
      .split(/\n+/)
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
  }, [result.summary]);

  const headlineHighlights = React.useMemo(() => {
    return result.highlights.slice(0, 5);
  }, [result.highlights]);

  const remainingHighlightCount = Math.max(0, result.highlights.length - headlineHighlights.length);

  const showPostSuggestion = Boolean(result.postTitle || result.postPrompt);

  const handleLineSelect = React.useCallback(
    (id: string, text: string) => {
      const entry = resolveEntry(text, id);
      if (selectedEntry?.id === entry.id) {
        onSelectEntry(null);
        return;
      }
      onSelectEntry(entry);
    },
    [onSelectEntry, resolveEntry, selectedEntry?.id],
  );

  const renderLine = React.useCallback(
    (text: string, id: string) => {
      const entry = resolveEntry(text, id);
      const isActive = selectedEntry?.id === entry.id;
      return (
        <li key={id} className={styles.summaryNarrativeItem}>
          <button
            type="button"
            className={styles.summaryNarrativeLineBtn}
            data-active={isActive ? "true" : undefined}
            onClick={() => handleLineSelect(id, text)}
          >
            {text}
          </button>
        </li>
      );
    },
    [handleLineSelect, resolveEntry, selectedEntry?.id],
  );

  const selectionDetails = selectedEntry ? (
    <div className={styles.summarySelectionCard}>
      <div className={styles.summarySelectionMeta}>
        <div className={styles.summarySelectionIdentity}>
          {selectedEntry.title ? (
            <p className={styles.summarySelectionTitle}>{selectedEntry.title}</p>
          ) : null}
          {selectedEntry.author ? (
            <span className={styles.summarySelectionAuthor}>{selectedEntry.author}</span>
          ) : null}
        </div>
        {selectedEntry.relativeTime ? (
          <span className={styles.summarySelectionTimestamp}>{selectedEntry.relativeTime}</span>
        ) : null}
      </div>
      {selectedEntry.summary ? (
        <p className={styles.summarySelectionSummary}>{selectedEntry.summary}</p>
      ) : null}
      {selectedEntry.highlights && selectedEntry.highlights.length ? (
        <div className={styles.summarySelectionHighlights}>
          {selectedEntry.highlights.map((highlight, index) => (
            <span
              key={`${selectedEntry.id}-selection-highlight-${index}`}
              className={styles.summarySelectionHighlight}
            >
              {highlight}
            </span>
          ))}
        </div>
      ) : null}
      <div className={styles.summarySelectionActions}>
        <button
          type="button"
          className={styles.summaryNarrativeActionBtn}
          onClick={() => onAsk(selectedEntry)}
        >
          Ask Capsule
        </button>
        <button
          type="button"
          className={styles.summaryNarrativeActionBtn}
          onClick={() => onView(selectedEntry)}
          disabled={!selectedEntry.postId}
          data-disabled={!selectedEntry.postId ? "true" : undefined}
        >
          View Post
        </button>
        <button
          type="button"
          className={styles.summaryNarrativeActionBtn}
          onClick={() => onComment(selectedEntry)}
          disabled={!selectedEntry.postId}
          data-disabled={!selectedEntry.postId ? "true" : undefined}
        >
          Draft Comment
        </button>
      </div>
    </div>
  ) : (
    <div className={styles.summarySelectionPlaceholder}>
      <p>Tap a highlight to see the full context and quick actions.</p>
    </div>
  );

  return (
    <section className={styles.summaryNarrativeCard} aria-label="Feed summary">
      <header className={styles.summaryNarrativeHeader}>
        <h3 className={styles.summaryNarrativeTitle}>{introLabel}</h3>
        {options?.title ? (
          <p className={styles.summaryNarrativeSubtitle}>{options.title}</p>
        ) : null}
        <p className={styles.summaryNarrativeNote}>
          Capsule pulled the loudest moments so you can react, comment, or ask for help in seconds.
        </p>
      </header>

      {summaryParagraphs.length ? (
        <ul className={styles.summaryNarrativeList}>
          {summaryParagraphs.map((paragraph, index) =>
            renderLine(paragraph, `summary-${index}`),
          )}
        </ul>
      ) : null}

      {headlineHighlights.length ? (
        <div className={styles.summaryNarrativeSection}>
          <div className={styles.summaryHighlightHeading}>
            <h4 className={styles.summaryNarrativeSectionTitle}>Don't miss these</h4>
            {remainingHighlightCount ? (
              <span className={styles.summaryHighlightBadge}>
                +{remainingHighlightCount} more in feed
              </span>
            ) : null}
          </div>
          <ul className={styles.summaryNarrativeList}>
            {headlineHighlights.map((highlight, index) =>
              renderLine(highlight, `highlight-${index}`),
            )}
          </ul>
          <div className={styles.summarySelectionSection}>{selectionDetails}</div>
        </div>
      ) : null}

      {showPostSuggestion ? (
        <div className={`${styles.summaryNarrativeSection} ${styles.summaryCta}`}>
          <div>
            <h4 className={styles.summaryCtaTitle}>Need to respond fast?</h4>
            <p className={styles.summaryCtaNote}>
              Capsule can draft a reply or post. Tap to open the suggestion and fire it off.
            </p>
          </div>
          <div className={styles.summaryCtaLines}>
            {result.postTitle ? renderLine(`Title: ${result.postTitle}`, "post-title") : null}
            {result.postPrompt ? renderLine(`Prompt: ${result.postPrompt}`, "post-prompt") : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}




