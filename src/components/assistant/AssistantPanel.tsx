"use client";

import * as React from "react";
import Link from "next/link";

import type { AssistantTaskSummary } from "@/types/assistant";
import { buildProfileHref } from "@/lib/profile/routes";
import type { FriendItem } from "@/hooks/useFriendsData";
import { requestChatStart } from "@/components/providers/ChatProvider";
import { ASSISTANT_DISPLAY_NAME, ASSISTANT_USER_ID } from "@/shared/assistant/constants";

import styles from "./assistant-panel.module.css";

type AssistantPanelProps = {
  tasks: AssistantTaskSummary[] | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => Promise<void> | void;
  onCancelTask?: (taskId: string) => Promise<void> | void;
  cancelingTaskIds?: Set<string>;
  friends?: FriendItem[];
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

function getTaskBadge(task: AssistantTaskSummary): { label: string; tone: BadgeTone } | null {
  const awaiting = task.totals.awaitingResponses;
  const failed = task.totals.failed;
  // Avoid duplicating "awaiting" pill when metrics also show it; only show awaiting for incoming tasks.
  if (awaiting > 0 && task.direction === "incoming") {
    return { label: "awaiting your reply", tone: "info" };
  }
  if (failed > 0) {
    return { label: `${failed} failed`, tone: "warning" };
  }
  if (task.status === "canceled") {
    return { label: "canceled", tone: "warning" };
  }
  if (task.status === "completed" || task.status === "partial") {
    return { label: task.status, tone: "success" };
  }
  return null;
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

function isTaskActive(task: AssistantTaskSummary): boolean {
  return task.status !== "completed" && task.status !== "partial" && task.status !== "canceled";
}

function describeTaskStatus(task: AssistantTaskSummary): string {
  switch (task.status) {
    case "awaiting_responses":
      return "Awaiting replies";
    case "messaging":
    case "pending":
      return "In progress";
    case "partial":
      return "Partial";
    case "canceled":
      return "Canceled";
    case "completed":
      return "Completed";
    default:
      return "Active";
  }
}

function describeNextStep(task: AssistantTaskSummary): string {
  const { awaitingResponses, responded, recipients, failed } = task.totals;
  if (task.status === "messaging") {
    return "Assistant is delivering your outreach.";
  }
  if (task.status === "awaiting_responses" && awaitingResponses > 0) {
    return `${awaitingResponses} awaiting replies.`;
  }
  if (task.status === "partial") {
    return `${responded}/${recipients} responded; ${failed} failed.`;
  }
  if (task.status === "canceled") {
    return "Task canceled.";
  }
  if (task.status === "completed") {
    return `${responded}/${recipients} responded.`;
  }
  if (awaitingResponses > 0) {
    return `${awaitingResponses} awaiting replies.`;
  }
  return "All responses captured.";
}

export function AssistantPanel({
  tasks,
  loading,
  error,
  onRefresh,
  onCancelTask,
  cancelingTaskIds,
  friends,
}: AssistantPanelProps) {
  const friendList = React.useMemo(
    () =>
      (friends ?? []).filter(
        (friend): friend is FriendItem & { userId: string } =>
          typeof friend.userId === "string" && friend.userId.trim().length > 0,
      ),
    [friends],
  );
  const friendMap = React.useMemo(
    () => new Map(friendList.map((friend) => [friend.userId, friend])),
    [friendList],
  );
  const [taskTitle, setTaskTitle] = React.useState("");
  const [taskDetails, setTaskDetails] = React.useState("");
  const [recipientQuery, setRecipientQuery] = React.useState("");
  const [manualRecipient, setManualRecipient] = React.useState("");
  const [selectedRecipients, setSelectedRecipients] = React.useState<Set<string>>(new Set());
  const [trackResponses, setTrackResponses] = React.useState(true);
  const [creatingTask, setCreatingTask] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = React.useState<string | null>(null);
  const hasTasks = Boolean(tasks?.length);
  const waitingState = loading && !hasTasks;
  const primaryError = !loading && !hasTasks && error ? error : null;

  const handleRefresh = React.useCallback(() => {
    void onRefresh();
  }, [onRefresh]);

  const recipientOptions = React.useMemo(() => {
    const query = recipientQuery.trim().toLowerCase();
    const sorted = [...friendList].sort((a, b) => {
      const left = a.name?.toLowerCase() ?? a.userId.toLowerCase();
      const right = b.name?.toLowerCase() ?? b.userId.toLowerCase();
      return left.localeCompare(right);
    });
    return sorted
      .filter((friend) => {
        if (!query) return true;
        const name = friend.name?.toLowerCase() ?? "";
        return name.includes(query) || friend.userId.toLowerCase().includes(query);
      })
      .slice(0, 15);
  }, [friendList, recipientQuery]);

  const selectedRecipientItems = React.useMemo(
    () =>
      Array.from(selectedRecipients).map((id) => {
        const friend = friendMap.get(id);
        return {
          userId: id,
          name: friend?.name ?? id,
          avatar: friend?.avatar ?? null,
        };
      }),
    [friendMap, selectedRecipients],
  );

  const toggleRecipient = React.useCallback((userId: string) => {
    setSelectedRecipients((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else if (next.size < 25) {
        next.add(userId);
      }
      return next;
    });
    setCreateError(null);
  }, []);

  const handleManualRecipient = React.useCallback(() => {
    const trimmed = manualRecipient.trim();
    if (!trimmed) return;
    toggleRecipient(trimmed);
    setManualRecipient("");
  }, [manualRecipient, toggleRecipient]);

  const openAssistantChat = React.useCallback(async () => {
    setCreateError(null);
    try {
      await requestChatStart(
        {
          userId: ASSISTANT_USER_ID,
          name: ASSISTANT_DISPLAY_NAME,
          avatar: null,
        },
        { activate: true },
      );
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Unable to open assistant chat.");
    }
  }, []);

  const openChatWithUser = React.useCallback(async (userId: string, name?: string | null) => {
    if (!userId) return;
    setCreateError(null);
    try {
      await requestChatStart(
        {
          userId,
          name: name ?? userId,
          avatar: friendMap.get(userId)?.avatar ?? null,
        },
        { activate: true },
      );
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Unable to open chat.");
    }
  }, [friendMap]);

  const handleCreateTask = React.useCallback(async () => {
    setCreateError(null);
    setCreateSuccess(null);
    const promptPieces = [taskTitle.trim(), taskDetails.trim()].filter(Boolean);
    if (!promptPieces.length) {
      setCreateError("Add a goal or message for the assistant.");
      return;
    }
    if (!selectedRecipients.size) {
      setCreateError("Choose at least one person to involve.");
      return;
    }
    if (selectedRecipients.size > 25) {
      setCreateError("Limit to 25 recipients per task.");
      return;
    }
    setCreatingTask(true);
    try {
      const payload = {
        prompt: promptPieces.join("\n\n"),
        recipients: Array.from(selectedRecipients).map((userId) => {
          const friend = friendMap.get(userId);
          return {
            userId,
            name: friend?.name ?? null,
            trackResponses,
          };
        }),
        trackResponses,
      };
      const response = await fetch("/api/assistant/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const message = await response.text().catch(() => "");
        throw new Error(message || "Unable to start task right now.");
      }
      setTaskTitle("");
      setTaskDetails("");
      setRecipientQuery("");
      setSelectedRecipients(new Set());
      setCreateSuccess("Task created. The assistant is reaching out and will track replies.");
      void onRefresh();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Unable to start task.");
    } finally {
      setCreatingTask(false);
    }
  }, [friendMap, onRefresh, selectedRecipients, taskDetails, taskTitle, trackResponses]);

  const sortedTasks = React.useMemo(() => {
    if (!tasks || !tasks.length) return [];
    return [...tasks].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }, [tasks]);

  const activeTasks = React.useMemo(
    () => sortedTasks.filter((task) => isTaskActive(task)),
    [sortedTasks],
  );

  const completedTasks = React.useMemo(
    () => sortedTasks.filter((task) => !isTaskActive(task)),
    [sortedTasks],
  );

  const cancelingIds = React.useMemo(
    () => cancelingTaskIds ?? new Set<string>(),
    [cancelingTaskIds],
  );

  const renderTaskCard = React.useCallback(
    (task: AssistantTaskSummary) => {
      const badge = getTaskBadge(task);
      const metrics = summarizeTaskMetrics(task);
      const lastUpdated = formatRelativeTime(task.lastResponseAt ?? task.updatedAt) ?? "just now";
      const isCanceling = cancelingIds.has(task.id);
      const direction =
        task.direction === "incoming" || task.direction === "outgoing" ? task.direction : "outgoing";
      const directionLabel = direction === "incoming" ? "Incoming request" : "Outgoing request";
      const canCancel =
        onCancelTask &&
        task.status !== "completed" &&
        task.status !== "partial" &&
        task.status !== "canceled";
      const stageLabel = describeTaskStatus(task);
      const nextStep = describeNextStep(task);

      return (
        <li key={task.id} className={styles.taskCard}>
          <div className={styles.taskHeader}>
            <div className={styles.taskTopMeta}>
              <span
                className={`${styles.pill} ${
                  direction === "incoming" ? styles.pillIncoming : styles.pillOutgoing
                }`.trim()}
              >
                {directionLabel}
              </span>
              <span className={`${styles.pill} ${styles.pill_info}`}>{stageLabel}</span>
              {badge ? (
                <span className={`${styles.pill} ${styles[`pill_${badge.tone}`]}`}>{badge.label}</span>
              ) : null}
            </div>
            <div>
              <span className={styles.taskTitle}>{getTaskTitle(task)}</span>
              <p className={styles.prompt}>{getPromptPreview(task.prompt)}</p>
              <p className={styles.nextStep}>{nextStep}</p>
              <Link href={`/assistant/tasks/${task.id}`} className={styles.linkButton}>
                View task thread
              </Link>
            </div>
          </div>
          {task.recipients.length ? (
            <div className={styles.recipientRow}>
              <span className={styles.recipientLabel}>
                {direction === "incoming" ? "From" : "To"}
              </span>
              <div className={styles.recipientList}>
                {task.recipients.map((recipient) => {
                  const href = buildProfileHref({ userId: recipient.userId, userKey: recipient.userId });
                  const name = recipient.name?.trim() || recipient.userId;
                  return (
                    <Link key={recipient.userId} href={href ?? "#"} className={styles.recipientChip}>
                      <span className={styles.recipientName}>{name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className={styles.taskMeta}>
            <div className={styles.metrics}>
              {direction === "incoming" ? (
                <>
                  <span className={styles.metric}>
                    {metrics.awaiting > 0 ? "Awaiting your reply" : "You responded"}
                  </span>
                  <span className={styles.metric}>{task.counterpartName ?? "From your contact"}</span>
                </>
              ) : (
                <>
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
                </>
              )}
            </div>
            <div className={styles.taskActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => void openAssistantChat()}
              >
                Chat with assistant
              </button>
              {task.counterpartUserId ? (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => void openChatWithUser(task.counterpartUserId ?? "", task.counterpartName)}
                >
                  Open thread with {task.counterpartName ?? "contact"}
                </button>
              ) : null}
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
            <span className={styles.timestamp}>Updated {lastUpdated}</span>
          </div>
        </li>
      );
    },
    [cancelingIds, loading, onCancelTask, openAssistantChat, openChatWithUser],
  );

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <p className={styles.kicker}>Capsules Assistant</p>
          <h3 className={styles.title}>Your connected Capsules assistant</h3>
          <p className={styles.lede}>
            Let the assistant organize plans, track invites, and handle conversations across
            capsules on your behalf.
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

      <section className={styles.composer} aria-label="Assistant task composer">
        <div className={styles.composerHeader}>
          <div>
            <p className={styles.kicker}>Scoped tasks</p>
            <h4 className={styles.composerTitle}>Spin up a task thread</h4>
            <p className={styles.composerSubhead}>
              Set the goal and who to reach. The assistant will handle outreach and keep this task
              separate from your ongoing chat.
            </p>
          </div>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => void openAssistantChat()}
          >
            Chat with assistant
          </button>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="assistant-task-title">
            Task title
          </label>
          <input
            id="assistant-task-title"
            className={styles.input}
            placeholder="Plan Saturday meetup, coordinate invites, gather info..."
            value={taskTitle}
            onChange={(event) => {
              setTaskTitle(event.target.value);
              setCreateError(null);
            }}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="assistant-task-details">
            Details for the assistant
          </label>
          <textarea
            id="assistant-task-details"
            className={styles.textarea}
            rows={3}
            placeholder="What outcome do you want? Include timelines, links, or talking points."
            value={taskDetails}
            onChange={(event) => {
              setTaskDetails(event.target.value);
              setCreateError(null);
            }}
          />
        </div>

        <div className={styles.field}>
          <div className={styles.labelRow}>
            <label className={styles.label} htmlFor="assistant-task-recipients">
              Recipients
            </label>
            <span className={styles.muted}>{selectedRecipients.size}/25 selected</span>
          </div>
          <input
            id="assistant-task-recipients"
            className={styles.input}
            placeholder="Filter by name or handle"
            value={recipientQuery}
            onChange={(event) => setRecipientQuery(event.target.value)}
          />
          <div className={styles.recipientPicker}>
            {recipientOptions.length ? (
              recipientOptions.map((friend) => {
                const checked = selectedRecipients.has(friend.userId);
                return (
                  <label key={friend.userId} className={styles.recipientOption}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRecipient(friend.userId)}
                    />
                    <span>{friend.name ?? friend.userId}</span>
                  </label>
                );
              })
            ) : (
              <p className={styles.muted}>No matches. Add someone manually below.</p>
            )}
          </div>
          <div className={styles.inlineAdd}>
            <input
              className={styles.input}
              placeholder="Add another user id"
              value={manualRecipient}
              onChange={(event) => setManualRecipient(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleManualRecipient();
                }
              }}
            />
            <button type="button" className={styles.secondaryButton} onClick={handleManualRecipient}>
              Add
            </button>
          </div>
          {selectedRecipientItems.length ? (
            <div className={styles.selectedChips}>
              {selectedRecipientItems.map((recipient) => (
                <button
                  key={recipient.userId}
                  type="button"
                  className={styles.selectedChip}
                  onClick={() => toggleRecipient(recipient.userId)}
                >
                  <span>{recipient.name ?? recipient.userId}</span>
                  <span className={styles.removeChip} aria-hidden="true">
                    x
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className={styles.muted}>Pick people to keep this task scoped.</p>
          )}
        </div>

        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={trackResponses}
            onChange={(event) => setTrackResponses(event.target.checked)}
          />
          Track replies and mark complete automatically.
        </label>

        {createError ? <p className={`${styles.inlineError} ${styles.inlineErrorTight}`}>{createError}</p> : null}
        {createSuccess ? <p className={styles.success}>{createSuccess}</p> : null}

        <div className={styles.composerFooter}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => void handleCreateTask()}
            disabled={creatingTask}
          >
            {creatingTask ? "Starting..." : "Start task"}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => void openAssistantChat()}
          >
            Talk it through with assistant
          </button>
        </div>
      </section>

      {waitingState ? (
        <div className={styles.state} role="status">
          Checking for assistant updates...
        </div>
      ) : primaryError ? (
        <div className={`${styles.state} ${styles.stateError}`} role="alert">
          {primaryError}
        </div>
      ) : (
        <>
          <section className={styles.taskSection}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.kicker}>Active tasks</p>
                <h4 className={styles.sectionTitle}>In flight</h4>
              </div>
              <span className={styles.sectionHint}>
                {activeTasks.length ? `${activeTasks.length} open` : "No active tasks"}
              </span>
            </div>
            {!activeTasks.length ? (
              <div className={styles.state}>
                Assistant is idle. Tell it what you&apos;re trying to do: plan, gather info, or reach
                out, and it will take it from there.
              </div>
            ) : (
              <ul className={styles.tasks} aria-live="polite">
                {activeTasks.map((task) => renderTaskCard(task))}
              </ul>
            )}
          </section>

          {completedTasks.length ? (
            <section className={styles.taskSection}>
              <div className={styles.sectionHeader}>
                <div>
                  <p className={styles.kicker}>History</p>
                  <h4 className={styles.sectionTitle}>Recently wrapped</h4>
                </div>
                <span className={styles.sectionHint}>
                  Showing {Math.min(completedTasks.length, 5)} of {completedTasks.length}
                </span>
              </div>
              <ul className={styles.tasks} aria-live="polite">
                {completedTasks.slice(0, 5).map((task) => renderTaskCard(task))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      {error && hasTasks ? (
        <p className={styles.inlineError}>
          {error} - showing recently cached assistant tasks.
        </p>
      ) : null}
    </div>
  );
}

export default AssistantPanel;
