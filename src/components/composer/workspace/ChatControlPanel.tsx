import * as React from "react";
import { CheckCircle, PaperPlaneRight, PlusCircle, Sparkle, XCircle } from "@phosphor-icons/react/dist/ssr";

import type { ComposerViewState, PendingComposerChange } from "@/shared/types/artifacts";

import styles from "./composer-workspace.module.css";

const DEFAULT_SUGGESTIONS = [
  "Add a hero block with a launch teaser",
  "Summarize this artifact in three bullets",
  "Inject recent testimonial into highlights",
];

type ChatControlPanelProps = {
  viewState: ComposerViewState;
  pendingChanges: PendingComposerChange[];
  lastStatus: {
    scope: string;
    status: string;
    message?: string | null;
    costCents?: number | null;
    timestamp: number;
  } | null;
  open: boolean;
  collapsed: boolean;
  suggestions?: string[];
  onToggle?: () => void;
  onSendMessage?: (value: string) => Promise<void> | void;
  onAddMediaSlot?: () => void;
  onAcceptChange?: (timestamp: number) => void;
  onDiscardChange?: (timestamp: number) => void;
};

function formatEventLabel(eventType: string): string {
  switch (eventType) {
    case "insert_block":
      return "AI proposed a new block";
    case "update_slot":
      return "Slot updated";
    case "remove_block":
      return "Block removed";
    case "preview_media":
      return "Media preview ready";
    case "commit_artifact":
      return "Artifact committed";
    default:
      return eventType.replace(/_/g, " ");
  }
}

export function ChatControlPanel({
  viewState,
  pendingChanges,
  lastStatus,
  open,
  collapsed,
  suggestions = DEFAULT_SUGGESTIONS,
  onToggle,
  onSendMessage,
  onAddMediaSlot,
  onAcceptChange,
  onDiscardChange,
}: ChatControlPanelProps) {
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    if (!onSendMessage) {
      setDraft("");
      return;
    }
    try {
      setSending(true);
      await onSendMessage(draft.trim());
      setDraft("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send message";
      setError(message);
    } finally {
      setSending(false);
    }
  };

  const recentChanges = React.useMemo(
    () => pendingChanges.slice(-6).reverse(),
    [pendingChanges],
  );

  const statusTone = React.useMemo(() => {
    if (!lastStatus) return "inactive";
    if (lastStatus.status === "error") return "error";
    if (lastStatus.status === "pending") return "pending";
    return "success";
  }, [lastStatus]);

  return (
    <aside
      className={styles.chatColumn}
      data-open={open ? "true" : "false"}
      aria-label="Composer chat"
    >
      <div className={styles.chatHistory}>
        <div className={styles.chatActionRow}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={onAddMediaSlot}
            disabled={!onAddMediaSlot}
          >
            <PlusCircle size={18} weight="bold" aria-hidden /> Add media slot
          </button>
          {onToggle ? (
            <button type="button" className={styles.secondaryButton} onClick={onToggle}>
              {collapsed ? "Show chat" : "Hide chat"}
            </button>
          ) : null}
        </div>
        <span className={styles.ghostMessage}>View state: {viewState}</span>
        {recentChanges.length ? (
          recentChanges.map(({ event, persisted }) => {
            const readable = formatEventLabel(event.type);
            const timestamp = new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            const actionable = !persisted;
            return (
              <div key={`${event.type}-${event.timestamp}`} className={styles.proposalCard}>
                <strong>{readable}</strong>
                <span className={styles.ghostMessage}>
                  {persisted ? "Applied" : "Pending review"} | {timestamp}
                </span>
                {actionable ? (
                  <div className={styles.proposalActions}>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => onAcceptChange?.(event.timestamp)}
                      disabled={!onAcceptChange}
                    >
                      <CheckCircle size={16} weight="bold" aria-hidden /> Accept
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => onDiscardChange?.(event.timestamp)}
                      disabled={!onDiscardChange}
                    >
                      <XCircle size={16} weight="bold" aria-hidden /> Dismiss
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })
        ) : (
          <div className={styles.ghostMessage}>No chat history yet. Start with a prompt below.</div>
        )}
      </div>
      <form className={styles.chatComposer} onSubmit={handleSubmit}>
        <div className={styles.chatActions}>
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className={styles.suggestionChip}
              onClick={() => setDraft((prev) => (prev ? `${prev} ${suggestion}` : suggestion))}
            >
              <Sparkle size={14} weight="bold" aria-hidden /> {suggestion}
            </button>
          ))}
        </div>
        <div className={styles.chatInputRow}>
          <textarea
            className={styles.chatInput}
            placeholder="Ask the assistant to modify the artifact..."
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label="Chat prompt"
          />
          <button type="submit" className={styles.primaryButton} disabled={sending}>
            <PaperPlaneRight size={16} weight="bold" aria-hidden /> {sending ? "Sending..." : "Send"}
          </button>
        </div>
        {error ? <div className={styles.ghostMessage}>{error}</div> : null}
      </form>
      {lastStatus ? (
        <div className={styles.statusToast} role="status">
          <span
            className={styles.statusDot}
            style={{
              background:
                statusTone === "error"
                  ? "var(--composer-status-error, var(--color-danger, #f87171))"
                  : statusTone === "pending"
                    ? "var(--composer-status-warning, var(--color-warning, #fbbf24))"
                    : "var(--composer-status-success, var(--composer-accent, var(--color-brand, #6366f1)))",
            }}
          />
          <span>{lastStatus.message ?? `${lastStatus.scope} ${lastStatus.status}`}</span>
          {typeof lastStatus.costCents === "number" ? (
            <span className={styles.ghostMessage}>{(lastStatus.costCents / 100).toFixed(2)} USD</span>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
