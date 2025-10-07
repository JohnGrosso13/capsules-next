"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import styles from "./CapsuleOnboardingStep.module.css";
import { Paperclip, PaperPlaneTilt, Microphone } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

const NAME_LIMIT = 80;
const MESSAGE_LIMIT = 2000;

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function CapsuleOnboardingStep(): JSX.Element {
  const router = useRouter();

  const [name, setName] = React.useState("");
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [messageDraft, setMessageDraft] = React.useState("");
  const [chatBusy, setChatBusy] = React.useState(false);
  const [chatError, setChatError] = React.useState<string | null>(null);
  const [finishBusy, setFinishBusy] = React.useState(false);
  const [finishError, setFinishError] = React.useState<string | null>(null);

  const chatLogRef = React.useRef<HTMLDivElement | null>(null);

  const trimmedName = name.trim();
  const disableFinish = !trimmedName.length || finishBusy;

  React.useEffect(() => {
    const node = chatLogRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, chatBusy]);

  const handleNameChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value.slice(0, NAME_LIMIT);
      setName(next);
    },
    [],
  );

  const handleMessageChange = React.useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setMessageDraft(event.target.value.slice(0, MESSAGE_LIMIT));
    },
    [],
  );

  const sendChat = React.useCallback(async () => {
    const trimmed = messageDraft.trim();
    if (!trimmed || chatBusy) return;

    const userMessage: ChatMessage = { id: randomId(), role: "user", content: trimmed };
    const nextMessages = [...messages, userMessage].slice(-10);

    setMessages(nextMessages);
    setMessageDraft("");
    setChatError(null);
    setChatBusy(true);

    try {
      const response = await fetch("/api/ai/capsule-name", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
          ...(trimmedName ? { capsuleName: trimmedName } : {}),
        }),
      });

      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok || !payload?.message) {
        throw new Error("Capsule AI unavailable");
      }

      const assistantMessage: ChatMessage = {
        id: randomId(),
        role: "assistant",
        content: payload.message.trim(),
      };
      setMessages((prev) => [...prev, assistantMessage].slice(-10));
    } catch (error) {
      console.error("capsule onboarding chat error", error);
      setChatError("Capsule AI couldn't respond. Try again in a moment.");
    } finally {
      setChatBusy(false);
    }
  }, [chatBusy, messageDraft, messages, trimmedName]);

  const handleChatKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void sendChat();
      }
    },
    [sendChat],
  );

  const handleFinish = React.useCallback(
    async (event?: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      const finalName = trimmedName;
      if (!finalName) {
        setFinishError("Name is required.");
        return;
      }
      setFinishBusy(true);
      setFinishError(null);

      try {
        const response = await fetch("/api/capsules", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: finalName }),
        });

        const payload = (await response.json().catch(() => null)) as { capsule?: unknown } | null;
        if (!response.ok || !payload?.capsule) {
          throw new Error("Capsule creation failed");
        }

        router.push("/capsule");
      } catch (error) {
        console.error("capsule onboarding finish error", error);
        setFinishError("We couldn't create your capsule. Please try again.");
      } finally {
        setFinishBusy(false);
      }
    },
    [router, trimmedName],
  );

  return (
    <div className={styles.wrapper}>
      <form className={styles.panel} onSubmit={handleFinish} noValidate>
        <aside className={styles.stepper}>
          <div>
            <span className={styles.stepTitle}>Step 1 of 4</span>
          </div>
          <div className={styles.stepList}>
            <div className={styles.stepItem} data-active="true">
              <span className={styles.stepBullet} aria-hidden />
              <span>Goal</span>
            </div>
            <div className={styles.stepItem}>
              <span className={styles.stepBullet} aria-hidden />
              <span>Interests</span>
            </div>
            <div className={styles.stepItem}>
              <span className={styles.stepBullet} aria-hidden />
              <span>Connect</span>
            </div>
            <div className={styles.stepItem}>
              <span className={styles.stepBullet} aria-hidden />
              <span>Finish</span>
            </div>
          </div>
        </aside>

        <section className={styles.content}>
          <header className={styles.header}>
            <h1 className={styles.title}>Choose a Capsule Name</h1>
          </header>

          <div className={styles.form}>
            <label className={styles.label} htmlFor="capsule-name">
              <span>Capsule name</span>
              <Input
                id="capsule-name"
                value={name}
                onChange={handleNameChange}
                className={styles.nameInput}
                placeholder="Give your Capsule a memorable name"
              />
            </label>

            <div className={styles.chatStack}>
              <div ref={chatLogRef} className={styles.chatLog} aria-live="polite">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={styles.chatMessage}
                    data-role={message.role}
                  >
                    <span className={styles.chatAvatar} aria-hidden>
                      {message.role === "assistant" ? "AI" : "You"}
                    </span>
                    <div className={styles.chatBubble}>{message.content}</div>
                  </div>
                ))}
              </div>

              <div className={styles.prompterShell}>
                <span className={styles.prompterIcon} aria-hidden="true">
                  <Paperclip weight="duotone" size={18} />
                </span>
                <textarea
                  value={messageDraft}
                  onChange={handleMessageChange}
                  onKeyDown={handleChatKeyDown}
                  className={styles.chatTextarea}
                  placeholder="Tell Capsule AI about your idea or the vibe you want..."
                  maxLength={MESSAGE_LIMIT}
                />
                <div className={styles.prompterActions}>
                  <button
                    type="button"
                    className={styles.prompterSend}
                    onClick={() => void sendChat()}
                    disabled={chatBusy || !messageDraft.trim()}
                    aria-label="Ask Capsule AI"
                  >
                    <PaperPlaneTilt weight="fill" size={20} />
                  </button>
                  <span className={styles.prompterIcon} aria-hidden="true">
                    <Microphone weight="duotone" size={18} />
                  </span>
                </div>
              </div>

              <div className={styles.prompterMeta}>
                <span className={styles.chatStatus}>
                  {chatBusy ? "Capsule AI is riffing..." : "Tip: Press Enter to send. Shift + Enter for a new line."}
                </span>
                {chatError ? <span className={styles.chatError}>{chatError}</span> : null}
              </div>

              <p className={styles.prompterHint}>
                Start with a capsule name that reflects your community or project. Capsule AI can
                brainstorm ideas with you below.
              </p>
            </div>
          </div>

          {finishError ? <span className={styles.error}>{finishError}</span> : null}

          <div className={styles.controls}>
            <Button type="button" size="lg" variant="secondary" disabled>
              Next
            </Button>
            <Button type="submit" size="lg" variant="gradient" loading={finishBusy} disabled={disableFinish}>
              Finish
            </Button>
          </div>
        </section>
      </form>
    </div>
  );
}
