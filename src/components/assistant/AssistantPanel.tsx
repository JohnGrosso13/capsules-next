"use client";

import * as React from "react";
import Link from "next/link";
import { CaretDown } from "@phosphor-icons/react/dist/ssr";

import type { AssistantTaskSummary } from "@/types/assistant";
import { buildProfileHref } from "@/lib/profile/routes";
import type { FriendItem } from "@/hooks/useFriendsData";
import { requestChatStart } from "@/components/providers/ChatProvider";
import { ASSISTANT_DISPLAY_NAME, ASSISTANT_USER_ID, isAssistantUserId } from "@/shared/assistant/constants";
import { ChatStartOverlay } from "@/components/chat/ChatStartOverlay";
import { useRouter } from "next/navigation";

import styles from "./assistant-panel.module.css";

type AssistantPanelProps = {
  tasks: AssistantTaskSummary[] | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => Promise<void> | void;
  onCancelTask?: (taskId: string) => Promise<void> | void;
  cancelingTaskIds?: Set<string>;
  friends?: FriendItem[];
  hasRealFriends?: boolean;
  onRemoveTask?: (taskId: string) => Promise<void> | void;
  removingTaskIds?: Set<string>;
};

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
  if (task.prompt) {
    const firstLine = task.prompt
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0);
    if (firstLine) {
      return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
    }
  }
  if (task.kind) {
    return task.kind.replace(/_/g, " ");
  }
  return "Assistant task";
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

type CollapsibleSectionProps = {
  id: string;
  title: string;
  eyebrow?: string;
  status?: React.ReactNode;
  description?: string;
  actions?: React.ReactNode;
  open: boolean;
  onToggle(next: boolean): void;
  children: React.ReactNode;
};

function CollapsibleSection({
  id,
  title,
  eyebrow,
  status,
  description,
  actions,
  open,
  onToggle,
  children,
}: CollapsibleSectionProps) {
  const regionId = `${id}-region`;
  const labelId = `${id}-label`;

  return (
    <div className={`${styles.collapsible} ${open ? styles.collapsibleOpen : ""}`.trim()}>
      <div className={styles.collapsibleHeaderRow}>
        <button
          type="button"
          className={styles.collapsibleHeader}
          aria-expanded={open}
          aria-controls={regionId}
          onClick={() => onToggle(!open)}
        >
          <div className={styles.collapsibleText}>
            {eyebrow ? <span className={styles.collapsibleEyebrow}>{eyebrow}</span> : null}
            <div className={styles.collapsibleTitleRow}>
              <span className={styles.collapsibleTitle} id={labelId}>
                {title}
              </span>
              {status ? <span className={styles.collapsibleStatus}>{status}</span> : null}
            </div>
            {description ? <p className={styles.collapsibleHint}>{description}</p> : null}
          </div>
          <CaretDown
            size={16}
            weight="bold"
            className={`${styles.collapsibleCaret} ${open ? styles.collapsibleCaretOpen : ""}`.trim()}
            aria-hidden
          />
        </button>
        {actions ? <div className={styles.collapsibleActions}>{actions}</div> : null}
      </div>
      <div
        className={`${styles.collapsibleBody} ${open ? styles.collapsibleBodyOpen : ""}`.trim()}
        id={regionId}
        role="region"
        aria-labelledby={labelId}
        aria-hidden={!open}
      >
        <div className={styles.collapsibleBodyInner}>{children}</div>
      </div>
    </div>
  );
}

const BLOCKED_RECIPIENT_IDS = new Set(["capsules", "memory", "dream"].map((id) => id.toLowerCase()));

function isEligibleRecipient(friend: FriendItem): friend is FriendItem & { userId: string } {
  if (typeof friend.userId !== "string") return false;
  const trimmed = friend.userId.trim();
  if (!trimmed) return false;
  if (BLOCKED_RECIPIENT_IDS.has(trimmed.toLowerCase())) return false;
  return !isAssistantUserId(trimmed);
}

export function AssistantPanel({
  tasks,
  loading,
  error,
  onRefresh,
  onCancelTask,
  cancelingTaskIds,
  friends,
  hasRealFriends = false,
  onRemoveTask,
  removingTaskIds,
}: AssistantPanelProps) {
  const friendList = React.useMemo(
    () =>
      (friends ?? []).filter((friend): friend is FriendItem & { userId: string } => isEligibleRecipient(friend)),
    [friends],
  );
  const friendMap = React.useMemo(
    () => new Map(friendList.map((friend) => [friend.userId, friend])),
    [friendList],
  );
  const [taskTitle, setTaskTitle] = React.useState("");
  const [taskDetails, setTaskDetails] = React.useState("");
  const [selectedRecipients, setSelectedRecipients] = React.useState<Set<string>>(new Set());
  const [creatingTask, setCreatingTask] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = React.useState<string | null>(null);
  const [composerExpanded, setComposerExpanded] = React.useState(false);
  const [tasksExpanded, setTasksExpanded] = React.useState(false);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const router = useRouter();
  const hasTasks = Boolean(tasks?.length);
  const waitingState = loading && !hasTasks;
  const primaryError = !loading && !hasTasks && error ? error : null;
  const composerBodyId = "assistant-task-composer";
  const tasksBodyId = "assistant-task-list";
  const hasEligibleFriends = friendList.length > 0;
  const recipientGuardMessage = hasRealFriends
    ? "System contacts can't receive assistant tasks. Choose a real friend."
    : "Add a friend before assigning an assistant task.";

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
      router.push("/friends?tab=Assistant");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Unable to open assistant chat.");
    }
  }, [router]);

  const handleCreateTask = React.useCallback(async () => {
    setCreateError(null);
    setCreateSuccess(null);
    if (!hasEligibleFriends) {
      setCreateError(recipientGuardMessage);
      return;
    }
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
          };
        }),
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
      setSelectedRecipients(new Set());
      setCreateSuccess("Task created. The assistant is reaching out and will track replies.");
      void onRefresh();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Unable to start task.");
    } finally {
      setCreatingTask(false);
    }
  }, [
    friendMap,
    hasEligibleFriends,
    onRefresh,
    recipientGuardMessage,
    selectedRecipients,
    taskDetails,
    taskTitle,
  ]);

  const sortedTasks = React.useMemo(() => {
    if (!tasks || !tasks.length) return [];
    return [...tasks].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }, [tasks]);

  const activeTasks = React.useMemo(
    () => sortedTasks.filter((task) => isTaskActive(task)),
    [sortedTasks],
  );

  const recentTasks = React.useMemo(
    () => sortedTasks.filter((task) => !isTaskActive(task)),
    [sortedTasks],
  );

  const cancelingIds = React.useMemo(
    () => cancelingTaskIds ?? new Set<string>(),
    [cancelingTaskIds],
  );
  const removingIds = React.useMemo(
    () => removingTaskIds ?? new Set<string>(),
    [removingTaskIds],
  );

  const renderTaskCard = React.useCallback(
    (task: AssistantTaskSummary) => {
      const metrics = summarizeTaskMetrics(task);
      const lastUpdated = formatRelativeTime(task.lastResponseAt ?? task.updatedAt) ?? "just now";
      const isCanceling = cancelingIds.has(task.id);
      const isRemoving = removingIds.has(task.id);
      const direction =
        task.direction === "incoming" || task.direction === "outgoing" ? task.direction : "outgoing";
      const directionLabel = direction === "incoming" ? "Incoming request" : "Outgoing request";
      const isFinalized =
        task.status === "completed" || task.status === "partial" || task.status === "canceled";
      const canCancel = onCancelTask && !isFinalized;
      const canRemove = onRemoveTask && isFinalized;
      const stageLabel = describeTaskStatus(task);
      const isIncoming = direction === "incoming";
      const isNewIncoming = isIncoming && !isFinalized && metrics.responded === 0;

      return (
        <li key={task.id} className={styles.taskCard}>
          <div className={styles.taskHeader}>
            <div className={styles.taskTopMeta}>
              <span className={styles.taskMetaLabel}>{directionLabel}</span>
              <span className={styles.taskMetaDivider}>•</span>
              <span className={styles.taskMetaLabel}>{stageLabel}</span>
            </div>
            <div>
              <span className={styles.taskTitle}>{getTaskTitle(task)}</span>
              {isNewIncoming ? <span className={styles.taskBadge}>New</span> : null}
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
                  {metrics.failed > 0 ? (
                    <span className={`${styles.metric} ${styles.metricWarning}`}>
                      {metrics.failed} failed deliveries
                    </span>
                  ) : null}
                </>
              )}
            </div>
            <div className={styles.taskFooter}>
              <span className={styles.timestamp}>Updated {lastUpdated}</span>
              <Link
                href={`/assistant/tasks/${task.id}`}
                className={`${styles.linkButton} ${styles.inlineLink}`}
              >
                View task
              </Link>
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
              {canRemove ? (
                <button
                  type="button"
                  className={styles.cancel}
                  onClick={() => onRemoveTask?.(task.id)}
                  disabled={loading || isRemoving}
                >
                  {isRemoving ? "Removing..." : "Clear task"}
                </button>
              ) : null}
            </div>
          </div>
        </li>
      );
    },
    [cancelingIds, loading, onCancelTask, onRemoveTask, removingIds],
  );

  return (
    <div className={styles.panel}>
      <CollapsibleSection
        id="assistant-composer"
        title="Create task"
        eyebrow="Assistant"
        description="Share the goal and who should receive it. The assistant will message them and track replies."
        status={selectedRecipients.size ? `${selectedRecipients.size} selected` : undefined}
        open={composerExpanded}
        onToggle={setComposerExpanded}
      >
        <div id={composerBodyId}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="assistant-task-title">
              Task title
            </label>
            <input
              id="assistant-task-title"
              className={styles.input}
              placeholder="e.g. Plan Saturday meetup or collect RSVPs"
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
              placeholder="Describe the message or steps, plus any key links."
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
                Who is involved?
              </label>
              <span className={styles.muted}>{selectedRecipients.size}/25 selected</span>
            </div>
            <button
              id="assistant-task-recipients"
              type="button"
              className={styles.inviteInput}
              onClick={() => {
                if (!hasEligibleFriends) {
                  setCreateError(recipientGuardMessage);
                  return;
                }
                setInviteOpen(true);
              }}
              disabled={!hasEligibleFriends}
            >
              {selectedRecipients.size ? (
                <span>{selectedRecipients.size} selected</span>
              ) : (
                <span className={styles.muted}>
                  {hasEligibleFriends ? "Type a name to involve" : "Add friends to involve"}
                </span>
              )}
            </button>
          </div>

          {createError ? (
            <p className={`${styles.inlineError} ${styles.inlineErrorTight}`}>{createError}</p>
          ) : null}
          {!hasEligibleFriends && !createError ? (
            <p className={styles.inlineError}>{recipientGuardMessage}</p>
          ) : null}
          {createSuccess ? <p className={styles.success}>{createSuccess}</p> : null}

          <div className={styles.composerFooter}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void handleCreateTask()}
              disabled={creatingTask || !hasEligibleFriends}
            >
              {creatingTask ? "Starting..." : "Start task"}
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void openAssistantChat()}
            >
              Chat with assistant
            </button>
          </div>
        </div>
      </CollapsibleSection>

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
          <CollapsibleSection
            id="assistant-tasks"
            title="Assistant tasks"
            eyebrow="Assistant"
            status={
              activeTasks.length
                ? `${activeTasks.length} active`
                : recentTasks.length
                  ? "No active - recent below"
                  : "No active tasks"
            }
            open={tasksExpanded}
            onToggle={setTasksExpanded}
          >
            <div id={tasksBodyId}>
              {!activeTasks.length ? (
                <div className={styles.state}>
                  Nothing in progress. Create a task above to have the assistant message friends or
                  help plan something for you.
                </div>
              ) : (
                <ul className={styles.tasks} aria-live="polite">
                  {activeTasks.map((task) => renderTaskCard(task))}
                </ul>
              )}

              {recentTasks.length ? (
                <section className={styles.taskSection}>
                  <div className={styles.sectionHeader}>
                    <p className={styles.kicker}>Recent</p>
                    <h4 className={styles.sectionTitle}>Recent tasks</h4>
                  </div>
                  <ul className={styles.tasks} aria-live="polite">
                    {recentTasks.slice(0, 3).map((task) => renderTaskCard(task))}
                  </ul>
                </section>
              ) : null}
            </div>
          </CollapsibleSection>
        </>
      )}
      {error && hasTasks ? (
        <p className={styles.inlineError}>
          {error} - showing recently cached assistant tasks.
        </p>
      ) : null}

      <ChatStartOverlay
        open={inviteOpen}
        friends={friendList}
        onClose={() => setInviteOpen(false)}
        onSubmit={(userIds) => {
          setSelectedRecipients(new Set(userIds.slice(0, 25)));
          setInviteOpen(false);
          setCreateError(null);
        }}
        busy={creatingTask}
        mode="chat"
      />
    </div>
  );
}

export default AssistantPanel;
