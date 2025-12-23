"use client";

import * as React from "react";

import { useComposer } from "@/components/composer/ComposerProvider";
import type { PrompterAttachment } from "@/components/ai-prompter-stage";
import type { DocumentCardData } from "@/components/documents/document-card";
import {
  describeAttachmentSet,
  extractAttachmentMeta,
  formatHintList,
  normalizeAttachmentName,
} from "@/components/home-feed/utils";
import type { HomeFeedPost } from "@/hooks/useHomeFeed";
import { normalizeSummaryResponse, requestSummary } from "@/lib/ai/client-summary";
import { buildSummarySignature } from "@/lib/ai/summary-signature";
import {
  COMPOSER_SUMMARY_ACTION_EVENT,
  SUMMARIZE_FEED_REQUEST_EVENT,
  SUMMARIZE_FEED_STATUS_EVENT,
  type ComposerSummaryActionDetail,
  type SummarizeFeedRequestDetail,
  type SummarizeFeedRequestOrigin,
} from "@/lib/events";
import type {
  SummaryConversationContext,
  SummaryConversationEntry,
  SummaryPresentationOptions,
} from "@/lib/composer/summary-context";
import { resolveToAbsoluteUrl } from "@/lib/url";
import type { SummaryAttachmentInput, SummaryResult } from "@/types/summary";

function describePoll(question: unknown): string | null {
  if (typeof question !== "string") return null;
  const trimmed = question.trim();
  if (!trimmed.length) return null;
  return `Running a poll: "${trimmed}".`;
}

type UseFeedSummaryOptions = {
  displayedPosts: HomeFeedPost[];
  timeAgo: (iso?: string | null) => string;
  onHighlightPost?: (postId: string, options?: { focusComment?: boolean }) => void;
  onSummaryReady?: (payload: {
    result: SummaryResult;
    entries: SummaryConversationEntry[];
    options: SummaryPresentationOptions;
    attachments: PrompterAttachment[];
  }) => void;
};

type UseFeedSummaryResult = {
  documentSummaryPending: Record<string, boolean>;
  feedSummaryPending: boolean;
  summarizeDocument: (doc: DocumentCardData) => Promise<void>;
  summarizeFeed: () => Promise<void>;
};

type CachedFeedSummary = {
  signature: string;
  summary: SummaryResult;
};

export function useFeedSummary({
  displayedPosts,
  timeAgo,
  onHighlightPost,
  onSummaryReady,
}: UseFeedSummaryOptions): UseFeedSummaryResult {
  const composer = useComposer();
  const [documentSummaryPending, setDocumentSummaryPending] = React.useState<Record<string, boolean>>(
    {},
  );
  const [feedSummaryPending, setFeedSummaryPending] = React.useState(false);
  const summaryOriginRef = React.useRef<SummarizeFeedRequestOrigin>("external");
  const lastSummaryRef = React.useRef<CachedFeedSummary | null>(null);

  const summarizeDocument = React.useCallback(
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

  const summarizeFeed = React.useCallback(async () => {
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

      const presentSummary = (result: SummaryResult) => {
        const summaryOptions: SummaryPresentationOptions = {
          title: "Feed recap",
          sourceLabel: "Current feed",
          sourceType: result.source,
        };

        if (onSummaryReady) {
          onSummaryReady({
            result,
            entries: summaryEntries,
            options: summaryOptions,
            attachments: conversationAttachments,
          });
        } else {
          const summaryContext: SummaryConversationContext = {
            source: result.source,
            title: "Feed recap",
            entries: summaryEntries,
          };

          composer.showSummary(result, summaryOptions, {
            context: summaryContext,
            attachments: conversationAttachments,
          });
        }

        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent(SUMMARIZE_FEED_STATUS_EVENT, {
              detail: { status: "success", origin: summaryOriginRef.current },
            }),
          );
        }
      };

      const segments = segmentSource.map((post, index) => {
        const author = post.user_name ?? (post as { userName?: string }).userName ?? "Someone";
        const created =
          post.created_at ??
          (post as { createdAt?: string | null | undefined }).createdAt ??
          null;
        const relative = created ? timeAgo(created) : "";
        const contentRaw =
          (post.content as string | null | undefined) ??
          (post as { body?: string | null }).body ??
          (post as { caption?: string | null }).caption ??
          null;
        const content = typeof contentRaw === "string" ? contentRaw.trim() : "";
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

          const payloadAttachment: SummaryAttachmentInput = {
            id: attachmentId,
            url: absoluteUrl,
          };

          if (typeof attachment.name === "string" && attachment.name.trim().length) {
            payloadAttachment.name = attachment.name.trim();
          }

          const description =
            typeof attachmentDescription === "string" && attachmentDescription.trim().length
              ? attachmentDescription.trim()
              : undefined;
          if (description) {
            payloadAttachment.excerpt = description;
            payloadAttachment.text = description;
          }

          if (typeof attachment.mimeType === "string" && attachment.mimeType.trim().length) {
            payloadAttachment.mimeType = attachment.mimeType.trim();
          }

          if (absoluteThumb && absoluteThumb.trim().length) {
            payloadAttachment.thumbnailUrl = absoluteThumb;
          }

          attachmentPayload.push(payloadAttachment);
        }

        if (
          attachmentPayload.length < 6 &&
          typeof post.mediaUrl === "string" &&
          post.mediaUrl.trim().length
        ) {
          const primaryUrl = resolveToAbsoluteUrl(post.mediaUrl) ?? post.mediaUrl;
          if (primaryUrl.length && !seenAttachmentUrls.has(primaryUrl)) {
            seenAttachmentUrls.add(primaryUrl);
            attachmentPayload.push({
              id: `${post.id}-primary`,
              url: primaryUrl,
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

        const entryHighlights = [...themedHints, ...(pollSummary ? [pollSummary] : [])];

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

      const feedMeta = {
        title: "Recent activity",
        timeframe: "latest updates",
      };

      const signature = buildSummarySignature({
        target: "feed",
        segments,
        attachments: attachmentPayload,
        meta: feedMeta,
      });

      const cachedSummary = lastSummaryRef.current;
      if (cachedSummary && cachedSummary.signature === signature) {
        presentSummary(cachedSummary.summary);
        return;
      }

      const summaryPayload = await requestSummary({
        target: "feed",
        segments,
        attachments: attachmentPayload,
        meta: feedMeta,
      });

      const summaryResult = normalizeSummaryResponse(summaryPayload);
      presentSummary(summaryResult);
      lastSummaryRef.current = { signature, summary: summaryResult };
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
  }, [composer, displayedPosts, feedSummaryPending, onSummaryReady, timeAgo]);

  React.useEffect(() => {
    if (typeof window === "undefined" || !onHighlightPost) return undefined;

    const handleSummaryAction = (event: Event) => {
      const detail = (event as CustomEvent<ComposerSummaryActionDetail> | null)?.detail;
      if (!detail?.postId) return;
      onHighlightPost(detail.postId, { focusComment: detail.action === "comment" });
    };

    window.addEventListener(COMPOSER_SUMMARY_ACTION_EVENT, handleSummaryAction);
    return () => {
      window.removeEventListener(COMPOSER_SUMMARY_ACTION_EVENT, handleSummaryAction);
    };
  }, [onHighlightPost]);

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
      void summarizeFeed();
    };

    window.addEventListener(SUMMARIZE_FEED_REQUEST_EVENT, handleRequest);
    return () => {
      window.removeEventListener(SUMMARIZE_FEED_REQUEST_EVENT, handleRequest);
    };
  }, [displayedPosts.length, feedSummaryPending, summarizeFeed]);

  return {
    documentSummaryPending,
    feedSummaryPending,
    summarizeDocument,
    summarizeFeed,
  };
}
