import * as React from "react";
import { PaperPlaneRight, Sparkle } from "@phosphor-icons/react/dist/ssr";

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
};

export function ChatControlPanel({
  viewState,
  pendingChanges,
  lastStatus,
  open,
  collapsed,
  suggestions = DEFAULT_SUGGESTIONS,
  onToggle,
  onSendMessage,
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
        <div className={styles.ghostMessage}>View state: {viewState}</div>
        {recentChanges.length ? (
          recentChanges.map(({ event, persisted }) => (
            <div key={`${event.type}-${event.timestamp}`} className={styles.canvasSlotCard}>
              <strong>{event.type}</strong>
              <span className={styles.ghostMessage}>
                {persisted ? "Persisted" : "Pending"} · {new Date(event.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))
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
          <button type="submit" className={styles.suggestionChip} disabled={sending}>
            <PaperPlaneRight size={16} weight="bold" aria-hidden /> {sending ? "Sending..." : "Send"}
          </button>
        </div>
        {error ? <div className={styles.ghostMessage}>{error}</div> : null}
      </form>
      {lastStatus ? (
        <div className={styles.statusToast} role="status">
          <span className={styles.statusDot} style={{
            background:
              statusTone === "error"
                ? "#ff7676"
                : statusTone === "pending"
                  ? "#ffd86b"
                  : "var(--accent-400, #74b9ff)",
          }} />
          <span>{lastStatus.message ?? `${lastStatus.scope} ${lastStatus.status}`}</span>
          {typeof lastStatus.costCents === "number" ? (
            <span className={styles.ghostMessage}>{(lastStatus.costCents / 100).toFixed(2)} USD</span>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
