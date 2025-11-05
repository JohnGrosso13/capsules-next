"use client";

import * as React from "react";

import type { HomeFeedPost } from "@/hooks/useHomeFeed";

type HighlightOptions = {
  focusComment?: boolean;
};

type UseFeedCommentUIOptions = {
  displayedPosts: HomeFeedPost[];
  loadComments(postId: string): Promise<void>;
};

type UseFeedCommentUIResult = {
  activeComment: { postId: string } | null;
  commentAnchorRef: React.MutableRefObject<HTMLElement | null>;
  handleCommentButtonClick(post: HomeFeedPost, target: HTMLElement): void;
  closeComments(): void;
  highlightPost(postId: string, options?: HighlightOptions): void;
};

export function useFeedCommentUI({
  displayedPosts,
  loadComments,
}: UseFeedCommentUIOptions): UseFeedCommentUIResult {
  const [activeComment, setActiveComment] = React.useState<{ postId: string } | null>(null);
  const commentAnchorRef = React.useRef<HTMLElement | null>(null);

  const handleCommentButtonClick = React.useCallback(
    (post: HomeFeedPost, target: HTMLElement) => {
      setActiveComment((previous) => {
        const toggled = previous?.postId === post.id ? null : { postId: post.id };
        commentAnchorRef.current = toggled ? target : null;
        if (toggled) {
          void loadComments(post.id);
        }
        return toggled;
      });
    },
    [loadComments],
  );

  const closeComments = React.useCallback(() => {
    setActiveComment(null);
    commentAnchorRef.current = null;
  }, []);

  const highlightPost = React.useCallback(
    (postId: string, options?: HighlightOptions) => {
      const hasPost = displayedPosts.some((entry) => entry.id === postId);
      if (!hasPost) return;

      if (typeof window !== "undefined") {
        const escapedId =
          typeof CSS !== "undefined" && typeof CSS.escape === "function"
            ? CSS.escape(postId)
            : postId.replace(/["'\\]/g, "\\$&");
        const card = document.querySelector<HTMLElement>(`[data-post-id="${escapedId}"]`);
        if (card) {
          card.scrollIntoView({ behavior: "smooth", block: "center" });
          card.setAttribute("data-summary-flash", "true");
          window.setTimeout(() => {
            card.removeAttribute("data-summary-flash");
          }, 2400);
        }

        if (options?.focusComment) {
          const anchor =
            (card?.querySelector<HTMLElement>('[data-action-key="comment"]') ?? card) ?? null;
          commentAnchorRef.current = anchor;
          setActiveComment({ postId });
          void loadComments(postId);
        }
      } else if (options?.focusComment) {
        setActiveComment({ postId });
        void loadComments(postId);
      }
    },
    [displayedPosts, loadComments],
  );

  React.useEffect(() => {
    if (!activeComment) return;
    if (displayedPosts.some((post) => post.id === activeComment.postId)) return;
    closeComments();
  }, [activeComment, closeComments, displayedPosts]);

  return {
    activeComment,
    commentAnchorRef,
    handleCommentButtonClick,
    closeComments,
    highlightPost,
  };
}
