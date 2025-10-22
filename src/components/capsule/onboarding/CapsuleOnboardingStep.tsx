"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import styles from "./CapsuleOnboardingStep.module.css";
import { PaperPlaneTilt, Microphone, MicrophoneSlash } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

const NAME_LIMIT = 80;
const MESSAGE_LIMIT = 2000;

function describeVoiceError(code: string | null): string | null {
  if (!code) return null;
  const normalized = code.toLowerCase();
  if (normalized.includes("not-allowed")) {
    return "Microphone access is blocked. Update your browser settings to allow it.";
  }
  if (normalized === "service-not-allowed") {
    return "Microphone access is blocked by your browser.";
  }
  if (normalized === "no-speech") {
    return "Didn't catch that. Try speaking again.";
  }
  if (normalized === "aborted") {
    return null;
  }
  if (normalized === "audio-capture") {
    return "No microphone was detected.";
  }
  if (normalized === "unsupported") {
    return "Voice input isn't supported in this browser.";
  }
  if (normalized === "network") {
    return "Voice input is unavailable right now.";
  }
  if (normalized === "speech-start-error" || normalized === "speech-stop-error") {
    return "Voice input could not be started. Check your microphone and try again.";
  }
  return "Voice input is unavailable right now.";
}

function truncateVoiceText(text: string, max = 72): string {
  if (text.length <= max) return text;
  if (max <= 3) return "...";
  return `${text.slice(0, max - 3)}...`;
}

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function CapsuleOnboardingStep(): React.JSX.Element {
  const router = useRouter();

  const [name, setName] = React.useState("");
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [messageDraft, setMessageDraft] = React.useState("");
  const [chatBusy, setChatBusy] = React.useState(false);
  const [chatError, setChatError] = React.useState<string | null>(null);
  const [finishBusy, setFinishBusy] = React.useState(false);
  const [finishError, setFinishError] = React.useState<string | null>(null);
  const voiceSessionCounterRef = React.useRef(1);
  const activeVoiceSessionRef = React.useRef<number | null>(null);
  const processedVoiceSessionRef = React.useRef<number | null>(null);
  const [voiceDraft, setVoiceDraft] = React.useState<{ session: number; text: string } | null>(
    null,
  );
  const [voiceInterim, setVoiceInterim] = React.useState<string | null>(null);
  const [voiceErrorCode, setVoiceErrorCode] = React.useState<string | null>(null);

  const chatLogRef = React.useRef<HTMLDivElement | null>(null);
  const {
    supported: voiceSupported,
    status: voiceStatus,
    start: startVoice,
    stop: stopVoice,
  } = useSpeechRecognition({
    onFinalResult: (fullTranscript) => {
      const sessionId = activeVoiceSessionRef.current;
      if (!sessionId) return;
      const normalized = fullTranscript.trim();
      if (!normalized) return;
      setVoiceDraft({ session: sessionId, text: normalized });
    },
    onInterimResult: (text) => {
      const normalized = text.trim();
      setVoiceInterim(normalized.length ? normalized : null);
    },
    onError: (message) => {
      setVoiceErrorCode(message ?? "speech-error");
    },
  });

  const stopVoiceRef = React.useRef(stopVoice);

  React.useEffect(() => {
    stopVoiceRef.current = stopVoice;
  }, [stopVoice]);

  React.useEffect(
    () => () => {
      stopVoiceRef.current?.();
    },
    [],
  );

  const trimmedName = name.trim();
  const disableFinish = !trimmedName.length || finishBusy;
  const voiceButtonLabel = !voiceSupported
    ? "Voice input not supported in this browser."
    : voiceStatus === "listening"
      ? "Stop voice capture"
      : voiceStatus === "stopping"
        ? "Processing voice input"
        : "Start voice capture";
  const voiceStatusText =
    voiceStatus === "listening"
      ? voiceInterim
        ? `Listening… ${truncateVoiceText(voiceInterim)}`
        : "Listening... Speak now, then click the mic to finish."
      : voiceStatus === "stopping"
        ? "Processing your speech..."
        : null;
  const voiceErrorMessage = describeVoiceError(voiceErrorCode);
  const statusMessage =
    voiceStatusText ??
    (chatBusy
      ? "Capsule AI is riffing..."
      : "Tip: Press Enter to send. Shift + Enter for a new line.");

  React.useEffect(() => {
    const node = chatLogRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, chatBusy]);

  React.useEffect(() => {
    if (!voiceDraft) return;
    if (voiceStatus !== "idle" && voiceStatus !== "error" && voiceStatus !== "unsupported") return;
    const { session, text } = voiceDraft;
    if (processedVoiceSessionRef.current === session) return;
    processedVoiceSessionRef.current = session;
    activeVoiceSessionRef.current = null;
    const normalized = text.trim();
    if (!normalized) {
      setVoiceDraft(null);
      return;
    }
    setMessageDraft((prev) => {
      const needsSpace = prev.length > 0 && !/\s$/.test(prev);
      return `${prev}${needsSpace ? " " : ""}${normalized}`.slice(0, MESSAGE_LIMIT);
    });
    setVoiceDraft(null);
    setVoiceInterim(null);
    setVoiceErrorCode(null);
  }, [voiceDraft, voiceStatus]);

  React.useEffect(() => {
    if (voiceStatus === "listening") return;
    setVoiceInterim(null);
  }, [voiceStatus]);

  const handleVoiceToggle = React.useCallback(() => {
    if (!voiceSupported) {
      setVoiceErrorCode("unsupported");
      return;
    }
    if (voiceStatus === "stopping") return;
    if (voiceStatus === "listening") {
      stopVoice();
      return;
    }
    setVoiceErrorCode(null);
    setVoiceDraft(null);
    setVoiceInterim(null);
    const started = startVoice();
    if (started) {
      const sessionId = voiceSessionCounterRef.current;
      voiceSessionCounterRef.current += 1;
      activeVoiceSessionRef.current = sessionId;
      processedVoiceSessionRef.current = null;
    }
  }, [voiceSupported, voiceStatus, startVoice, stopVoice]);

  const handleNameChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value.slice(0, NAME_LIMIT);
    setName(next);
  }, []);

  const handleMessageChange = React.useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessageDraft(event.target.value.slice(0, MESSAGE_LIMIT));
  }, []);

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
                  <div key={message.id} className={styles.chatMessage} data-role={message.role}>
                    <span className={styles.chatAvatar} aria-hidden>
                      {message.role === "assistant" ? "AI" : "You"}
                    </span>
                    <div className={styles.chatBubble}>{message.content}</div>
                  </div>
                ))}
              </div>

              <div className={styles.prompterShell}>
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
                  <button
                    type="button"
                    className={styles.voiceButton}
                    onClick={handleVoiceToggle}
                    aria-label={voiceButtonLabel}
                    title={voiceButtonLabel}
                    aria-pressed={voiceStatus === "listening"}
                    data-active={
                      voiceStatus === "listening" || voiceStatus === "stopping" ? "true" : undefined
                    }
                    disabled={voiceStatus === "stopping"}
                  >
                    {voiceStatus === "listening" || voiceStatus === "stopping" ? (
                      <MicrophoneSlash weight="fill" size={18} />
                    ) : (
                      <Microphone weight="duotone" size={18} />
                    )}
                  </button>
                </div>
              </div>

              <div className={styles.prompterMeta}>
                <span className={styles.chatStatus}>{statusMessage}</span>
                {chatError ? <span className={styles.chatError}>{chatError}</span> : null}
                {voiceErrorMessage ? (
                  <span className={styles.chatError}>{voiceErrorMessage}</span>
                ) : null}
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
            <Button
              type="submit"
              size="lg"
              variant="gradient"
              loading={finishBusy}
              disabled={disableFinish}
            >
              Finish
            </Button>
          </div>
        </section>
      </form>
    </div>
  );
}
