
"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowSquareOut, MagnifyingGlass, Sparkle } from "@phosphor-icons/react/dist/ssr";

import { cn } from "@/lib/cn";
import type {
  CapsuleHistorySection,
  CapsuleHistorySectionContent,
  CapsuleHistorySnapshot,
} from "@/types/capsules";

import styles from "./CapsuleWikiView.module.css";

const PERIOD_LABEL: Record<CapsuleHistorySection["period"], string> = {
  weekly: "This Week",
  monthly: "This Month",
  all_time: "All Time",
};

type CapsuleWikiViewProps = {
  snapshot: CapsuleHistorySnapshot;
  onEdit?: () => void;
  canEdit: boolean;
  loading: boolean;
};

type ArticleEntry = {
  id: string;
  period: CapsuleHistorySection["period"];
  sectionTitle: string;
  text: string;
  sourceLabel: string | null;
  sourceUrl: string | null;
  timestamp: string | null;
};

function selectDisplayContent(section: CapsuleHistorySection): CapsuleHistorySectionContent {
  return section.published ?? section.suggested;
}

function formatHistoryRange(start: string | null, end: string | null): string {
  if (!start && !end) return "All time";
  const startDate = start ? new Date(start) : null;
  const endDate = end ? new Date(end) : null;
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const normalize = (date: Date | null) =>
    date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(undefined, options) : null;
  const startText = normalize(startDate);
  const endText = normalize(endDate);
  if (startText && endText) {
    if (startText === endText) return startText;
    return `${startText} - ${endText}`;
  }
  if (startText) return `Since ${startText}`;
  if (endText) return `Through ${endText}`;
  return "All time";
}

function resolveHighlightArticles(snapshot: CapsuleHistorySnapshot): ArticleEntry[] {
  const entries: ArticleEntry[] = [];
  for (const section of snapshot.sections) {
    const content = selectDisplayContent(section);
    for (const highlight of content.highlights) {
      const firstSourceId = highlight.sourceIds[0] ?? null;
      const source = firstSourceId ? snapshot.sources[firstSourceId] ?? null : null;
      entries.push({
        id: highlight.id,
        period: section.period,
        sectionTitle: section.title,
        text: highlight.text,
        sourceLabel: source?.label ?? null,
        sourceUrl: source?.url ?? null,
        timestamp: source?.occurredAt ?? section.timeframe.end ?? section.timeframe.start,
      });
    }
  }
  return entries;
}

export function CapsuleWikiView({ snapshot, onEdit, canEdit, loading }: CapsuleWikiViewProps) {
  const [activePeriod, setActivePeriod] = React.useState(snapshot.sections[0]?.period ?? "weekly");
  const [query, setQuery] = React.useState("");

  const sections = snapshot.sections;
  const activeSection = sections.find((section) => section.period === activePeriod) ?? sections[0] ?? null;
  const activeContent = activeSection ? selectDisplayContent(activeSection) : null;

  const articles = React.useMemo(() => resolveHighlightArticles(snapshot), [snapshot]);
  const filteredArticles = React.useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed.length) return articles;
    return articles.filter((article) =>
      article.text.toLowerCase().includes(trimmed) || article.sectionTitle.toLowerCase().includes(trimmed),
    );
  }, [articles, query]);

  return (
    <section className={styles.wrapper}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>Capsule Wiki</h2>
          <p className={styles.subtitle}>
            Group history and milestones generated from your capsule activity. Search, read, and resurface highlights.
          </p>
        </div>
        <div className={styles.headerActions}>
          {canEdit ? (
            <button type="button" className={styles.editButton} onClick={onEdit} disabled={loading}>
              Edit Wiki
            </button>
          ) : null}
        </div>
      </header>

      <div className={styles.searchRow}>
        <MagnifyingGlass size={18} weight="bold" className={styles.searchIcon} />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search summaries or articles"
          className={styles.searchInput}
        />
      </div>

      <div className={styles.tileRow}>
        {sections.map((section) => {
          const content = selectDisplayContent(section);
          const summary = content.summary.text?.trim() ?? "";
          const isActive = section.period === activePeriod;
          return (
            <button
              key={section.period}
              type="button"
              className={cn(styles.summaryTile, isActive && styles.summaryTileActive)}
              onClick={() => setActivePeriod(section.period)}
            >
              <div className={styles.tileFace}>
                <span className={styles.tileLabel}>{PERIOD_LABEL[section.period]}</span>
                <span className={styles.tileMeta}>{formatHistoryRange(section.timeframe.start, section.timeframe.end)}</span>
                <span className={styles.tileCount}>
                  {section.postCount} {section.postCount === 1 ? "post" : "posts"}
                </span>
              </div>
              <div className={styles.tileBack}>
                <p className={styles.tileSummary}>
                  {summary.length ? summary : "No summary yet ? tap to edit."}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {activeSection && activeContent ? (
        <div className={styles.summaryPanel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.panelPeriod}>{PERIOD_LABEL[activeSection.period]}</span>
              <span className={styles.panelRange}>
                {formatHistoryRange(activeSection.timeframe.start, activeSection.timeframe.end)}
              </span>
            </div>
            <div className={styles.panelMeta}>
              <Sparkle size={16} weight="fill" />
              <span>AI generated summary</span>
            </div>
          </div>
          {activeContent.summary.text?.trim().length ? (
            <p className={styles.panelSummary}>{activeContent.summary.text}</p>
          ) : (
            <p className={styles.panelPlaceholder}>No recap yet. Ask Capsule AI to generate one in Edit mode.</p>
          )}
          {activeContent.timeline.length ? (
            <div className={styles.panelSection}>
              <h4>Timeline Highlights</h4>
              <ul className={styles.timelineList}>
                {activeContent.timeline.map((item) => (
                  <li key={item.id} className={styles.timelineItem}>
                    <div className={styles.timelineLabel}>
                      <span>{item.label}</span>
                      {item.timestamp ? (
                        <span className={styles.timelineDate}>
                          {new Date(item.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                      ) : null}
                    </div>
                    {item.detail ? <p>{item.detail}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={styles.articlesHeader}>
        <h3>Articles</h3>
        {canEdit ? (
          <button type="button" className={styles.newArticleButton} onClick={onEdit} disabled={loading}>
            + New Article
          </button>
        ) : null}
      </div>
      <div className={styles.articlesList}>
        {filteredArticles.length ? (
          filteredArticles.map((article) => (
            <article key={article.id} className={styles.articleCard}>
              <div className={styles.articleMeta}>
                <span className={styles.articleSection}>{PERIOD_LABEL[article.period]}</span>
                {article.timestamp ? (
                  <span className={styles.articleDate}>
                    {new Date(article.timestamp).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                ) : null}
              </div>
              <h4 className={styles.articleTitle}>{article.sectionTitle}</h4>
              <p className={styles.articleBody}>{article.text}</p>
              {article.sourceUrl ? (
                <Link href={article.sourceUrl} className={styles.articleLink} target="_blank" rel="noreferrer">
                  {article.sourceLabel ?? "View source"}
                  <ArrowSquareOut size={14} weight="bold" />
                </Link>
              ) : null}
            </article>
          ))
        ) : (
          <div className={styles.emptyState}>
            <p>No articles matched your search. Try another keyword or create a new article.</p>
          </div>
        )}
      </div>
    </section>
  );
}

export default CapsuleWikiView;
