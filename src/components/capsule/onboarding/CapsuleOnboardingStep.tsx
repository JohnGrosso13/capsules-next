"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import styles from "./CapsuleOnboardingStep.module.css";
import { ArrowUp, Plus } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

type WizardStep = "name" | "membership";

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

  const [step, setStep] = React.useState<WizardStep>("name");
  const [name, setName] = React.useState("");
  const [messages, setMessages] = React.useState<ChatMessage[]>(() => [
    {
      id: randomId(),
      role: "assistant",
      content:
        "Start with a capsule name that reflects your community or project. Your assistant can brainstorm ideas with you below.",
    },
  ]);
  const [messageDraft, setMessageDraft] = React.useState("");
  const [chatBusy, setChatBusy] = React.useState(false);
  const [chatError, setChatError] = React.useState<string | null>(null);
  const [finishBusy, setFinishBusy] = React.useState(false);
  const [finishError, setFinishError] = React.useState<string | null>(null);
  const [membershipPolicy, setMembershipPolicy] =
    React.useState<"open" | "request_only" | "invite_only">("request_only");
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
  const statusMessage = voiceStatusText ?? (chatBusy ? "Your assistant is riffing..." : null);

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
        throw new Error("Assistant unavailable");
      }

      const assistantMessage: ChatMessage = {
        id: randomId(),
        role: "assistant",
        content: payload.message.trim(),
      };
      setMessages((prev) => [...prev, assistantMessage].slice(-10));
    } catch (error) {
      console.error("capsule onboarding chat error", error);
      setChatError("Your assistant couldn't respond. Try again in a moment.");
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

  const handleStepClick = React.useCallback((next: WizardStep) => {
    setStep(next);
  }, []);

  const handleNext = React.useCallback(() => {
    if (step === "name") {
      setStep("membership");
    }
  }, [step]);

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

        const payload = (await response.json().catch(() => null)) as {
          capsule?: { id?: string | null } | null;
        } | null;
        const capsuleId = payload?.capsule?.id ?? null;
        if (!response.ok || !capsuleId) {
          throw new Error("Capsule creation failed");
        }

        if (membershipPolicy !== "request_only") {
          try {
            await fetch(`/api/capsules/${capsuleId}/membership`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "set_policy",
                membershipPolicy,
              }),
            });
          } catch (policyError) {
            console.error("capsule onboarding membership update error", policyError);
          }
        }

        router.push(`/capsule?capsuleId=${capsuleId}`);
      } catch (error) {
        console.error("capsule onboarding finish error", error);
        setFinishError("We couldn't create your capsule. Please try again.");
      } finally {
        setFinishBusy(false);
      }
    },
    [membershipPolicy, router, trimmedName],
  );

  return (
    <div className={styles.wrapper}>
      <form className={styles.panel} onSubmit={handleFinish} noValidate>
        <aside className={styles.stepper}>
          <div>
            <span className={styles.stepTitle}>Step 1 of 2</span>
          </div>
          <div className={styles.stepList}>
            <button
              type="button"
              className={styles.stepItem}
              data-active={step === "name" ? "true" : undefined}
              onClick={() => handleStepClick("name")}
            >
              <span className={styles.stepBullet} aria-hidden />
              <span>Name</span>
            </button>
            <button
              type="button"
              className={styles.stepItem}
              data-active={step === "membership" ? "true" : undefined}
              onClick={() => handleStepClick("membership")}
            >
              <span className={styles.stepBullet} aria-hidden />
              <span>Membership</span>
            </button>
          </div>
        </aside>

        <section className={styles.content}>
          <header className={styles.header}>
            <h1 className={styles.title}>
              {step === "name" ? "Choose a Capsule Name" : "Choose Membership Settings"}
            </h1>
          </header>

          <div className={styles.form}>
            {step === "name" ? (
              <>
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
                    <div className={styles.prompterActions}>
                      <button
                        type="button"
                        className={styles.voiceButton}
                        onClick={handleVoiceToggle}
                        aria-label={voiceButtonLabel}
                        title={voiceButtonLabel}
                        aria-pressed={voiceStatus === "listening"}
                        data-active={
                          voiceStatus === "listening" || voiceStatus === "stopping"
                            ? "true"
                            : undefined
                        }
                        disabled={voiceStatus === "stopping"}
                      >
                        <Plus weight="bold" size={18} />
                      </button>
                    </div>
                    <textarea
                      value={messageDraft}
                      onChange={handleMessageChange}
                      onKeyDown={handleChatKeyDown}
                      className={styles.chatTextarea}
                      placeholder="Tell your assistant about your idea or the vibe you want..."
                      maxLength={MESSAGE_LIMIT}
                    />
                    <button
                      type="button"
                      className={styles.prompterSend}
                      onClick={() => void sendChat()}
                      disabled={chatBusy || !messageDraft.trim()}
                      aria-label="Ask your assistant"
                    >
                      <ArrowUp weight="bold" size={18} />
                    </button>
                  </div>

                  <div className={styles.prompterMeta}>
                    <span className={styles.chatStatus}>{statusMessage}</span>
                    {chatError ? <span className={styles.chatError}>{chatError}</span> : null}
                    {voiceErrorMessage ? (
                      <span className={styles.chatError}>{voiceErrorMessage}</span>
                    ) : null}
                  </div>
                </div>
              </>
            ) : (
              <div className={styles.membershipSection}>
                <p className={styles.membershipIntro}>
                  Choose how people can join your capsule. You can change this anytime in settings.
                </p>
                <div
                  className={styles.membershipOptions}
                  role="radiogroup"
                  aria-label="Capsule membership policy"
                >
                  <button
                    type="button"
                    className={styles.membershipOption}
                    data-selected={membershipPolicy === "open" ? "true" : undefined}
                    onClick={() => setMembershipPolicy("open")}
                  >
                    <span className={styles.membershipLabel}>Open</span>
                    <span className={styles.membershipDescription}>
                      Anyone can join instantly. Best for casual, high-traffic communities.
                    </span>
                  </button>
                  <button
                    type="button"
                    className={styles.membershipOption}
                    data-selected={membershipPolicy === "request_only" ? "true" : undefined}
                    onClick={() => setMembershipPolicy("request_only")}
                  >
                    <span className={styles.membershipLabel}>Request to join</span>
                    <span className={styles.membershipDescription}>
                      People request access and you approve or deny. Great default for most capsules.
                    </span>
                  </button>
                  <button
                    type="button"
                    className={styles.membershipOption}
                    data-selected={membershipPolicy === "invite_only" ? "true" : undefined}
                    onClick={() => setMembershipPolicy("invite_only")}
                  >
                    <span className={styles.membershipLabel}>Invite only</span>
                    <span className={styles.membershipDescription}>
                      Only invited members can join. Best for private teams or early experiments.
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {finishError ? <span className={styles.error}>{finishError}</span> : null}

          <div className={styles.controls}>
            <Button
              type="button"
              size="lg"
              variant="secondary"
              onClick={handleNext}
              disabled={step !== "name" || !trimmedName.length || finishBusy}
            >
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
