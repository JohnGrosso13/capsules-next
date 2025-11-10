"use client";

import * as React from "react";

import type { CommentThreadState } from "@/components/comments/types";
import styles from "@/components/home-feed.module.css";

type CommentsPreviewProps = {
  postId: string;
  thread: CommentThreadState | null;
  loadComments(postId: string): Promise<void>;
  timeAgo(iso?: string | null): string;
  exactTime(iso?: string | null): string;
  maxItems?: number;
  onOpenFull?: () => void;
};

export function CommentsPreview({
  postId,
  thread,
  loadComments,
  timeAgo,
  exactTime,
  maxItems = 3,
  onOpenFull,
}: CommentsPreviewProps) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  // Kick off a light fetch when the preview scrolls into view
  React.useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    let didRequest = false;
    const shouldLoad = () => !didRequest && (!thread || thread.status === "idle");
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry?.isIntersecting) return;
      if (shouldLoad()) {
        didRequest = true;
        void loadComments(postId).catch(() => {
          // soft-fail; inline preview remains hidden on error
        });
      }
    }, { rootMargin: "600px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadComments, postId, thread]);

  const comments = React.useMemo(() => {
    if (!thread || !Array.isArray(thread.comments)) return [];
    return thread.comments.slice(0, Math.max(1, Math.min(maxItems, 3)));
  }, [thread, maxItems]);

  if (!comments.length && (!thread || thread.status !== "loading")) {
    return <div ref={rootRef} />; // invisible sentinel for lazy loading
  }

  return (
    <div ref={rootRef} className={styles.commentPreview}>
      {comments.map((c) => {
        const initials = (() => {
          const name = (c.userName ?? "").trim();
          if (!name) return "";
          const parts = name.split(/\s+/);
          return (parts[0]?.[0] ?? "").toUpperCase() + (parts[parts.length - 1]?.[0] ?? "").toUpperCase();
        })();
        return (
          <div key={c.id} className={styles.commentPreviewItem}>
            <div className={styles.commentPreviewAvatar} aria-hidden>
              {c.userAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.userAvatar} alt="" />
              ) : (
                initials
              )}
            </div>
            <div className={styles.commentPreviewBubble}>
              <div className={styles.commentPreviewHeader}>
                <span className={styles.commentPreviewName}>{c.userName ?? "Member"}</span>
                <time
                  className={styles.commentPreviewTime}
                  dateTime={c.ts}
                  title={exactTime(c.ts)}
                >
                  {timeAgo(c.ts)}
                </time>
              </div>
              {c.content ? <div className={styles.commentPreviewBody}>{c.content}</div> : null}
            </div>
          </div>
        );
      })}
      {onOpenFull ? (
        <button type="button" className={styles.commentPreviewMoreBtn} onClick={onOpenFull}>
          View all comments
        </button>
      ) : null}
    </div>
  );
}

export default CommentsPreview;

