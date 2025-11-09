"use client";

import * as React from "react";

import styles from "../../../ai-composer.module.css";
import { safeRandomUUID } from "@/lib/random";
import type { AuthClientUser } from "@/ports/auth-client";
import { submitComment } from "@/services/comments";

type SummaryPreviewCommentFormProps = {
  postId: string;
  viewerEnvelope: Record<string, unknown> | null;
  currentUser: AuthClientUser | null;
};

export default function SummaryPreviewCommentForm({
  postId,
  viewerEnvelope,
  currentUser,
}: SummaryPreviewCommentFormProps) {
  const [value, setValue] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const canComment = Boolean(currentUser);

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canComment) return;
      const trimmed = value.trim();
      if (!trimmed) return;
      setSubmitting(true);
      setError(null);
      setSuccess(null);
      const clientId = safeRandomUUID();
      const timestamp = new Date().toISOString();
      try {
        await submitComment(
          {
            id: clientId,
            postId,
            content: trimmed,
            attachments: [],
            capsuleId: null,
            capsule_id: null,
            ts: timestamp,
            userName: currentUser?.name ?? currentUser?.email ?? "You",
            userAvatar: currentUser?.avatarUrl ?? null,
            source: "composer-summary-preview",
          },
          viewerEnvelope,
        );
        setValue("");
        setSuccess("Comment posted");
        if (typeof window !== "undefined") {
          window.setTimeout(() => setSuccess(null), 3200);
        }
      } catch (error) {
        setError(error instanceof Error ? error.message : "Failed to submit comment.");
      } finally {
        setSubmitting(false);
      }
    },
    [canComment, currentUser?.avatarUrl, currentUser?.email, currentUser?.name, postId, value, viewerEnvelope],
  );

  return (
    <form className={styles.summaryCommentForm} onSubmit={handleSubmit}>
      <textarea
        className={styles.summaryCommentInput}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={canComment ? "Leave a quick comment..." : "Sign in to comment"}
        disabled={!canComment || submitting}
      />
      <div className={styles.summaryCommentActions}>
        {error ? (
          <span className={styles.summaryCommentError}>{error}</span>
        ) : success ? (
          <span className={styles.summaryCommentSuccess}>{success}</span>
        ) : (
          <span />
        )}
        <button
          type="submit"
          className={styles.summaryCommentSubmit}
          disabled={!canComment || submitting || !value.trim()}
        >
          {submitting ? "Posting..." : "Comment"}
        </button>
      </div>
    </form>
  );
}
