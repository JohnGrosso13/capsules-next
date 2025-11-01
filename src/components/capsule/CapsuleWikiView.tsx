
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
  title: string;
  paragraphs: string[];
  excerpt: string;
  timestamp: string | null;
  citations: Array<{
    label: string;
    url: string | null;
    sourceId: string | null;
  }>;
  primaryUrl: string | null;
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

function resolveArticleEntries(snapshot: CapsuleHistorySnapshot): ArticleEntry[] {
  const entries: ArticleEntry[] = [];

  snapshot.sections.forEach((section) => {
    const content = selectDisplayContent(section);
    const articles = Array.isArray(content.articles) ? content.articles : [];
    if (articles.length) {
      articles.forEach((article) => {
        const metadata =
          article.metadata && typeof article.metadata === "object"
            ? (article.metadata as Record<string, unknown>)
            : {};
        const title =
          typeof metadata.title === "string" && metadata.title.trim().length
            ? metadata.title.trim()
            : section.title;
        const paragraphs = Array.isArray(metadata.paragraphs)
          ? (metadata.paragraphs as unknown[])
              .map((paragraph) =>
                typeof paragraph === "string" && paragraph.trim().length ? paragraph.trim() : null,
              )
              .filter((paragraph): paragraph is string => Boolean(paragraph))
          : [];
        const linksRaw = Array.isArray(metadata.links) ? (metadata.links as unknown[]) : [];
        const citations = linksRaw
          .map((link) => {
            if (!link || typeof link !== "object") return null;
            const record = link as Record<string, unknown>;
            const sourceId =
              typeof record.sourceId === "string" && record.sourceId.trim().length
                ? record.sourceId.trim()
                : null;
            const source = sourceId ? snapshot.sources[sourceId] ?? null : null;
            const rawUrl =
              typeof record.url === "string" && record.url.trim().length
                ? record.url.trim()
                : null;
            const url = rawUrl ?? source?.url ?? null;
            const rawLabel =
              typeof record.label === "string" && record.label.trim().length
                ? record.label.trim()
                : null;
            const label = rawLabel ?? source?.label ?? (source?.postId ? "Post" : "Source");
            if (!label) return null;
            return { label, url, sourceId };
          })
          .filter((entry): entry is ArticleEntry["citations"][number] => Boolean(entry));
        const excerptSource = article.text?.trim().length ? article.text.trim() : paragraphs[0] ?? "";
        const timestamps = article.sourceIds
          .map((sourceId) => snapshot.sources[sourceId]?.occurredAt)
          .filter((value): value is string => Boolean(value));
        const timestamp = timestamps[0] ?? section.timeframe.end ?? section.timeframe.start ?? null;
        entries.push({
          id: article.id,
          period: section.period,
          sectionTitle: section.title,
          title,
          paragraphs: paragraphs.length ? paragraphs : excerptSource.length ? [excerptSource] : [],
          excerpt: excerptSource,
          timestamp,
          citations,
          primaryUrl: citations.find((citation) => Boolean(citation.url))?.url ?? null,
        });
      });
      return;
    }

    const summaryText = content.summary.text?.trim() ?? "";
    content.highlights.forEach((highlight) => {
      const firstSourceId = highlight.sourceIds[0] ?? null;
      const source = firstSourceId ? snapshot.sources[firstSourceId] ?? null : null;
      const paragraphs = [summaryText, highlight.text]
        .map((paragraph) => (paragraph && paragraph.trim().length ? paragraph.trim() : null))
        .filter((paragraph): paragraph is string => Boolean(paragraph));
      const citation = source
        ? [
            {
              label: source.label ?? "Source",
              url: source.url ?? null,
              sourceId: source.id,
            },
          ]
        : [];
      entries.push({
        id: highlight.id,
        period: section.period,
        sectionTitle: section.title,
        title: section.title,
        paragraphs,
        excerpt: highlight.text,
        timestamp: source?.occurredAt ?? section.timeframe.end ?? section.timeframe.start,
        citations: citation,
        primaryUrl: citation.find((item) => Boolean(item.url))?.url ?? null,
      });
    });
  });

  return entries;
}

export function CapsuleWikiView({ snapshot, onEdit, canEdit, loading }: CapsuleWikiViewProps) {
  const [activePeriod, setActivePeriod] = React.useState(snapshot.sections[0]?.period ?? "weekly");
  const [query, setQuery] = React.useState("");

  const sections = snapshot.sections;
  const activeSection = sections.find((section) => section.period === activePeriod) ?? sections[0] ?? null;
  const activeContent = activeSection ? selectDisplayContent(activeSection) : null;

  const articles = React.useMemo(() => resolveArticleEntries(snapshot), [snapshot]);
  const filteredArticles = React.useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed.length) return articles;
    return articles.filter((article) => {
      const haystack = [
        article.title,
        article.sectionTitle,
        article.excerpt,
        ...article.paragraphs,
        ...article.citations.map((citation) => citation.label),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(trimmed);
    });
  }, [articles, query]);

  const activeSummaryText = activeContent?.summary.text?.trim() ?? "";
  const activeSummaryParagraphs = React.useMemo(
    () =>
      activeSummaryText.length
        ? activeSummaryText
            .split(/\n+/)
            .map((part) => part.trim())
            .filter((part) => part.length)
        : [],
    [activeSummaryText],
  );

  const activeSummarySources = React.useMemo(() => {
    if (!activeContent) return [];
    return (activeContent.summary.sourceIds ?? [])
      .map((sourceId) => {
        const source = snapshot.sources[sourceId] ?? null;
        if (!source) return null;
        return {
          id: sourceId,
          label: source.label ?? (source.postId ? "Capsule post" : "Source"),
          url: source.url ?? null,
        };
      })
      .filter((entry): entry is { id: string; label: string; url: string | null } => Boolean(entry));
  }, [activeContent, snapshot.sources]);
  const primarySummarySource = activeSummarySources.find((entry) => Boolean(entry.url)) ?? null;

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
              {primarySummarySource ? (
                <Link
                  href={primarySummarySource.url ?? ""}
                  className={styles.summaryPrimaryLink}
                  target="_blank"
                  rel="noreferrer"
                >
                  View source
                  <ArrowSquareOut size={12} weight="bold" />
                </Link>
              ) : null}
            </div>
          </div>
          {activeSummaryParagraphs.length ? (
            <div className={styles.panelSummary}>
              {activeSummaryParagraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          ) : (
            <p className={styles.panelPlaceholder}>Capsule AI hasn&apos;t generated a recap for this period yet.</p>
          )}
          {activeSummarySources.length ? (
            <div className={styles.summaryCitations}>
              <span className={styles.citationsLabel}>Sources</span>
              <ul>
                {activeSummarySources.map((entry) => (
                  <li key={entry.id}>
                    {entry.url ? (
                      <Link href={entry.url} target="_blank" rel="noreferrer">
                        {entry.label}
                        <ArrowSquareOut size={12} weight="bold" />
                      </Link>
                    ) : (
                      entry.label
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
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

      <div className={styles.periodRow}>
        {sections.map((section) => {
          const content = selectDisplayContent(section);
          const summary = content.summary.text?.trim() ?? "";
          const summaryExcerpt =
            summary.length > 180 ? `${summary.slice(0, 177)}...` : summary;
          const isActive = section.period === activePeriod;
          return (
            <button
              key={section.period}
              type="button"
              className={cn(styles.periodButton, isActive && styles.periodButtonActive)}
              onClick={() => setActivePeriod(section.period)}
            >
              <div className={styles.periodHeader}>
              <span className={styles.periodLabel}>{PERIOD_LABEL[section.period]}</span>
              <span className={styles.periodCount}>
                {section.postCount} {section.postCount === 1 ? "post" : "posts"}
              </span>
            </div>
              <span className={styles.periodRange}>
                {formatHistoryRange(section.timeframe.start, section.timeframe.end)}
              </span>
              {summaryExcerpt.length ? (
                <p className={styles.periodExcerpt}>{summaryExcerpt}</p>
              ) : (
                <p className={styles.periodExcerptMuted}>Capsule AI is watching for new updates.</p>
              )}
            </button>
          );
        })}
      </div>

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
              <h4 className={styles.articleTitle}>
                {article.primaryUrl ? (
                  <Link href={article.primaryUrl} className={styles.articleTitleLink} target="_blank" rel="noreferrer">
                    {article.title}
                    <ArrowSquareOut size={14} weight="bold" />
                  </Link>
                ) : (
                  article.title
                )}
              </h4>
              <div className={styles.articleBody}>
                {article.paragraphs.length
                  ? article.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)
                  : null}
              </div>
              {article.citations.length ? (
                <div className={styles.articleCitations}>
                  <span className={styles.citationsLabel}>Sources</span>
                  <ul>
                    {article.citations.map((citation, index) => {
                      const key = citation.sourceId ?? `${article.id}-${index}`;
                      if (citation.url) {
                        return (
                          <li key={key}>
                            <Link href={citation.url} target="_blank" rel="noreferrer">
                              {citation.label}
                              <ArrowSquareOut size={12} weight="bold" />
                            </Link>
                          </li>
                        );
                      }
                      return <li key={key}>{citation.label}</li>;
                    })}
                  </ul>
                </div>
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
