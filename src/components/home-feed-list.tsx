"use client";

import * as React from "react";
import Image from "next/image";
import type Hls from "hls.js";

import styles from "./home-feed.module.css";
import {
  Brain,
  Heart,
  ChatCircle,
  ShareNetwork,
  DotsThreeCircleVertical,
  Trash,
  HourglassHigh,
  Play,
  CaretLeft,
  CaretRight,
  X,
} from "@phosphor-icons/react/dist/ssr";
import { PostMenu } from "@/components/posts/PostMenu";
import { normalizeMediaUrl, canRenderInlineImage } from "@/lib/media";
import type { HomeFeedAttachment, HomeFeedPost } from "@/hooks/useHomeFeed";
import { resolveToAbsoluteUrl } from "@/lib/url";
import { shouldBypassCloudflareImages } from "@/lib/cloudflare/runtime";
import { useComposer } from "@/components/composer/ComposerProvider";
import { useOptionalFriendsDataContext } from "@/components/providers/FriendsDataProvider";
import {
  buildDocumentCardData,
  buildPrompterAttachment,
  DocumentAttachmentCard,
  type DocumentCardData,
} from "@/components/documents/document-card";
import { requestSummary, normalizeSummaryResponse } from "@/lib/ai/client-summary";
import type { PrompterAttachment } from "@/components/ai-prompter-stage";
import type { SummaryAttachmentInput } from "@/types/summary";
import type {
  SummaryConversationContext,
  SummaryConversationEntry,
} from "@/lib/composer/summary-context";
import { useCurrentUser } from "@/services/auth/client";
import {
  describeAttachmentSet,
  detectAttachmentKind,
  extractAttachmentMeta,
  formatHintList,
  normalizeAttachmentName,
  stripExtension,
  buildPostMediaCollections,
  type FeedGalleryItem,
  type PostMediaCollections,
} from "@/components/home-feed/utils";
import { CommentPanel } from "@/components/comments/CommentPanel";
import type {
  CommentAttachment,
  CommentModel,
  CommentThreadState,
  CommentSubmitPayload,
} from "@/components/comments/types";
import { EMPTY_THREAD_STATE } from "@/components/comments/types";
import { safeRandomUUID } from "@/lib/random";
import {
  SUMMARIZE_FEED_REQUEST_EVENT,
  SUMMARIZE_FEED_STATUS_EVENT,
  COMPOSER_SUMMARY_ACTION_EVENT,
  type SummarizeFeedRequestDetail,
  type SummarizeFeedRequestOrigin,
  type ComposerSummaryActionDetail,
} from "@/lib/events";

type LazyImageProps = React.ComponentProps<typeof Image>;

const LazyImage = React.forwardRef<HTMLImageElement, LazyImageProps>(
  ({ loading, alt, ...rest }, ref) => (
    <Image ref={ref} loading={loading ?? "lazy"} alt={alt} {...rest} />
  ),
);

LazyImage.displayName = "LazyImage";

function describePoll(question: unknown): string | null {
  if (typeof question !== "string") return null;
  const trimmed = question.trim();
  if (!trimmed.length) return null;
  return `Running a poll: "${trimmed}".`;
}

function normalizeIdentifier(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    value = String(value);
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function buildIdentifierSet(...identifiers: Array<unknown>): Set<string> {
  const result = new Set<string>();
  for (const entry of identifiers) {
    const normalized = normalizeIdentifier(entry);
    if (normalized) {
      result.add(normalized);
    }
  }
  return result;
}

function sanitizeCounts(source: unknown, length: number): number[] | null {
  if (!Array.isArray(source)) return null;
  const values = (source as unknown[]).map((entry) => {
    const numeric = typeof entry === "number" ? entry : Number(entry);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.trunc(numeric));
  });
  return Array.from({ length }, (_, index) => values[index] ?? 0);
}

function createEmptyThreadState(): CommentThreadState {
  return { status: "idle", comments: [], error: null };
}

function normalizeCommentFromApi(
  raw: Record<string, unknown>,
  fallbackPostId: string,
): CommentModel {
  const rawId = raw.id;
  const id =
    typeof rawId === "string" && rawId.trim().length ? rawId.trim() : safeRandomUUID();
  const postIdValue = raw.postId ?? raw.post_id ?? fallbackPostId;
  const postId =
    typeof postIdValue === "string" && postIdValue.trim().length
      ? postIdValue.trim()
      : fallbackPostId;
  const content =
    typeof raw.content === "string" ? raw.content : typeof raw.body === "string" ? raw.body : "";
  const userName =
    typeof raw.userName === "string"
      ? raw.userName
      : typeof raw.user_name === "string"
        ? raw.user_name
        : null;
  const userAvatar =
    typeof raw.userAvatar === "string"
      ? raw.userAvatar
      : typeof raw.user_avatar === "string"
        ? raw.user_avatar
        : null;
  const capsuleId =
    typeof raw.capsuleId === "string"
      ? raw.capsuleId
      : typeof raw.capsule_id === "string"
        ? raw.capsule_id
        : null;
  const tsValue = raw.ts ?? raw.created_at ?? new Date().toISOString();
  const ts = typeof tsValue === "string" && tsValue.trim().length ? tsValue : new Date().toISOString();

  const attachmentsRaw = Array.isArray((raw as { attachments?: unknown }).attachments)
    ? ((raw as { attachments?: unknown[] }).attachments as unknown[])
    : [];
  const attachments = attachmentsRaw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const attachmentId =
        typeof record.id === "string" && record.id.trim().length ? record.id.trim() : safeRandomUUID();
      const url =
        typeof record.url === "string" && record.url.trim().length ? record.url.trim() : null;
      if (!url) return null;
      const name =
        typeof record.name === "string" && record.name.trim().length
          ? record.name.trim()
          : null;
      const mimeType =
        typeof record.mimeType === "string"
          ? record.mimeType
          : typeof record.mime_type === "string"
            ? record.mime_type
            : null;
      const thumbnail =
        typeof record.thumbnailUrl === "string"
          ? record.thumbnailUrl
          : typeof record.thumbnail_url === "string"
            ? record.thumbnail_url
            : null;
      const sizeValue = record.size;
      const size =
        typeof sizeValue === "number" && Number.isFinite(sizeValue)
          ? sizeValue
          : typeof sizeValue === "string"
            ? Number.parseInt(sizeValue, 10) || null
            : null;
      const storageKey =
        typeof record.storageKey === "string"
          ? record.storageKey
          : typeof record.storage_key === "string"
            ? record.storage_key
            : null;
      const sessionId =
        typeof record.sessionId === "string"
          ? record.sessionId
          : typeof record.session_id === "string"
            ? record.session_id
            : null;
      const source =
        typeof record.source === "string" && record.source.trim().length
          ? record.source.trim()
          : null;
      const attachmentRecord: CommentAttachment = {
        id: attachmentId,
        url,
        name,
        mimeType,
        thumbnailUrl: thumbnail,
        size: size ?? null,
        storageKey,
        sessionId,
        source,
      };
      return attachmentRecord;
    })
    .filter((attachment): attachment is CommentAttachment => attachment !== null);

  return {
    id,
    postId,
    content,
    userName,
    userAvatar,
    capsuleId,
    ts,
    attachments,
    userId:
      typeof raw.userId === "string"
        ? raw.userId
        : typeof raw.user_id === "string"
          ? raw.user_id
          : null,
    pending: false,
    error: null,
  };
}

type ActionKey = "like" | "comment" | "share";

type HomeFeedListProps = {
  posts: HomeFeedPost[];
  likePending: Record<string, boolean>;
  memoryPending: Record<string, boolean>;
  activeFriendTarget: string | null;
  friendActionPending: string | null;
  onToggleLike(postId: string): void;
  onToggleMemory(post: HomeFeedPost, desired: boolean): Promise<boolean | void> | boolean | void;
  onFriendRequest(post: HomeFeedPost, identifier: string): Promise<void> | void;
  onDelete(postId: string): void;
  onRemoveFriend(post: HomeFeedPost, identifier: string): Promise<void> | void;
  onToggleFriendTarget(identifier: string | null): void;
  formatCount(value?: number | null): string;
  timeAgo(iso?: string | null): string;
  exactTime(iso?: string | null): string;
  canRemember: boolean;
  hasFetched: boolean;
  isRefreshing: boolean;
  emptyMessage?: string;
  focusPostId?: string | null;
};

export function HomeFeedList({
  posts,
  likePending,
  memoryPending,
  activeFriendTarget,
  friendActionPending,
  onToggleLike,
  onToggleMemory,
  onFriendRequest,
  onDelete,
  onToggleFriendTarget,
  onRemoveFriend,
  formatCount,
  timeAgo,
  exactTime,
  canRemember,
  hasFetched,
  isRefreshing,
  emptyMessage,
  focusPostId,
}: HomeFeedListProps) {
  const composer = useComposer();
  const { user: currentUser } = useCurrentUser();
  const friendsData = useOptionalFriendsDataContext();
  const viewerUserId =
    typeof currentUser?.id === "string" && currentUser.id.trim().length ? currentUser.id.trim() : null;
  const viewerUserKey =
    typeof currentUser?.key === "string" && currentUser.key.trim().length
      ? currentUser.key.trim()
      : null;
  const supabaseViewerId =
    typeof friendsData?.viewerId === "string" && friendsData.viewerId.trim().length
      ? friendsData.viewerId.trim()
      : null;
  const viewerIdentifierSet = React.useMemo(
    () => buildIdentifierSet(viewerUserId, viewerUserKey, supabaseViewerId),
    [viewerUserId, viewerUserKey, supabaseViewerId],
  );
  const [lightbox, setLightbox] = React.useState<{
    postId: string;
    index: number;
    items: Array<{
      id: string;
      kind: "image" | "video";
      fullUrl: string;
      fullSrcSet?: string | null;
      displayUrl: string;
      displaySrcSet?: string | null;
      thumbnailUrl?: string | null;
      name: string | null;
      alt: string;
      mimeType: string | null;
      width: number | null;
      height: number | null;
      aspectRatio: number | null;
    }>;
  } | null>(null);

  const INITIAL_BATCH = 6;
  const BATCH_SIZE = 6;
  const [visibleCount, setVisibleCount] = React.useState(INITIAL_BATCH);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);
  const [documentSummaryPending, setDocumentSummaryPending] = React.useState<Record<string, boolean>>(
    {},
  );
  const [feedSummaryPending, setFeedSummaryPending] = React.useState(false);
  const [commentThreads, setCommentThreads] = React.useState<Record<string, CommentThreadState>>({});
  const [commentSubmitting, setCommentSubmitting] = React.useState<Record<string, boolean>>({});
  const [activeComment, setActiveComment] = React.useState<{ postId: string } | null>(null);
  const commentAnchorRef = React.useRef<HTMLElement | null>(null);
  const summaryOriginRef = React.useRef<SummarizeFeedRequestOrigin>("external");

  const showSkeletons = !hasFetched;

  React.useEffect(() => {
    if (!hasFetched) {
      setVisibleCount(INITIAL_BATCH);
      return;
    }
    setVisibleCount((previous) => {
      const total = posts.length;
      if (total === 0) return 0;
      const baseline = Math.min(INITIAL_BATCH, total);
      if (previous === 0) return baseline;
      const bounded = Math.min(Math.max(previous, baseline), total);
      return bounded;
    });
  }, [hasFetched, posts.length]);

  React.useEffect(() => {
    if (!hasFetched) return;
    if (posts.length <= visibleCount) return;
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.find((item) => item.isIntersecting);
        if (!entry) return;
        setVisibleCount((previous) => {
          const total = posts.length;
          if (total === 0) return 0;
          if (previous >= total) return previous;
          const next = Math.min(total, previous + BATCH_SIZE);
          return next;
        });
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasFetched, posts.length, visibleCount]);

  const visibleLimit = showSkeletons ? 0 : Math.min(visibleCount, posts.length);
  const displayedPosts = React.useMemo(() => {
    if (showSkeletons) return [];
    return posts.slice(0, visibleLimit || posts.length);
  }, [showSkeletons, posts, visibleLimit]);

  const [pendingFocusPostId, setPendingFocusPostId] = React.useState<string | null>(() => {
    if (typeof focusPostId === "string" && focusPostId.trim().length) {
      return focusPostId.trim();
    }
    return null;
  });

  React.useEffect(() => {
    if (typeof focusPostId === "string" && focusPostId.trim().length) {
      const trimmed = focusPostId.trim();
      setPendingFocusPostId((previous) => (previous === trimmed ? previous : trimmed));
    } else if (focusPostId === null) {
      setPendingFocusPostId(null);
    }
  }, [focusPostId]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!pendingFocusPostId) return;
    if (!displayedPosts.length) return;
    const hasPost = displayedPosts.some((post) => post.id === pendingFocusPostId);
    if (!hasPost) return;

    const raf = window.requestAnimationFrame(() => {
      const escapedId =
        typeof CSS !== "undefined" && typeof CSS.escape === "function"
          ? CSS.escape(pendingFocusPostId)
          : pendingFocusPostId.replace(/["'\\]/g, "\\$&");
      const card = document.querySelector<HTMLElement>(`[data-post-id="${escapedId}"]`);
      if (!card) return;
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      card.setAttribute("data-summary-flash", "true");
      window.setTimeout(() => {
        card.removeAttribute("data-summary-flash");
      }, 2400);
      setPendingFocusPostId(null);
    });

    return () => window.cancelAnimationFrame(raf);
  }, [pendingFocusPostId, displayedPosts]);
  const viewerEnvelope = React.useMemo(() => {
    if (!currentUser) return null;
    const provider = currentUser.provider ?? "guest";
    const envelope: Record<string, unknown> = {
      provider,
      email: currentUser.email ?? null,
      full_name: currentUser.name ?? null,
      avatar_url: currentUser.avatarUrl ?? null,
    };
    if (currentUser.provider === "clerk") {
      envelope.clerk_id = currentUser.id ?? null;
    } else {
      envelope.clerk_id = null;
    }
    envelope.key =
      currentUser.key ?? (currentUser.provider === "clerk" ? `clerk:${currentUser.id}` : currentUser.id);
    return envelope;
  }, [currentUser]);
  const skeletons = React.useMemo(
    () =>
      Array.from({ length: 4 }, (_, index) => (
        <article key={`skeleton-${index}`} className={styles.card} data-skeleton="true" aria-hidden>
          <header className={styles.cardHead}>
            <span className={styles.avatarWrap} data-skeleton-block />
            <div data-skeleton-stack>
              <span data-skeleton-line />
              <span data-skeleton-line />
            </div>
            <span className={styles.iconBtn} data-skeleton-block />
          </header>
          <div className={styles.cardBody} data-skeleton-stack>
            <span data-skeleton-line />
            <span data-skeleton-line />
            <span data-skeleton-line />
          </div>
          <div className={styles.mediaGallery} data-skeleton-gallery>
            <span data-skeleton-tile />
            <span data-skeleton-tile />
            <span data-skeleton-tile />
          </div>
          <footer className={styles.actionBar}>
            <span data-skeleton-pill />
            <span data-skeleton-pill />
            <span data-skeleton-pill />
          </footer>
        </article>
      )),
    [],
  );

  const shouldShowSentinel = !showSkeletons && displayedPosts.length < posts.length;
  const cloudflareEnabled = React.useMemo(() => !shouldBypassCloudflareImages(), []);
  const currentOrigin = React.useMemo(
    () => (typeof window !== "undefined" ? window.location.origin : null),
    [],
  );

  const closeLightbox = React.useCallback(() => {
    setLightbox(null);
  }, []);

  const handleCloseButtonClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      closeLightbox();
    },
    [closeLightbox],
  );

  const navigateLightbox = React.useCallback((step: number) => {
    setLightbox((prev) => {
      if (!prev || !prev.items.length) return prev;
      const total = prev.items.length;
      const nextIndex = (((prev.index + step) % total) + total) % total;
      return {
        ...prev,
        index: nextIndex,
      };
    });
  }, []);

  React.useEffect(() => {
    if (!lightbox) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeLightbox();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        navigateLightbox(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        navigateLightbox(-1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightbox, closeLightbox, navigateLightbox]);

  React.useEffect(() => {
    if (!lightbox) return undefined;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [lightbox]);

  const handleAskDocument = React.useCallback(
    (doc: DocumentCardData) => {
      const promptSegments = [`Summarize the document "${doc.name}" for the capsule.`];
      if (doc.summary) {
        promptSegments.push(`Existing summary: ${doc.summary}`);
      } else if (doc.snippet) {
        promptSegments.push(`Preview: ${doc.snippet}`);
      }
      const attachment = buildPrompterAttachment(doc);
      composer
        .submitPrompt(promptSegments.join("\n\n"), [attachment])
        .catch((error) => console.error("Document prompt submit failed", error));
    },
    [composer],
  );

  const handleSummarizeDocument = React.useCallback(
    async (doc: DocumentCardData) => {
      const docMeta =
        doc.meta && typeof doc.meta === "object" && !Array.isArray(doc.meta)
          ? (doc.meta as Record<string, unknown>)
          : null;
      const docThumbnailUrl =
        docMeta && typeof (docMeta as { thumbnail_url?: unknown }).thumbnail_url === "string"
          ? ((docMeta as { thumbnail_url?: string }).thumbnail_url ?? null)
          : docMeta && typeof (docMeta as { thumb?: unknown }).thumb === "string"
            ? ((docMeta as { thumb?: string }).thumb ?? null)
            : null;

      setDocumentSummaryPending((prev) => ({ ...prev, [doc.id]: true }));
      try {
        const summaryPayload = await requestSummary({
          target: "document",
          attachments: [
            {
              id: doc.id,
              name: doc.name,
              excerpt: doc.summary ?? doc.snippet ?? null,
              text: doc.summary ?? doc.snippet ?? null,
              url: doc.openUrl ?? doc.url ?? null,
              mimeType: doc.mimeType ?? null,
              thumbnailUrl: docThumbnailUrl,
            },
          ],
          meta: {
            title: doc.name,
          },
        });
        const summaryResult = normalizeSummaryResponse(summaryPayload);
        const docSummaryText =
          (doc.summary ?? doc.snippet ?? "").trim().length > 0
            ? (doc.summary ?? doc.snippet ?? "").trim()
            : `Key takeaways from "${doc.name}".`;
        const attachmentId = `document-summary-${doc.id}`;
        const documentContext: SummaryConversationContext = {
          source: summaryResult.source,
          title: doc.name,
          entries: [
            {
              id: attachmentId,
              postId: null,
              title: doc.name,
              author: null,
              summary: docSummaryText,
              attachmentId,
            },
          ],
        };
        const documentAttachments: PrompterAttachment[] = [
          {
            id: attachmentId,
            name: doc.name,
            mimeType: "text/plain",
            size: docSummaryText.length,
            url: doc.openUrl ?? doc.url ?? `https://capsule.local/documents/${doc.id}`,
            role: "reference",
            source: "ai",
            excerpt: docSummaryText,
          },
        ];
        composer.showSummary(
          summaryResult,
          {
            title: doc.name,
            sourceLabel: doc.name,
            sourceType: summaryResult.source,
          },
          {
            context: documentContext,
            attachments: documentAttachments,
          },
        );
      } catch (error) {
        console.error("Document summary failed", error);
      } finally {
        setDocumentSummaryPending((prev) => {
          const next = { ...prev };
          delete next[doc.id];
          return next;
        });
      }
    },
    [composer],
  );

  const handleSummarizeFeed = React.useCallback(async () => {
    if (feedSummaryPending || !displayedPosts.length) return;
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(SUMMARIZE_FEED_STATUS_EVENT, {
          detail: { status: "started", origin: summaryOriginRef.current },
        }),
      );
    }
    setFeedSummaryPending(true);
    try {
      const segmentSource = displayedPosts.slice(0, Math.min(8, displayedPosts.length));
      const attachmentPayload: SummaryAttachmentInput[] = [];
      const seenAttachmentUrls = new Set<string>();
      const summaryEntries: SummaryConversationEntry[] = [];
      const conversationAttachments: PrompterAttachment[] = [];
      const segments = segmentSource.map((post, index) => {
        const author = post.user_name ?? (post as { userName?: string }).userName ?? "Someone";
        const created =
          post.created_at ??
          (post as { createdAt?: string | null | undefined }).createdAt ??
          null;
        const relative = created ? timeAgo(created) : "";
        const raw = typeof post.content === "string" ? post.content : "";
        const normalized = raw.replace(/\s+/g, " ").trim();
        const content =
          normalized.length > 360 ? `${normalized.slice(0, 357).trimEnd()}...` : normalized;
        const attachmentsList = Array.isArray(post.attachments) ? post.attachments : [];
        const { summary: attachmentSummary, hints: attachmentHints } = describeAttachmentSet(
          attachmentsList,
          typeof post.mediaUrl === "string" ? post.mediaUrl : null,
        );
        const mediaPrompt =
          ((post as { media_prompt?: string | null }).media_prompt ??
            (post as { mediaPrompt?: string | null }).mediaPrompt ??
            null) ?? null;
        const trimmedPrompt =
          typeof mediaPrompt === "string" && mediaPrompt.trim().length ? mediaPrompt.trim() : "";
        const pollQuestion =
          (post.poll && typeof post.poll.question === "string" ? post.poll.question : null) ??
          (post as { poll_question?: string | null }).poll_question ??
          (post as { pollQuestion?: string | null }).pollQuestion ??
          null;
        const pollSummary = describePoll(pollQuestion);
        for (let attachmentIndex = 0; attachmentIndex < attachmentsList.length; attachmentIndex += 1) {
          if (attachmentPayload.length >= 6) break;
          const attachment = attachmentsList[attachmentIndex];
          if (!attachment) continue;
          const rawUrl = typeof attachment.url === "string" ? attachment.url : null;
          if (!rawUrl) continue;
          const absoluteUrl = resolveToAbsoluteUrl(rawUrl) ?? rawUrl;
          const absoluteThumb =
            typeof attachment.thumbnailUrl === "string" && attachment.thumbnailUrl.length
              ? resolveToAbsoluteUrl(attachment.thumbnailUrl) ?? attachment.thumbnailUrl
              : null;
          if (!absoluteUrl.length || seenAttachmentUrls.has(absoluteUrl)) continue;
          seenAttachmentUrls.add(absoluteUrl);
          const attachmentId =
            typeof attachment.id === "string" && attachment.id.trim().length
              ? attachment.id.trim()
              : `${post.id}-attachment-${attachmentIndex}`;
          const attachmentDescription =
            extractAttachmentMeta(attachment.meta) ?? normalizeAttachmentName(attachment.name);
          attachmentPayload.push({
            id: attachmentId,
            name: attachment.name ?? null,
            url: absoluteUrl,
            mimeType: attachment.mimeType ?? null,
            excerpt: attachmentDescription ?? null,
            text: attachmentDescription ?? null,
            thumbnailUrl: absoluteThumb,
          });
        }
        if (attachmentPayload.length < 6 && typeof post.mediaUrl === "string" && post.mediaUrl.trim().length) {
          const primaryUrl = resolveToAbsoluteUrl(post.mediaUrl) ?? post.mediaUrl;
          if (primaryUrl.length && !seenAttachmentUrls.has(primaryUrl)) {
            seenAttachmentUrls.add(primaryUrl);
            attachmentPayload.push({
              id: `${post.id}-primary`,
              name: null,
              url: primaryUrl,
              mimeType: null,
              excerpt: null,
              text: null,
              thumbnailUrl: null,
            });
          }
        }
        const labelPrefix = `#${index + 1}`;
        const narrativeParts: string[] = [];
        if (content.length) {
          narrativeParts.push(content);
        } else if (trimmedPrompt.length) {
          narrativeParts.push(trimmedPrompt);
        }
        if (attachmentSummary) {
          narrativeParts.push(attachmentSummary);
        }
        const themedHints = attachmentHints.filter((hint) => hint.length <= 200);
        if (themedHints.length) {
          narrativeParts.push(`Themes noted: ${formatHintList(themedHints, 3)}.`);
        }
        if (pollSummary) {
          narrativeParts.push(pollSummary);
        }
        if (!narrativeParts.length) {
          narrativeParts.push("Shared a fresh update with new media.");
        }
        const snippetSegments = [
          `${labelPrefix} ${author}${relative ? ` (${relative})` : ""}:`,
          ...narrativeParts,
        ];
        const segmentText = snippetSegments.join(" ");

        const attachmentId =
          typeof post.id === "string" && post.id.trim().length
            ? `feed-summary-${post.id}`
            : `feed-summary-${index}`;
        const entryHighlights = [
          ...themedHints,
          ...(pollSummary ? [pollSummary] : []),
        ];
        const entryTitleSource =
          trimmedPrompt.length > 0
            ? trimmedPrompt
            : content.length > 0
              ? content
              : narrativeParts[0] ?? "";
        const entryTitle =
          entryTitleSource.length > 140
            ? `${entryTitleSource.slice(0, 137).trimEnd()}...`
            : entryTitleSource || null;
        summaryEntries.push({
          id: attachmentId,
          postId: typeof post.id === "string" ? post.id : null,
          title: entryTitle,
          author,
          summary: segmentText,
          highlights: entryHighlights.length ? entryHighlights : [],
          relativeTime: relative || null,
          attachmentId,
        });

        const contextLines = [
          `Post ID: ${typeof post.id === "string" ? post.id : `feed-${index}`}`,
          `Author: ${author}`,
        ];
        if (relative) {
          contextLines.push(`When: ${relative}`);
        }
        contextLines.push(`Details: ${narrativeParts.join(" ")}`);
        if (themedHints.length) {
          contextLines.push(`Themes: ${themedHints.join(", ")}`);
        }
        if (pollSummary) {
          contextLines.push(`Poll: ${pollSummary}`);
        }
        const contextText = contextLines.join("\n");
        conversationAttachments.push({
          id: attachmentId,
          name: author ? `${author}'s update` : `Feed update ${index + 1}`,
          mimeType: "text/plain",
          size: contextText.length,
          url: `https://capsule.local/feed/${typeof post.id === "string" ? post.id : index}`,
          role: "reference",
          source: "ai",
          excerpt: contextText,
        });

        return segmentText;
      });
      const summaryPayload = await requestSummary({
        target: "feed",
        segments,
        attachments: attachmentPayload,
        meta: {
          title: "Recent activity",
          timeframe: "latest updates",
        },
      });
      const summaryResult = normalizeSummaryResponse(summaryPayload);
      const summaryContext: SummaryConversationContext = {
        source: summaryResult.source,
        title: "Feed recap",
        entries: summaryEntries,
      };
      composer.showSummary(
        summaryResult,
        {
          title: "Feed recap",
          sourceLabel: "Current feed",
          sourceType: summaryResult.source,
        },
        {
          context: summaryContext,
          attachments: conversationAttachments,
        },
      );
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(SUMMARIZE_FEED_STATUS_EVENT, {
            detail: { status: "success", origin: summaryOriginRef.current },
          }),
        );
      }
    } catch (error) {
      console.error("Feed summary failed", error);
      if (typeof window !== "undefined") {
        const reason =
          error && typeof error === "object" && "message" in error && typeof error.message === "string"
            ? error.message
            : null;
        window.dispatchEvent(
          new CustomEvent(SUMMARIZE_FEED_STATUS_EVENT, {
            detail: { status: "error", origin: summaryOriginRef.current, reason },
          }),
        );
      }
    } finally {
      setFeedSummaryPending(false);
      summaryOriginRef.current = "external";
    }
  }, [composer, displayedPosts, feedSummaryPending, timeAgo]);

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleRequest = (event: Event) => {
      const detail = (event as CustomEvent<SummarizeFeedRequestDetail> | null)?.detail ?? null;
      const origin: SummarizeFeedRequestOrigin = detail?.origin ?? "external";
      if (feedSummaryPending) {
        window.dispatchEvent(
          new CustomEvent(SUMMARIZE_FEED_STATUS_EVENT, {
            detail: { status: "busy", origin },
          }),
        );
        return;
      }
      if (!displayedPosts.length) {
        window.dispatchEvent(
          new CustomEvent(SUMMARIZE_FEED_STATUS_EVENT, {
            detail: { status: "empty", origin },
          }),
        );
        return;
      }
      summaryOriginRef.current = origin;
      void handleSummarizeFeed();
    };
    window.addEventListener(SUMMARIZE_FEED_REQUEST_EVENT, handleRequest);
    return () => {
      window.removeEventListener(SUMMARIZE_FEED_REQUEST_EVENT, handleRequest);
    };
  }, [displayedPosts.length, feedSummaryPending, handleSummarizeFeed]);

  const loadComments = React.useCallback(
    async (postId: string) => {
      setCommentThreads((previous) => {
        const prevState = previous[postId] ?? createEmptyThreadState();
        return {
          ...previous,
          [postId]: { ...prevState, status: "loading", error: null },
        };
      });
      try {
        const response = await fetch(`/api/comments?postId=${encodeURIComponent(postId)}`, {
          method: "GET",
          credentials: "include",
        });
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new Error(text || "Failed to load comments.");
        }
        const payload = (await response.json().catch(() => null)) as {
          comments?: unknown[];
        } | null;
        const comments = Array.isArray(payload?.comments)
          ? payload!.comments
              .map((entry) =>
                entry && typeof entry === "object"
                  ? normalizeCommentFromApi(entry as Record<string, unknown>, postId)
                  : null,
              )
              .filter((entry): entry is CommentModel => Boolean(entry))
          : [];
        setCommentThreads((previous) => ({
          ...previous,
          [postId]: { status: "loaded", comments, error: null },
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load comments.";
        setCommentThreads((previous) => {
          const prevState = previous[postId] ?? createEmptyThreadState();
          if (prevState.comments.length) {
            return {
              ...previous,
              [postId]: { status: "loaded", comments: prevState.comments, error: message },
            };
          }
          return {
            ...previous,
            [postId]: { status: "error", comments: [], error: message },
          };
        });
        throw error;
      }
    },
    [],
  );

  const submitComment = React.useCallback(
    async (payload: CommentSubmitPayload) => {
      const optimistic: CommentModel = {
        id: payload.clientId,
        postId: payload.postId,
        content: payload.content,
        userName:
          payload.userName ??
          currentUser?.name ??
          currentUser?.email ??
          "You",
        userAvatar: payload.userAvatar ?? currentUser?.avatarUrl ?? null,
        capsuleId: payload.capsuleId ?? null,
        ts: payload.ts,
        attachments: payload.attachments,
        userId: viewerUserId,
        pending: true,
        error: null,
      };
      setCommentThreads((previous) => {
        const prevState = previous[payload.postId] ?? createEmptyThreadState();
        return {
          ...previous,
          [payload.postId]: {
            status: "loaded",
            comments: [...prevState.comments, optimistic],
            error: null,
          },
        };
      });
      setCommentSubmitting((previous) => ({ ...previous, [payload.postId]: true }));
      try {
        const response = await fetch("/api/comments", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            comment: {
              id: payload.clientId,
              postId: payload.postId,
              content: payload.content,
              attachments: payload.attachments,
              capsuleId: payload.capsuleId ?? null,
              capsule_id: payload.capsuleId ?? null,
              ts: payload.ts,
              userName:
                payload.userName ??
                currentUser?.name ??
                currentUser?.email ??
                null,
              userAvatar: payload.userAvatar ?? currentUser?.avatarUrl ?? null,
              source: "web",
            },
            user: viewerEnvelope,
          }),
        });
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new Error(text || "Failed to submit comment.");
        }
        const json = (await response.json().catch(() => null)) as { comment?: unknown } | null;
        const persisted =
          json?.comment && typeof json.comment === "object"
            ? normalizeCommentFromApi(json.comment as Record<string, unknown>, payload.postId)
            : { ...optimistic, pending: false };
        setCommentThreads((previous) => {
          const prevState = previous[payload.postId] ?? createEmptyThreadState();
          const comments = prevState.comments.map((entry) =>
            entry.id === payload.clientId ? { ...persisted, pending: false } : entry,
          );
          return {
            ...previous,
            [payload.postId]: { status: "loaded", comments, error: null },
          };
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to submit comment.";
        setCommentThreads((previous) => {
          const prevState = previous[payload.postId] ?? createEmptyThreadState();
          const comments = prevState.comments.filter((entry) => entry.id !== payload.clientId);
          return {
            ...previous,
            [payload.postId]: {
              status: "error",
              comments,
              error: message,
            },
          };
        });
        throw error;
      } finally {
        setCommentSubmitting((previous) => {
          const next = { ...previous };
          delete next[payload.postId];
          return next;
        });
      }
    },
    [currentUser?.avatarUrl, currentUser?.email, currentUser?.name, viewerEnvelope, viewerUserId],
  );

  const handleCommentButtonClick = React.useCallback((post: HomeFeedPost, target: HTMLElement) => {
    setActiveComment((previous) => {
      const next = previous?.postId === post.id ? null : { postId: post.id };
      commentAnchorRef.current = next ? target : null;
      return next;
    });
  }, []);

  const closeComments = React.useCallback(() => {
    setActiveComment(null);
    commentAnchorRef.current = null;
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleSummaryAction = (event: Event) => {
      const detail = (event as CustomEvent<ComposerSummaryActionDetail> | null)?.detail ?? null;
      if (!detail?.postId) return;
      const targetPost = displayedPosts.find((entry) => entry.id === detail.postId);
      if (!targetPost) return;

      const card = document.querySelector<HTMLElement>(`[data-post-id="${detail.postId}"]`);
      if (card) {
        card.scrollIntoView({ behavior: "smooth", block: "center" });
        card.setAttribute("data-summary-flash", "true");
        window.setTimeout(() => {
          card.removeAttribute("data-summary-flash");
        }, 2400);
      }

      if (detail.action === "comment") {
        const anchor =
          (card?.querySelector<HTMLElement>('[data-action-key="comment"]') ?? card) ?? null;
        commentAnchorRef.current = anchor;
        setActiveComment({ postId: detail.postId });
        void loadComments(detail.postId);
      }
    };
    window.addEventListener(COMPOSER_SUMMARY_ACTION_EVENT, handleSummaryAction);
    return () => {
      window.removeEventListener(COMPOSER_SUMMARY_ACTION_EVENT, handleSummaryAction);
    };
  }, [displayedPosts, loadComments, setActiveComment]);

  React.useEffect(() => {
    if (!activeComment) return;
    if (posts.some((post) => post.id === activeComment.postId)) return;
    closeComments();
  }, [activeComment, closeComments, posts]);

  const activeCommentPost = React.useMemo(
    () =>
      activeComment
        ? posts.find((post) => post.id === activeComment.postId) ?? null
        : null,
    [activeComment, posts],
  );

  return (
    <>
      {showSkeletons ? (
        <div className={styles.feedSkeleton} aria-live="polite" aria-busy="true">
          {skeletons}
        </div>
      ) : null}
      {!showSkeletons && posts.length === 0 ? (
        <div className={styles.feedEmpty} role="status">
          <p className={styles.feedEmptyTitle}>No posts yet</p>
          <p className={styles.feedEmptySubtitle}>
            {emptyMessage ?? "Be the first to share something in this space."}
          </p>
        </div>
      ) : null}
      {displayedPosts.map((post) => {
        let media = normalizeMediaUrl(post.mediaUrl);
        const resolvedUserId =
          post.owner_user_id ??
          post.ownerUserId ??
          post.author_user_id ??
          post.authorUserId ??
          null;
        const resolvedUserKey =
          post.owner_user_key ??
          post.ownerKey ??
          post.author_user_key ??
          post.authorUserKey ??
          null;
        const friendTargetKey = resolvedUserId ?? resolvedUserKey ?? post.id;
        const menuIdentifier = `${friendTargetKey}::${post.id}`;
        const canTarget = Boolean(resolvedUserId ?? resolvedUserKey);
        const isFriendOptionOpen = activeFriendTarget === menuIdentifier;
        const isFriendActionPending = friendActionPending === menuIdentifier;
        const ownerIdentifierSet = buildIdentifierSet(
          resolvedUserId,
          resolvedUserKey,
          post.owner_user_id,
          post.ownerUserId,
          post.author_user_id,
          post.authorUserId,
          post.owner_user_key,
          post.ownerKey,
          post.author_user_key,
          post.authorUserKey,
        );
        let viewerOwnsPost = false;
        if (ownerIdentifierSet.size && viewerIdentifierSet.size) {
          for (const identifier of viewerIdentifierSet.values()) {
            if (ownerIdentifierSet.has(identifier)) {
              viewerOwnsPost = true;
              break;
            }
          }
        }
        const likeCount = typeof post.likes === "number" ? Math.max(0, post.likes) : 0;
        const baseCommentCount =
          typeof post.comments === "number" ? Math.max(0, post.comments) : 0;
        const shareCount = typeof post.shares === "number" ? Math.max(0, post.shares) : 0;
        const viewerLiked = Boolean(post.viewerLiked ?? post.viewer_liked ?? false);
        const remembered = Boolean(post.viewerRemembered ?? post.viewer_remembered ?? false);
        const isLikePending = Boolean(likePending[post.id]);
        const isMemoryPending = Boolean(memoryPending[post.id]);
        const handleMemoryToggle = () => {
          if (isMemoryPending || !canRemember) return;
          const desired = !remembered;
          try {
            const result = onToggleMemory(post, desired);
            if (result && typeof (result as Promise<unknown>).then === "function") {
              (result as Promise<unknown>).catch((error) => {
                console.error("Memory toggle error", error);
              });
            }
          } catch (error) {
            console.error("Memory toggle error", error);
          }
        };
        const threadForPost = commentThreads[post.id] ?? null;
        const commentCount = threadForPost ? threadForPost.comments.length : baseCommentCount;
        const actionItems: Array<{
          key: ActionKey;
          label: string;
          icon: React.ReactNode;
          count: number;
          active?: boolean;
          pending?: boolean;
          handler?: (event: React.MouseEvent<HTMLButtonElement>) => void;
        }> = [
          {
            key: "like",
            label: viewerLiked ? "Liked" : "Like",
            icon: null,
            count: likeCount,
            active: viewerLiked,
            pending: isLikePending,
            handler: (event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggleLike(post.id);
            },
          },
          {
            key: "comment",
            label: "Comment",
            icon: <ChatCircle weight="duotone" />,
            count: commentCount,
            handler: (event) => {
              event.preventDefault();
              event.stopPropagation();
              handleCommentButtonClick(post, event.currentTarget);
            },
          },
          {
            key: "share",
            label: "Share",
            icon: <ShareNetwork weight="duotone" />,
            count: shareCount,
          },
        ];
        const mediaCollections: PostMediaCollections = buildPostMediaCollections({
          post,
          initialMedia: media ?? null,
          cloudflareEnabled,
          currentOrigin,
        });
        const { galleryItems, fileAttachments } = mediaCollections;
        media = (mediaCollections.media ?? null) as string | null;
        const documentCards = fileAttachments.map((file) =>
          buildDocumentCardData({
            id: file.id,
            url: file.url,
            name: file.name,
            mimeType: file.mimeType,
            meta: file.meta ?? null,
            uploadSessionId: file.uploadSessionId ?? null,
          }),
        );
        const isCardRefreshing = isRefreshing && hasFetched;

        return (
          <article
            key={post.id}
            className={styles.card}
            data-post-id={post.id}
            data-refreshing={isCardRefreshing ? "true" : undefined}
            aria-busy={isCardRefreshing ? true : undefined}
          >
            <header className={styles.cardHead}>
              <div className={styles.userMeta}>
                <span className={styles.avatarWrap} aria-hidden>
                  {post.user_avatar ? (
                    <LazyImage
                      className={styles.avatarImg}
                      src={post.user_avatar}
                      alt=""
                      width={44}
                      height={44}
                      sizes="44px"
                      loading="lazy"
                      unoptimized
                    />
                  ) : (
                    <span className={styles.avatar} />
                  )}
                </span>

                {canTarget ? (
                  <button
                    type="button"
                    className={`${styles.userNameButton} ${styles.userName}`.trim()}
                    onClick={() => onToggleFriendTarget(isFriendOptionOpen ? null : menuIdentifier)}
                    aria-expanded={isFriendOptionOpen}
                  >
                    {post.user_name || "Capsules AI"}
                  </button>
                ) : (
                  <div className={styles.userName}>{post.user_name || "Capsules AI"}</div>
                )}

                <span className={styles.separator} aria-hidden>
                  {"\u2022"}
                </span>

                <time
                  className={styles.timestamp}
                  title={exactTime(post.created_at)}
                  dateTime={post.created_at ?? undefined}
                >
                  {timeAgo(post.created_at)}
                </time>
              </div>

              <div className={styles.cardControls}>
                <button
                  type="button"
                  className={styles.iconBtn}
                  data-variant="memory"
                  data-active={remembered ? "true" : "false"}
                  onClick={handleMemoryToggle}
                  disabled={isMemoryPending || !canRemember}
                  aria-pressed={remembered ? true : undefined}
                  aria-label={
                    isMemoryPending
                      ? "Saving to memory..."
                      : remembered
                        ? "Remembered"
                        : "Save to Memory"
                  }
                  title={
                    canRemember ? (remembered ? "Remembered" : "Save to Memory") : "Sign in to save"
                  }
                >
                  {isMemoryPending ? (
                    <HourglassHigh weight="duotone" />
                  ) : (
                    <Brain weight="duotone" />
                  )}
                </button>

                <PostMenu
                  canTarget={canTarget}
                  pending={isFriendActionPending}
                  open={isFriendOptionOpen}
                  onOpenChange={(next) => onToggleFriendTarget(next ? menuIdentifier : null)}
                  onAddFriend={() => onFriendRequest(post, menuIdentifier)}
                  onRemoveFriend={() => onRemoveFriend(post, menuIdentifier)}
                  renderTrigger={({ ref, toggle, open: menuOpen, pending: menuPending }) => (
                    <button
                      type="button"
                      className={styles.iconBtn}
                      aria-label="Post options"
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      onClick={toggle}
                      disabled={menuPending}
                      ref={ref}
                    >
                      <DotsThreeCircleVertical weight="duotone" />
                    </button>
                  )}
                />

                {viewerOwnsPost ? (
                  <button
                    type="button"
                    className={styles.iconBtn}
                    data-variant="danger"
                    onClick={() => onDelete(post.id)}
                    aria-label="Delete post"
                    title="Delete post"
                  >
                    <Trash weight="duotone" />
                  </button>
                ) : null}
              </div>
            </header>

            <div className={styles.cardBody}>
              {post.content ? <div className={styles.postText}>{post.content}</div> : null}
              {post.poll ? (
                <FeedPoll postId={post.id} poll={post.poll} formatCount={formatCount} />
              ) : null}
            </div>

            {galleryItems.length
              ? (() => {
                  const imageLightboxItems = galleryItems
                    .filter((entry) => entry.kind === "image")
                    .map((entry) => ({
                      id: entry.id,
                      kind: entry.kind,
                      fullUrl: entry.fullUrl,
                      fullSrcSet: entry.fullSrcSet,
                      displayUrl: entry.displayUrl,
                      displaySrcSet: entry.displaySrcSet,
                      thumbnailUrl: entry.thumbnailUrl ?? null,
                      name: entry.name,
                      alt: entry.name ?? "Post attachment",
                      mimeType: entry.mimeType,
                      width: entry.width,
                      height: entry.height,
                      aspectRatio: entry.aspectRatio,
                    }));
                  const lightboxLookup = new Map<string, number>(
                    imageLightboxItems.map((entry, idx) => [entry.id, idx]),
                  );
                  const isSingleImageLayout =
                    galleryItems.length === 1 && galleryItems[0]?.kind === "image";

                  return (
                    <div
                      className={styles.mediaGallery}
                      data-count={galleryItems.length}
                      data-layout={isSingleImageLayout ? "single" : "grid"}
                    >
                      {galleryItems.map((item) => {
                        if (item.kind === "video") {
                          return <FeedVideo key={item.id} item={item as FeedVideoItem} />;
                        }

                        const imageIndex = lightboxLookup.get(item.id) ?? 0;
                        const rawAspectRatio =
                          typeof item.aspectRatio === "number" && Number.isFinite(item.aspectRatio)
                            ? item.aspectRatio
                            : null;
                        const aspectRatio =
                          rawAspectRatio && rawAspectRatio > 0
                            ? Number(rawAspectRatio.toFixed(4))
                            : null;
                        const orientation =
                          aspectRatio && aspectRatio > 0
                            ? aspectRatio > 1.05
                              ? "landscape"
                              : aspectRatio < 0.95
                                ? "portrait"
                                : "square"
                            : null;
                        const singleImageStyles: React.CSSProperties | undefined =
                          isSingleImageLayout
                            ? {
                                aspectRatio: aspectRatio ?? "auto",
                                minHeight:
                                  orientation === "portrait"
                                    ? "clamp(320px, 52vh, 820px)"
                                    : orientation === "landscape"
                                      ? "clamp(220px, 42vh, 620px)"
                                      : "clamp(260px, 48vh, 720px)",
                                maxHeight:
                                  orientation === "portrait"
                                    ? "min(92vh, 1040px)"
                                    : orientation === "landscape"
                                      ? "min(78vh, 880px)"
                                      : "min(86vh, 960px)",
                              }
                            : undefined;
                        const singleImageMediaStyles: React.CSSProperties | undefined =
                          isSingleImageLayout
                            ? {
                                objectFit: "contain",
                                objectPosition: "center",
                                width: "100%",
                                height: "100%",
                              }
                            : undefined;
                        const hasDimensions =
                          typeof item.width === "number" &&
                          Number.isFinite(item.width) &&
                          typeof item.height === "number" &&
                          Number.isFinite(item.height) &&
                          item.width > 0 &&
                          item.height > 0;
                        const imageWidth = hasDimensions
                          ? Math.max(1, Math.round(item.width as number))
                          : 1080;
                        const imageHeight = hasDimensions
                          ? Math.max(1, Math.round(item.height as number))
                          : 1080;
                        const imageSizes = isSingleImageLayout
                          ? "(max-width: 640px) 100vw, 960px"
                          : "(max-width: 640px) 100vw, 720px";

                        return (
                          <button
                            key={item.id}
                            type="button"
                            className={styles.mediaButton}
                            data-kind="image"
                            data-orientation={orientation ?? undefined}
                            style={singleImageStyles}
                            onClick={() => {
                              if (!imageLightboxItems.length) return;
                              setLightbox({
                                postId: post.id,
                                index: imageIndex,
                                items: imageLightboxItems,
                              });
                            }}
                            aria-label={item.name ? `View ${item.name}` : "View attachment"}
                          >
                            <LazyImage
                              className={styles.media}
                              data-kind="image"
                              src={item.displayUrl}
                              alt={item.name ?? "Post attachment"}
                              width={imageWidth}
                              height={imageHeight}
                              sizes={imageSizes}
                              loading="lazy"
                              unoptimized
                              style={singleImageMediaStyles}
                            />
                          </button>
                        );
                      })}
                    </div>
                  );
                })()
              : null}

            {documentCards.length ? (
              <div className={styles.documentGrid}>
                {documentCards.map((doc) => (
                  <DocumentAttachmentCard
                    key={doc.id}
                    doc={doc}
                    formatCount={formatCount}
                    onAsk={() => handleAskDocument(doc)}
                    onSummarize={() => handleSummarizeDocument(doc)}
                    summarizePending={Boolean(documentSummaryPending[doc.id])}
                  />
                ))}
              </div>
            ) : null}

            <footer className={styles.actionBar}>
              {actionItems.map((action) => {
                const isLike = action.key === "like";
                const handleClick = action.handler ?? undefined;
                return (
                  <button
                    key={action.key}
                    className={styles.actionBtn}
                    type="button"
                    data-action-key={action.key}
                    data-variant={action.key}
                    data-active={action.active ? "true" : "false"}
                    aria-label={`${action.label} (${formatCount(action.count)} so far)`}
                    onClick={handleClick}
                    disabled={isLike ? action.pending : false}
                    aria-pressed={isLike ? action.active : undefined}
                    aria-busy={isLike && action.pending ? true : undefined}
                  >
                    <span className={styles.actionMeta}>
                      <span className={styles.actionIcon} aria-hidden>
                        {action.key === "like" ? (
                          <Heart weight={action.active ? "fill" : "duotone"} />
                        ) : (
                          action.icon
                        )}
                      </span>
                      <span className={styles.actionLabel}>{action.label}</span>
                    </span>
                    <span className={styles.actionCount}>{formatCount(action.count)}</span>
                  </button>
                );
              })}
            </footer>
          </article>
        );
      })}

      {shouldShowSentinel ? (
        <div ref={sentinelRef} className={styles.feedSentinel} aria-hidden />
      ) : null}

      {lightbox
        ? (() => {
            const current = lightbox.items[lightbox.index] ?? null;
            if (!current) return null;
            const hasMultiple = lightbox.items.length > 1;
            const hasDimensions =
              typeof current.width === "number" &&
              Number.isFinite(current.width) &&
              current.width > 0 &&
              typeof current.height === "number" &&
              Number.isFinite(current.height) &&
              current.height > 0;
            const widthValue = hasDimensions ? (current.width as number) : null;
            const heightValue = hasDimensions ? (current.height as number) : null;
            const rawLightboxAspect =
              typeof current.aspectRatio === "number" && Number.isFinite(current.aspectRatio)
                ? current.aspectRatio
                : widthValue && heightValue
                  ? widthValue / heightValue
                  : null;
            const lightboxAspectRatio =
              rawLightboxAspect && rawLightboxAspect > 0
                ? Number(rawLightboxAspect.toFixed(4))
                : null;
            const lightboxOrientation =
              lightboxAspectRatio && lightboxAspectRatio > 0
                ? lightboxAspectRatio > 1.05
                  ? "landscape"
                  : lightboxAspectRatio < 0.95
                    ? "portrait"
                    : "square"
                : null;
            return (
              <div
                className={styles.lightboxOverlay}
                role="dialog"
                aria-modal="true"
                aria-label={current.name ?? "Post attachment"}
                onClick={closeLightbox}
              >
                <div
                  className={styles.lightboxContent}
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    className={styles.lightboxClose}
                    onClick={handleCloseButtonClick}
                    aria-label="Close attachment viewer"
                  >
                    <X weight="bold" size={22} />
                  </button>
                  <div
                    className={styles.lightboxBody}
                    data-has-nav={hasMultiple ? "true" : undefined}
                  >
                    {hasMultiple ? (
                      <>
                        <button
                          type="button"
                          className={styles.lightboxNav}
                          data-direction="prev"
                          onClick={() => navigateLightbox(-1)}
                          aria-label="Previous attachment"
                        >
                          <CaretLeft weight="bold" size={26} />
                        </button>
                        <button
                          type="button"
                          className={styles.lightboxNav}
                          data-direction="next"
                          onClick={() => navigateLightbox(1)}
                          aria-label="Next attachment"
                        >
                          <CaretRight weight="bold" size={26} />
                        </button>
                      </>
                    ) : null}
                    <div
                      className={styles.lightboxMedia}
                      data-orientation={lightboxOrientation ?? undefined}
                    >
                      {current.kind === "video" ? (
                        <video
                          className={styles.lightboxVideo}
                          controls
                          playsInline
                          preload="auto"
                        >
                          <source src={current.fullUrl} type={current.mimeType ?? undefined} />
                          Your browser does not support embedded video.
                        </video>
                      ) : (() => {
                        const renderable = canRenderInlineImage(current.mimeType, current.fullUrl);
                        const fallbackSrc = [current.thumbnailUrl, current.displayUrl]
                          .find((src) => src && src !== current.fullUrl)
                          ?? null;
                        const imageSrc = renderable ? current.fullUrl : fallbackSrc;
                        const imageSrcSet = renderable
                          ? current.fullSrcSet ?? current.displaySrcSet ?? undefined
                          : current.displaySrcSet ?? current.fullSrcSet ?? undefined;

                        if (!imageSrc) {
                          return (
                            <div className={styles.lightboxFallback} role="status">
                              Preview unavailable for this file type.
                            </div>
                          );
                        }

                        return (
                          // eslint-disable-next-line @next/next/no-img-element -- maintain lightbox srcset + eager load without reliable dimensions for next/image
                          <img
                            className={styles.lightboxImage}
                            src={imageSrc}
                            srcSet={imageSrcSet}
                            sizes="(min-width: 768px) 70vw, 90vw"
                            alt={current.alt}
                            loading="eager"
                            draggable={false}
                          />
                        );
                      })()}
                    </div>
                  </div>
                  {current.name ? (
                    <div className={styles.lightboxCaption}>{current.name}</div>
                  ) : null}
                </div>
              </div>
            );
          })()
        : null}
      {activeCommentPost ? (
        <CommentPanel
          post={activeCommentPost}
          anchorEl={commentAnchorRef.current}
          visible={Boolean(activeComment)}
          thread={commentThreads[activeCommentPost.id] ?? EMPTY_THREAD_STATE}
          submitting={Boolean(commentSubmitting[activeCommentPost.id])}
          onClose={closeComments}
          onLoad={loadComments}
          onReload={loadComments}
          onSubmit={submitComment}
          timeAgo={timeAgo}
          exactTime={exactTime}
        />
      ) : null}
    </>
  );
}

type FeedPollProps = {
  postId: string;
  poll: NonNullable<HomeFeedPost["poll"]>;
  formatCount: (value?: number | null) => string;
};

function FeedPoll({ postId, poll, formatCount }: FeedPollProps) {
  const options = React.useMemo(
    () => poll.options.map((option) => option.trim()).filter((option) => option.length > 0),
    [poll.options],
  );

  const [counts, setCounts] = React.useState<number[] | null>(() =>
    sanitizeCounts(poll.counts ?? null, options.length),
  );
  const [selection, setSelection] = React.useState<number | null>(() => {
    const vote =
      typeof poll.userVote === "number" && Number.isFinite(poll.userVote)
        ? Math.max(0, Math.trunc(poll.userVote))
        : null;
    return vote !== null && vote < options.length ? vote : null;
  });
  const [pendingIndex, setPendingIndex] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setCounts(sanitizeCounts(poll.counts ?? null, options.length));
  }, [poll.counts, options.length]);

  React.useEffect(() => {
    const vote =
      typeof poll.userVote === "number" && Number.isFinite(poll.userVote)
        ? Math.max(0, Math.trunc(poll.userVote))
        : null;
    setSelection(vote !== null && vote < options.length ? vote : null);
  }, [poll.userVote, options.length]);

  const normalizedCounts = React.useMemo(
    () =>
      counts
        ? Array.from({ length: options.length }, (_, index) => counts[index] ?? 0)
        : Array(options.length).fill(0),
    [counts, options.length],
  );

  const totalVotes = React.useMemo(
    () => normalizedCounts.reduce((sum, value) => sum + value, 0),
    [normalizedCounts],
  );

  const pending = pendingIndex !== null;
  const question =
    poll.question && poll.question.trim().length ? poll.question.trim() : "Community poll";
  const showStats = totalVotes > 0 || selection !== null;
  const footerLabel =
    totalVotes > 0
      ? `${formatCount(totalVotes)} vote${totalVotes === 1 ? "" : "s"}`
      : "Be the first to vote";

  const handleVote = React.useCallback(
    async (optionIndex: number) => {
      if (pending) return;
      setPendingIndex(optionIndex);
      setError(null);

      try {
        const response = await fetch("/api/polls/vote", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            postId,
            optionIndex,
          }),
        });

        let payload: Record<string, unknown> | null = null;
        try {
          payload = (await response.json()) as Record<string, unknown>;
        } catch {
          payload = null;
        }

        if (!response.ok) {
          const rawError =
            (payload && typeof payload.error === "string" && payload.error) || undefined;
          const message =
            response.status === 401
              ? "Sign in to vote in polls."
              : rawError ?? "Unable to submit your vote. Please try again.";
          setError(message);
          return;
        }

        const nextCounts = sanitizeCounts(payload?.counts ?? null, options.length);
        if (nextCounts) {
          setCounts(nextCounts);
        } else {
          setCounts((previous) => {
            const base = Array.from({ length: options.length }, (_, idx) => previous?.[idx] ?? 0);
            base[optionIndex] = (base[optionIndex] ?? 0) + 1;
            return base;
          });
        }
        setSelection(optionIndex);
        setError(null);
      } catch (voteError) {
        console.error("Poll vote failed", voteError);
        setError("Unable to submit your vote. Please try again.");
      } finally {
        setPendingIndex(null);
      }
    },
    [pending, postId, options.length],
  );

  if (!options.length) {
    return null;
  }

  return (
    <div className={styles.pollCard}>
      <h3 className={styles.pollQuestion}>{question}</h3>
      <div className={styles.pollOptions}>
        {options.map((option, index) => {
          const count = normalizedCounts[index] ?? 0;
          const isSelected = selection === index;
          const isPending = pending && pendingIndex === index;
          const baseProgress =
            showStats && totalVotes > 0 ? count / totalVotes : isSelected ? 0.6 : 0;
          const progress = Math.max(0, Math.min(1, baseProgress));
          const percent =
            showStats && totalVotes > 0 ? Math.round(progress * 100) : isSelected ? 100 : null;

          return (
            <div
              key={`${postId}-poll-option-${index}`}
              className={styles.pollOption}
              data-selected={isSelected ? "true" : undefined}
            >
              <div
                className={styles.pollOptionBar}
                style={{ transform: `scaleX(${progress})` }}
                aria-hidden="true"
              />
              <button
                type="button"
                className={styles.pollOptionButton}
                onClick={() => handleVote(index)}
                disabled={pending}
                data-pending={isPending ? "true" : undefined}
                aria-pressed={isSelected}
                aria-busy={isPending ? true : undefined}
              >
                <span className={styles.pollOptionLabel}>{option}</span>
                <span className={styles.pollOptionMeta}>
                  {showStats && percent !== null ? (
                    <>
                      <span className={styles.pollOptionPercent}>{percent}%</span>
                      <span className={styles.pollOptionCount}>{formatCount(count)}</span>
                    </>
                  ) : (
                    <span className={styles.pollOptionHint}>{isSelected ? "Selected" : "Vote"}</span>
                  )}
                </span>
              </button>
            </div>
          );
        })}
      </div>
      {error ? (
        <div className={styles.pollError} role="status">
          {error}
        </div>
      ) : null}
      <div className={styles.pollFooter}>{footerLabel}</div>
    </div>
  );
}

type FeedVideoItem = FeedGalleryItem & { kind: "video" };

const HLS_MIME_HINTS = [
  "application/vnd.apple.mpegurl",
  "application/x-mpegurl",
  "application/mpegurl",
];

function isHlsMimeType(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  const lowered = value.toLowerCase();
  return HLS_MIME_HINTS.some((pattern) => lowered.includes(pattern));
}

function isHlsUrl(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  const lowered = trimmed.toLowerCase();
  if (lowered.includes(".m3u8")) return true;
  const withoutHash = lowered.split("#")[0] ?? lowered;
  const withoutQuery = withoutHash.split("?")[0] ?? withoutHash;
  if (withoutQuery.endsWith(".m3u8")) return true;
  try {
    const url = new URL(trimmed, typeof window === "undefined" ? "http://localhost" : window.location.href);
    if (url.pathname.toLowerCase().includes(".m3u8")) return true;
    const formatParam = url.searchParams.get("format");
    if (formatParam && formatParam.toLowerCase() === "m3u8") return true;
  } catch {
    /* Relative URLs without protocol may fail URL parsing; ignore. */
  }
  return false;
}

function looksLikeHlsSource(
  mimeType: string | null | undefined,
  url: string | null | undefined,
): boolean {
  return isHlsMimeType(mimeType) || isHlsUrl(url);
}

function FeedVideo({ item }: { item: FeedVideoItem }) {
  const videoItem = item;
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const hlsRef = React.useRef<Hls | null>(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const userInteractedRef = React.useRef(false);
  const videoId = videoItem.id;

  const poster =
    videoItem.thumbnailUrl && videoItem.thumbnailUrl !== videoItem.fullUrl
      ? videoItem.thumbnailUrl
      : null;
  const videoUrl = videoItem.fullUrl;
  const isHlsSource = React.useMemo(
    () => looksLikeHlsSource(videoItem.mimeType, videoUrl),
    [videoItem.mimeType, videoUrl],
  );
  const { aspectRatio, orientation } = React.useMemo(() => {
    const isValidDimension = (value: number | null | undefined): value is number =>
      typeof value === "number" && Number.isFinite(value) && value > 0;
    const width = isValidDimension(videoItem.width) ? videoItem.width : null;
    const height = isValidDimension(videoItem.height) ? videoItem.height : null;
    const rawRatio = isValidDimension(videoItem.aspectRatio)
      ? videoItem.aspectRatio
      : width && height
        ? width / height
        : null;
    const normalizedRatio = rawRatio && rawRatio > 0 ? rawRatio : null;
    const orientation =
      normalizedRatio && normalizedRatio > 0
        ? normalizedRatio > 1.05
          ? "landscape"
          : normalizedRatio < 0.95
            ? "portrait"
            : "square"
        : null;
    return { aspectRatio: normalizedRatio, orientation };
  }, [videoItem.aspectRatio, videoItem.height, videoItem.width]);
  const containerStyle = React.useMemo<React.CSSProperties | undefined>(() => {
    if (!aspectRatio) return undefined;
    if (orientation === "portrait") {
      return {
        aspectRatio,
        minHeight: "clamp(320px, 52vh, 820px)",
        maxHeight: "min(92vh, 1040px)",
      };
    }
    if (orientation === "landscape") {
      return {
        aspectRatio,
        minHeight: "clamp(220px, 42vh, 620px)",
        maxHeight: "min(78vh, 880px)",
      };
    }
    return {
      aspectRatio,
      minHeight: "clamp(260px, 48vh, 720px)",
      maxHeight: "min(86vh, 960px)",
    };
  }, [aspectRatio, orientation]);
  const videoStyle = React.useMemo<React.CSSProperties>(
    () => ({
      objectFit: "contain",
      objectPosition: "center",
    }),
    [],
  );

  React.useEffect(() => {
    const node = videoRef.current;
    if (!node) return undefined;

    const teardown = () => {
      const existing = hlsRef.current;
      if (existing) {
        existing.destroy();
        hlsRef.current = null;
      }
    };

    if (!isHlsSource || !videoUrl) {
      teardown();
      return undefined;
    }

    const nativeSupport =
      node.canPlayType("application/vnd.apple.mpegurl") ||
      node.canPlayType("application/x-mpegurl");
    if (nativeSupport === "probably" || nativeSupport === "maybe") {
      teardown();
      node.src = videoUrl;
      node.load();
      return () => {
        if (node.src === videoUrl) {
          node.removeAttribute("src");
          node.load();
        }
      };
    }

    teardown();
    let cancelled = false;

    (async () => {
      try {
        const mod = await import("hls.js");
        if (cancelled) return;
        const HlsConstructor = mod.default;
        if (!HlsConstructor || !HlsConstructor.isSupported()) {
          node.src = videoUrl;
          node.load();
          return;
        }
        const instance = new HlsConstructor({
          enableWorker: true,
          backBufferLength: 90,
        });
        hlsRef.current = instance;
        instance.attachMedia(node);
        instance.on(HlsConstructor.Events.MEDIA_ATTACHED, () => {
          if (!cancelled) {
            instance.loadSource(videoUrl);
          }
        });
        instance.on(HlsConstructor.Events.ERROR, (_event, data) => {
          if (!data || !data.fatal) return;
          if (data.type === HlsConstructor.ErrorTypes.NETWORK_ERROR) {
            instance.startLoad();
          } else if (data.type === HlsConstructor.ErrorTypes.MEDIA_ERROR) {
            instance.recoverMediaError();
          } else {
            instance.destroy();
            if (hlsRef.current === instance) {
              hlsRef.current = null;
            }
          }
        });
      } catch {
        if (!cancelled) {
          node.src = videoUrl;
          node.load();
        }
      }
    })();

    return () => {
      cancelled = true;
      teardown();
    };
  }, [isHlsSource, videoUrl]);

  const playVideo = React.useCallback(() => {
    const node = videoRef.current;
    if (!node) return;
    node.muted = true;
    const playAttempt = node.play();
    if (playAttempt && typeof playAttempt.catch === "function") {
      playAttempt.catch(() => {
        /* autoplay may be prevented on some browsers; ignore */
      });
    }
  }, []);

  const pauseVideo = React.useCallback((reset = false, force = false) => {
    const node = videoRef.current;
    if (!node) return;
    if (!force && userInteractedRef.current) return;
    node.pause();
    if (reset) {
      try {
        node.currentTime = 0;
      } catch {
        /* Safari may throw if the stream is not seekable yet */
      }
    }
    if (force) {
      userInteractedRef.current = false;
    }
    setIsPlaying(false);
  }, []);

  const handlePointerDown = React.useCallback(() => {
    userInteractedRef.current = true;
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleRemotePlay = (event: Event) => {
      const custom = event as CustomEvent<{ id?: string }>;
      const requester = custom.detail?.id ?? null;
      if (!requester || requester === videoId) return;
      pauseVideo(true, true);
    };
    window.addEventListener("feedvideo:play", handleRemotePlay as EventListener);
    return () => {
      window.removeEventListener("feedvideo:play", handleRemotePlay as EventListener);
    };
  }, [pauseVideo, videoId]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry) return;
        if (!entry.isIntersecting) {
          pauseVideo(true, true);
          return;
        }
        if (entry.intersectionRatio >= 0.6) {
          playVideo();
        } else {
          pauseVideo(false);
        }
      },
      {
        threshold: [0, 0.3, 0.45, 0.6, 0.8],
      },
    );

    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, [pauseVideo, playVideo]);

  const handlePlay = React.useCallback(() => {
    setIsPlaying(true);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("feedvideo:play", { detail: { id: videoId } }));
    }
  }, [videoId]);

  const handlePause = React.useCallback(() => {
    setIsPlaying(false);
    userInteractedRef.current = false;
  }, []);

  return (
    <div
      ref={containerRef}
      className={styles.mediaWrapper}
      data-kind="video"
      data-orientation={orientation ?? undefined}
      data-playing={isPlaying ? "true" : undefined}
      onMouseEnter={playVideo}
      onFocus={playVideo}
      style={containerStyle}
    >
      <video
        ref={videoRef}
        className={styles.media}
        data-kind="video"
        data-hls={isHlsSource ? "true" : undefined}
        src={!isHlsSource ? videoUrl : undefined}
        controls
        playsInline
        preload="metadata"
        loop
        muted
        poster={poster ?? undefined}
        onPlay={handlePlay}
        onPause={handlePause}
        onEnded={() => pauseVideo(true, true)}
        onPointerDown={handlePointerDown}
        style={videoStyle}
      >
        {!isHlsSource ? (
          <source src={videoUrl} type={videoItem.mimeType ?? undefined} />
        ) : null}
        Your browser does not support the video tag.
      </video>
      <div
        className={styles.mediaVideoOverlay}
        data-hidden={isPlaying ? "true" : undefined}
        aria-hidden="true"
      >
        <Play className={styles.mediaVideoIcon} weight="fill" />
      </div>
    </div>
  );
}

