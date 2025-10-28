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
  onAsk(entry: SummaryConversationEntry): void;
  onComment(entry: SummaryConversationEntry): void;
  onView(entry: SummaryConversationEntry): void;
};

type ActiveSelection = {
  id: string;
  entry: SummaryConversationEntry;
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
  onAsk,
  onComment,
  onView,
}: SummaryNarrativeCardProps) {
  const [active, setActive] = React.useState<ActiveSelection | null>(null);
  const resolveEntry = React.useMemo(() => buildEntryResolver(entries), [entries]);

  const introLabel = React.useMemo(() => {
    const sourceLabel = options?.sourceLabel?.trim();
    if (sourceLabel && sourceLabel.length) {
      return `Here is what is happening in ${sourceLabel}:`;
    }
    return "Here is what I am seeing right now:";
  }, [options?.sourceLabel]);

  const summaryParagraphs = React.useMemo(() => {
    return result.summary
      .split(/\n+/)
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
  }, [result.summary]);

  const handleLineToggle = React.useCallback(
    (id: string, entry: SummaryConversationEntry) => {
      setActive((current) => {
        if (current?.id === id) {
          return null;
        }
        return { id, entry };
      });
    },
    [],
  );

  const renderLine = React.useCallback(
    (text: string, id: string) => {
      const entry = resolveEntry(text, id);
      const isActive = active?.id === id;
      const hasPost = Boolean(entry.postId);
      return (
        <li key={id} className={styles.summaryNarrativeItem}>
          <button
            type="button"
            className={styles.summaryNarrativeLineBtn}
            data-active={isActive ? "true" : undefined}
            onClick={() => handleLineToggle(id, entry)}
          >
            {text}
          </button>
          {isActive ? (
            <div className={styles.summaryNarrativeActions}>
              <button
                type="button"
                className={styles.summaryNarrativeActionBtn}
                onClick={() => onAsk(entry)}
              >
                Ask Capsule
              </button>
              <button
                type="button"
                className={styles.summaryNarrativeActionBtn}
                onClick={() => onView(entry)}
                disabled={!hasPost}
                data-disabled={!hasPost ? "true" : undefined}
              >
                View Post
              </button>
              <button
                type="button"
                className={styles.summaryNarrativeActionBtn}
                onClick={() => onComment(entry)}
                disabled={!hasPost}
                data-disabled={!hasPost ? "true" : undefined}
              >
                Draft Comment
              </button>
            </div>
          ) : null}
        </li>
      );
    },
    [active?.id, handleLineToggle, onAsk, onComment, onView, resolveEntry],
  );

  return (
    <section className={styles.summaryNarrativeCard} aria-label="Feed summary">
      <header className={styles.summaryNarrativeHeader}>
        <h3 className={styles.summaryNarrativeTitle}>{introLabel}</h3>
        {options?.title ? (
          <p className={styles.summaryNarrativeSubtitle}>{options.title}</p>
        ) : null}
      </header>

      {summaryParagraphs.length ? (
        <ul className={styles.summaryNarrativeList}>
          {summaryParagraphs.map((paragraph, index) =>
            renderLine(paragraph, `summary-${index}`),
          )}
        </ul>
      ) : null}

      {result.highlights.length ? (
        <div className={styles.summaryNarrativeSection}>
          <h4 className={styles.summaryNarrativeSectionTitle}>Highlights I noticed</h4>
          <ul className={styles.summaryNarrativeList}>
            {result.highlights.map((highlight, index) =>
              renderLine(highlight, `highlight-${index}`),
            )}
          </ul>
        </div>
      ) : null}

      {result.insights.length ? (
        <div className={styles.summaryNarrativeSection}>
          <h4 className={styles.summaryNarrativeSectionTitle}>What it could mean</h4>
          <ul className={styles.summaryNarrativeList}>
            {result.insights.map((insight, index) =>
              renderLine(insight, `insight-${index}`),
            )}
          </ul>
        </div>
      ) : null}

      {result.nextActions.length ? (
        <div className={styles.summaryNarrativeSection}>
          <h4 className={styles.summaryNarrativeSectionTitle}>Next steps to try</h4>
          <ul className={styles.summaryNarrativeList}>
            {result.nextActions.map((action, index) =>
              renderLine(action, `action-${index}`),
            )}
          </ul>
        </div>
      ) : null}

      {result.postTitle || result.postPrompt ? (
        <div className={styles.summaryNarrativeSection}>
          <h4 className={styles.summaryNarrativeSectionTitle}>Want to publish something next?</h4>
          {result.postTitle ? (
            renderLine(`Title: ${result.postTitle}`, "post-title")
          ) : null}
          {result.postPrompt ? (
            renderLine(`Prompt: ${result.postPrompt}`, "post-prompt")
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
