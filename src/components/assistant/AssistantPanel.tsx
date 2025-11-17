"use client";

import * as React from "react";

import type { AssistantTaskSummary } from "@/types/assistant";

import styles from "./assistant-panel.module.css";

type AssistantPanelProps = {
  tasks: AssistantTaskSummary[] | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => Promise<void> | void;
  onCancelTask?: (taskId: string) => Promise<void> | void;
  cancelingTaskIds?: Set<string>;
};

type BadgeTone = "info" | "success" | "warning";

const RELATIVE_DIVISIONS: Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.34524, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Infinity, unit: "year" },
];

const relativeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function formatRelativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return null;
  let duration = (timestamp - Date.now()) / 1000;
  for (const division of RELATIVE_DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return relativeFormatter.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return null;
}

function getTaskTitle(task: AssistantTaskSummary): string {
  if (task.kind === "assistant_broadcast") return "Broadcast";
  return task.kind.replace(/_/g, " ");
}

function getPromptPreview(prompt: string | null): string {
  if (!prompt) return "Assistant outreach";
  const trimmed = prompt.trim();
  if (!trimmed) return "Assistant outreach";
  return trimmed.length > 200 ? `${trimmed.slice(0, 197)}...` : trimmed;
}

function getTaskBadge(task: AssistantTaskSummary): { label: string; tone: BadgeTone } {
  const awaiting = task.totals.awaitingResponses;
  const failed = task.totals.failed;
  if (awaiting > 0) {
    return { label: `${awaiting} awaiting`, tone: "info" };
  }
  if (failed > 0) {
    return { label: `${failed} failed`, tone: "warning" };
  }
  if (task.status === "canceled") {
    return { label: "canceled", tone: "warning" };
  }
  const normalized = task.status.replace(/_/g, " ");
  const tone: BadgeTone = task.status === "completed" || task.status === "partial" ? "success" : "info";
  return { label: normalized, tone };
}

function summarizeTaskMetrics(task: AssistantTaskSummary) {
  const awaiting = task.totals.awaitingResponses;
  const responded = task.totals.responded;
  const failed = task.totals.failed;
  const recipients = task.totals.recipients;

  return {
    awaiting,
    responded,
    failed,
    recipients,
  };
}

export function AssistantPanel({
  tasks,
  loading,
  error,
  onRefresh,
  onCancelTask,
  cancelingTaskIds,
}: AssistantPanelProps) {
  const hasTasks = Boolean(tasks?.length);
  const waitingState = loading && !hasTasks;
  const primaryError = !loading && !hasTasks && error ? error : null;

  const handleRefresh = React.useCallback(() => {
    void onRefresh();
  }, [onRefresh]);

  const cancelingIds = cancelingTaskIds ?? new Set<string>();

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <p className={styles.kicker}>Capsules Assistant</p>
          <h3 className={styles.title}>Connect with friends & capsules</h3>
          <p className={styles.lede}>
            Launch broadcasts, follow up with party invites, and keep conversations flowing.
          </p>
        </div>
        <button
          type="button"
          className={styles.refresh}
          onClick={handleRefresh}
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      {waitingState ? (
        <div className={styles.state} role="status">
          Checking for assistant updates...
        </div>
      ) : primaryError ? (
        <div className={`${styles.state} ${styles.stateError}`} role="alert">
          {primaryError}
        </div>
      ) : !hasTasks ? (
        <div className={styles.state}>
          Assistant is idle. Start a broadcast from any capsule or DM to rally your community.
        </div>
      ) : (
        <ul className={styles.tasks} aria-live="polite">
          {tasks!.map((task) => {
            const badge = getTaskBadge(task);
            const metrics = summarizeTaskMetrics(task);
            const lastUpdated =
              formatRelativeTime(task.lastResponseAt ?? task.updatedAt) ?? "just now";
            const isCanceling = cancelingIds.has(task.id);
            const canCancel =
              onCancelTask &&
              task.status !== "completed" &&
              task.status !== "partial" &&
              task.status !== "canceled";

            return (
              <li key={task.id} className={styles.taskCard}>
                <div className={styles.taskHeader}>
                  <div>
                    <span className={styles.taskTitle}>{getTaskTitle(task)}</span>
                    <p className={styles.prompt}>{getPromptPreview(task.prompt)}</p>
                  </div>
                  <span className={`${styles.badge} ${styles[`badge_${badge.tone}`]}`}>
                    {badge.label}
                  </span>
                </div>
                <div className={styles.taskMeta}>
                  <div className={styles.metrics}>
                    <span className={styles.metric}>
                      {metrics.responded}/{metrics.recipients} responded
                    </span>
                    {metrics.awaiting > 0 ? (
                      <span className={`${styles.metric} ${styles.metricAlert}`}>
                        {metrics.awaiting} awaiting replies
                      </span>
                    ) : null}
                    {metrics.failed > 0 ? (
                      <span className={`${styles.metric} ${styles.metricWarning}`}>
                        {metrics.failed} failed deliveries
                      </span>
                    ) : null}
                  </div>
                  <span className={styles.timestamp}>Updated {lastUpdated}</span>
                  {canCancel ? (
                    <button
                      type="button"
                      className={styles.cancel}
                      onClick={() => onCancelTask?.(task.id)}
                      disabled={loading || isCanceling}
                    >
                      {isCanceling ? "Cancelling..." : "Cancel task"}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {error && hasTasks ? (
        <p className={styles.inlineError}>
          {error} — showing recently cached assistant tasks.
        </p>
      ) : null}
    </div>
  );
}

export default AssistantPanel;
