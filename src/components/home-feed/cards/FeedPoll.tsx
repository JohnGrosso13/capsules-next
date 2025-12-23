"use client";

import * as React from "react";

import styles from "@/components/home-feed.module.css";
import type { HomeFeedPost } from "@/hooks/useHomeFeed";

function sanitizeCounts(source: unknown, length: number): number[] | null {
  if (!Array.isArray(source)) return null;
  const values = (source as unknown[]).map((entry) => {
    const numeric = typeof entry === "number" ? entry : Number(entry);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.trunc(numeric));
  });
  return Array.from({ length }, (_, index) => values[index] ?? 0);
}

type FeedPollProps = {
  postId: string;
  poll: NonNullable<HomeFeedPost["poll"]>;
  formatCount: (value?: number | null) => string;
};

export function FeedPoll({ postId, poll, formatCount }: FeedPollProps) {
  const options = React.useMemo(
    () => poll.options.map((option) => option.trim()).filter((option) => option.length > 0),
    [poll.options],
  );
  const pollStyle = React.useMemo(
    () =>
      ({
        "--poll-thumb-size": options.length <= 4 ? "48px" : "32px",
      }) as React.CSSProperties,
    [options.length],
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
      <div className={styles.pollOptions} style={pollStyle}>
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
                <span className={styles.pollOptionThumbnail}>
                  {Array.isArray(poll.thumbnails) &&
                  typeof poll.thumbnails[index] === "string" &&
                  poll.thumbnails[index]?.trim() ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={poll.thumbnails[index] as string}
                      alt=""
                      className={styles.pollOptionThumbnailImg}
                    />
                  ) : null}
                </span>
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
