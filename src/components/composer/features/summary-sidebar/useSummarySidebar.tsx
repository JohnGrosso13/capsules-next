"use client";

import * as React from "react";

import { PreviewColumn } from "../../components/PreviewColumn";
import { PostCard } from "@/components/home-feed/cards/PostCard";
import SummaryPreviewCommentForm from "./SummaryPreviewCommentForm";

import summaryStyles from "../../styles/composer-summary.module.css";
import type { SummaryConversationEntry } from "@/lib/composer/summary-context";
import type { PromptRunMode } from "../../types";
import { truncateText } from "../../utils/text";
import { COMPOSER_SUMMARY_ACTION_EVENT } from "@/lib/events";
import { homeFeedStore } from "@/hooks/useHomeFeed/homeFeedStore";
import type { HomeFeedPost } from "@/hooks/useHomeFeed";
import { formatFeedCount } from "@/hooks/useHomeFeed";
import { formatExactTime, formatTimeAgo } from "@/hooks/useHomeFeed/time";
import { buildViewerEnvelope } from "@/lib/feed/viewer-envelope";
import type { AuthClientUser } from "@/ports/auth-client";

type UseSummarySidebarParams = {
  summaryEntries: SummaryConversationEntry[];
  cloudflareEnabled: boolean;
  currentUser: AuthClientUser | null;
  canRemember: boolean;
  handleSuggestionSelect(prompt: string): void;
  handlePromptRun(
    prompt: string,
    options?: { mode?: PromptRunMode; preserveSummary?: boolean; includeReadyAttachment?: boolean },
  ): void;
};

export type SummarySidebarController = {
  summaryPanelOpen: boolean;
  setSummaryPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  summaryPreviewEntry: SummaryConversationEntry | null;
  setSummaryPreviewEntry: React.Dispatch<React.SetStateAction<SummaryConversationEntry | null>>;
  summaryPreviewContent: React.ReactNode;
  handleSummaryAsk(entry: SummaryConversationEntry): void;
  handleSummaryView(entry: SummaryConversationEntry): void;
  handleSummaryComment(entry: SummaryConversationEntry): void;
};

export function useSummarySidebar({
  summaryEntries,
  cloudflareEnabled,
  currentUser,
  canRemember,
  handleSuggestionSelect,
  handlePromptRun,
}: UseSummarySidebarParams): SummarySidebarController {
  const [summaryPanelOpen, setSummaryPanelOpen] = React.useState(false);
  const [summaryPreviewEntry, setSummaryPreviewEntry] = React.useState<SummaryConversationEntry | null>(null);
  const summarySignatureRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const signature = summaryEntries.map((entry) => entry.id).join("|");
    if (!summaryEntries.length) {
      summarySignatureRef.current = null;
      setSummaryPanelOpen(false);
      setSummaryPreviewEntry(null);
      return;
    }
    if (summarySignatureRef.current !== signature) {
      summarySignatureRef.current = signature;
      setSummaryPanelOpen(false);
      setSummaryPreviewEntry(null);
    }
  }, [summaryEntries]);

  const feedState = React.useSyncExternalStore(
    homeFeedStore.subscribe,
    homeFeedStore.getState,
    homeFeedStore.getState,
  );
  const feedPosts = React.useMemo(() => {
    return feedState.items
      .filter(
        (item): item is Extract<typeof feedState.items[number], { type: "post"; post: HomeFeedPost }> =>
          item.type === "post",
      )
      .map((item) => item.post);
  }, [feedState]);
  const summaryPreviewPost = React.useMemo<HomeFeedPost | null>(() => {
    if (!summaryPreviewEntry?.postId) return null;
    const target = summaryPreviewEntry.postId.trim();
    if (!target.length) return null;
    const found = feedPosts.find((post) => {
      if (post.id === target) return true;
      const dbId =
        typeof post.dbId === "string" && post.dbId.trim().length ? post.dbId.trim() : null;
      return dbId === target;
    });
    return found ?? null;
  }, [feedPosts, summaryPreviewEntry?.postId]);

  const { likePending, memoryPending, isRefreshing } = feedState;
  const previewViewerIdentifiers = React.useMemo(() => new Set<string>(), []);
  const previewFriendMenu = React.useMemo(
    () => ({
      canTarget: false,
      isOpen: false,
      isPending: false,
      onToggle: () => {},
      onRequest: () => {},
      onRemove: () => {},
    }),
    [],
  );
  const viewerEnvelope = React.useMemo(() => buildViewerEnvelope(currentUser), [currentUser]);
  const previewCurrentOrigin = React.useMemo(
    () => (typeof window !== "undefined" ? window.location.origin : null),
    [],
  );

  const handlePreviewToggleLike = React.useCallback((postId: string) => {
    void homeFeedStore.actions.toggleLike(postId);
  }, []);

  const handlePreviewToggleMemory = React.useCallback(
    (post: HomeFeedPost, desired: boolean) =>
      homeFeedStore.actions.toggleMemory(post.id, { desired, canRemember }),
    [canRemember],
  );

  const handleSummaryAsk = React.useCallback(
    (entry: SummaryConversationEntry) => {
      setSummaryPreviewEntry(entry);
      const snippet = truncateText(entry.summary ?? "", 220);
      const highlightContext =
        entry.highlights && entry.highlights.length ? `Highlights: ${entry.highlights.join(" | ")}` : null;
      const parts: string[] = [
        entry.author
          ? `Give me a friendly breakdown of ${entry.author}'s update.`
          : "Give me a friendly breakdown of this update.",
      ];
      if (entry.title) {
        parts.push(`Title: ${entry.title}`);
      }
      if (snippet) {
        parts.push(`Context: ${snippet}`);
      }
      if (highlightContext) {
        parts.push(highlightContext);
      }
      parts.push(
        "Explain why it matters and share two or three suggestions for how I could respond, follow up, or build on it.",
      );
      handlePromptRun(parts.join(" "), {
        mode: "chatOnly",
        preserveSummary: true,
        includeReadyAttachment: false,
      });
      setSummaryPanelOpen(false);
    },
    [handlePromptRun, setSummaryPanelOpen],
  );

  const handleSummaryView = React.useCallback((entry: SummaryConversationEntry) => {
    setSummaryPreviewEntry(entry);
    if (typeof window === "undefined") return;
    if (!entry.postId) return;
    window.dispatchEvent(
      new CustomEvent(COMPOSER_SUMMARY_ACTION_EVENT, {
        detail: { action: "view", postId: entry.postId },
      }),
    );
  }, []);

  const handleSummaryComment = React.useCallback(
    (entry: SummaryConversationEntry) => {
      const snippet = truncateText(entry.summary ?? "", 220);
      const promptSegments: string[] = [
        entry.author
          ? `Draft a short, friendly comment I can post on ${entry.author}'s update.`
          : "Draft a short, friendly comment I can post on this update.",
      ];
      if (snippet) {
        promptSegments.push(`Use this context: ${snippet}`);
      }
      handleSuggestionSelect(promptSegments.join(" "));
      setSummaryPreviewEntry(entry);
      if (typeof window !== "undefined" && entry.postId) {
        window.dispatchEvent(
          new CustomEvent(COMPOSER_SUMMARY_ACTION_EVENT, {
            detail: { action: "comment", postId: entry.postId },
          }),
        );
      }
    },
    [handleSuggestionSelect],
  );

  const summaryPreviewContent = React.useMemo(() => {
    if (!summaryPreviewEntry) return null;

    const hasPost = Boolean(summaryPreviewEntry.postId);

    const openInFeedButton = (
      <button
        type="button"
        className={summaryStyles.summaryPreviewActionBtn}
        onClick={() => handleSummaryView(summaryPreviewEntry)}
      >
        Open in feed
      </button>
    );

    const mobileBackButton = (
      <button
        type="button"
        className={`${summaryStyles.summaryPreviewBackBtn} ${summaryStyles.mobileOnly}`}
        onClick={() => setSummaryPreviewEntry(null)}
      >
        Back to composer
      </button>
    );

    const previewHeading = (
      <div className={summaryStyles.summaryPreviewShellHeader}>
        <div className={summaryStyles.summaryPreviewShellTitleGroup}>
          <span className={summaryStyles.summaryPreviewShellLabel}>Live post preview</span>
          {summaryPreviewEntry.title ? (
            <p className={summaryStyles.summaryPreviewShellTitle}>{summaryPreviewEntry.title}</p>
          ) : null}
          {summaryPreviewEntry.author ? (
            <span className={summaryStyles.summaryPreviewShellAuthor}>{summaryPreviewEntry.author}</span>
          ) : null}
        </div>
        <div className={summaryStyles.summaryPreviewShellMeta}>
          {summaryPreviewEntry.relativeTime ? (
            <span className={summaryStyles.summaryPreviewShellTimestamp}>{summaryPreviewEntry.relativeTime}</span>
          ) : null}
          {mobileBackButton}
        </div>
      </div>
    );

    if (summaryPreviewPost) {
      const baseCommentCount =
        typeof summaryPreviewPost.comments === "number"
          ? summaryPreviewPost.comments
          : typeof (summaryPreviewPost as { comment_count?: number }).comment_count === "number"
            ? ((summaryPreviewPost as { comment_count?: number }).comment_count ?? 0)
            : 0;

      return (
        <PreviewColumn hideHeader variant="compact">
          <div className={summaryStyles.summaryPreviewShell}>
            {previewHeading}
            <div className={summaryStyles.summaryPreviewShellBody}>
              <div className={summaryStyles.summaryPreviewScroll}>
                <PostCard
                  variant="preview"
                  post={summaryPreviewPost}
                  viewerIdentifiers={previewViewerIdentifiers}
                  likePending={Boolean(likePending[summaryPreviewPost.id])}
                  memoryPending={Boolean(memoryPending[summaryPreviewPost.id])}
                  remembered={Boolean(summaryPreviewPost.viewerRemembered ?? summaryPreviewPost.viewer_remembered ?? false)}
                  canRemember={canRemember}
                  friendMenu={previewFriendMenu}
                  cloudflareEnabled={cloudflareEnabled}
                  currentOrigin={previewCurrentOrigin}
                  formatCount={formatFeedCount}
                  timeAgo={formatTimeAgo}
                  exactTime={formatExactTime}
                  commentCount={baseCommentCount}
                  isRefreshing={isRefreshing}
                  documentSummaryPending={{}}
                  onToggleLike={handlePreviewToggleLike}
                  onToggleMemory={handlePreviewToggleMemory}
                  onDelete={() => {}}
                  onOpenLightbox={() => {}}
                  onAskDocument={() => {}}
                  onSummarizeDocument={() => {}}
                  onCommentClick={() => {}}
                />
              </div>
              <SummaryPreviewCommentForm
                postId={summaryPreviewPost.id}
                viewerEnvelope={viewerEnvelope}
                currentUser={currentUser}
              />
            </div>
            <div className={summaryStyles.summaryPreviewShellActions}>{openInFeedButton}</div>
          </div>
        </PreviewColumn>
      );
    }

    return (
      <PreviewColumn hideHeader variant="compact">
        <div className={summaryStyles.summaryPreviewShell}>
          {previewHeading}
          <div className={summaryStyles.summaryPreviewCard}>
            {hasPost ? (
              <p className={summaryStyles.summaryPreviewHint}>
                We couldn&apos;t load this post in the preview. Use Open in feed to view it in the timeline.
              </p>
            ) : (
              <p className={summaryStyles.summaryPreviewHint}>
                No post was linked to this summary yet. Open the feed to read the full story.
              </p>
            )}
          </div>
          <div className={summaryStyles.summaryPreviewShellActions}>{openInFeedButton}</div>
        </div>
      </PreviewColumn>
    );
  }, [
    canRemember,
    cloudflareEnabled,
    currentUser,
    handlePreviewToggleLike,
    handlePreviewToggleMemory,
    handleSummaryView,
    isRefreshing,
    likePending,
    memoryPending,
    previewCurrentOrigin,
    previewFriendMenu,
    previewViewerIdentifiers,
    summaryPreviewEntry,
    summaryPreviewPost,
    viewerEnvelope,
  ]);

  return {
    summaryPanelOpen,
    setSummaryPanelOpen,
    summaryPreviewEntry,
    setSummaryPreviewEntry,
    summaryPreviewContent,
    handleSummaryAsk,
    handleSummaryView,
    handleSummaryComment,
  };
}
