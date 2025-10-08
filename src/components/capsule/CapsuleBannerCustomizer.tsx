"use client";

import * as React from "react";
import {
  PaperPlaneTilt,
  UploadSimple,
  ImagesSquare,
  Sparkle,
  X,
  ArrowClockwise,
} from "@phosphor-icons/react/dist/ssr";

import styles from "./CapsuleBannerCustomizer.module.css";
import { Button } from "@/components/ui/button";
import { useMemoryUploads } from "@/components/memory/use-memory-uploads";
import { computeDisplayUploads } from "@/components/memory/process-uploads";
import { shouldBypassCloudflareImages } from "@/lib/cloudflare/runtime";
import type { DisplayMemoryUpload } from "@/components/memory/uploads-types";

type ChatRole = "assistant" | "user";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

type SelectedBanner =
  | { kind: "upload"; name: string; url: string }
  | { kind: "memory"; id: string; title: string | null; url: string }
  | { kind: "ai"; prompt: string };

type CapsuleBannerCustomizerProps = {
  open?: boolean;
  capsuleId?: string | null;
  capsuleName?: string | null;
  onClose: () => void;
};

const PROMPT_CHIPS = [
  "Bold neon gradients with light trails",
  "Soft sunrise palette with abstract waves",
  "Minimal dark mode with crisp typography",
  "Futuristic city skyline with light bloom",
  "Retro synthwave grid with glowing horizon",
  "Nature inspired greens with floating shapes",
] as const;

const MEMORY_SHOW_LIMIT = 6;
const MESSAGE_LIMIT = 1200;

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function describeSource(source: SelectedBanner | null): string {
  if (!source) {
    return "No banner selected yet. Upload an image, pick a memory, or describe one below.";
  }
  if (source.kind === "upload") return `Uploaded - ${source.name}`;
  if (source.kind === "memory") return `Memory - ${source.title?.trim() || "Untitled memory"}`;
  return `AI prompt - "${source.prompt}"`;
}

function assistantReply(prompt: string, capsuleName: string): string {
  const ideas = [
    `Great direction! I'll mock up a banner for ${capsuleName} with ${prompt.toLowerCase()}.`,
    `Love it. Let me explore visuals that capture ${prompt.toLowerCase()} for your capsule.`,
    `Sounds good. I'm sketching a banner concept inspired by ${prompt.toLowerCase()}.`,
    `Perfect. I'll design a banner vibe built around ${prompt.toLowerCase()}.`,
  ];
  const index = Math.floor(Math.random() * ideas.length);
  const reply = ideas[index];
  const fallback = ideas[0] ?? "I'll sketch a few banner ideas to share shortly.";
  return reply ?? fallback;
}

export function CapsuleBannerCustomizer({
  open = false,
  capsuleName,
  onClose,
}: CapsuleBannerCustomizerProps): React.JSX.Element | null {
  const normalizedName = React.useMemo(
    () => (capsuleName && capsuleName.trim().length ? capsuleName.trim() : "your capsule"),
    [capsuleName],
  );

  const { user, items, loading, error, refresh } = useMemoryUploads("upload");
  const cloudflareEnabled = React.useMemo(() => !shouldBypassCloudflareImages(), []);
  const origin = React.useMemo(
    () => (typeof window !== "undefined" ? window.location.origin : null),
    [],
  );
  const processedMemories = React.useMemo<DisplayMemoryUpload[]>(
    () => computeDisplayUploads(items, { origin, cloudflareEnabled }),
    [cloudflareEnabled, items, origin],
  );
  const limitedMemories = React.useMemo(
    () => processedMemories.slice(0, MEMORY_SHOW_LIMIT),
    [processedMemories],
  );

  const [messages, setMessages] = React.useState<ChatMessage[]>(() => [
    {
      id: randomId(),
      role: "assistant",
      content: `Hi! I'm Capsule AI. Let's craft a banner for ${normalizedName}. Describe the mood you're aiming for or pick an image to start.`,
    },
  ]);
  const [draft, setDraft] = React.useState("");
  const [chatBusy, setChatBusy] = React.useState(false);
  const [selectedBanner, setSelectedBanner] = React.useState<SelectedBanner | null>(null);
  const chatLogRef = React.useRef<HTMLDivElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const uploadObjectUrlRef = React.useRef<string | null>(null);
  const aiReplyTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setMessages([
      {
        id: randomId(),
        role: "assistant",
        content: `Hi! I'm Capsule AI. Let's craft a banner for ${normalizedName}. Describe the mood you're aiming for or pick an image to start.`,
      },
    ]);
    setDraft("");
    setChatBusy(false);
    setSelectedBanner(null);
    if (uploadObjectUrlRef.current) {
      URL.revokeObjectURL(uploadObjectUrlRef.current);
      uploadObjectUrlRef.current = null;
    }
  }, [normalizedName, open]);

  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  React.useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const node = chatLogRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [messages, open]);

  React.useEffect(
    () => () => {
      if (uploadObjectUrlRef.current) {
        URL.revokeObjectURL(uploadObjectUrlRef.current);
        uploadObjectUrlRef.current = null;
      }
      if (aiReplyTimerRef.current) {
        window.clearTimeout(aiReplyTimerRef.current);
        aiReplyTimerRef.current = null;
      }
    },
    [],
  );

  const handleClose = React.useCallback(() => {
    onClose();
  }, [onClose]);

  const handleUploadClick = React.useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (uploadObjectUrlRef.current) {
      URL.revokeObjectURL(uploadObjectUrlRef.current);
      uploadObjectUrlRef.current = null;
    }

    const objectUrl = URL.createObjectURL(file);
    uploadObjectUrlRef.current = objectUrl;
    setSelectedBanner({ kind: "upload", name: file.name, url: objectUrl });
  }, []);

  const handleMemorySelect = React.useCallback((memory: DisplayMemoryUpload) => {
    const url = memory.fullUrl || memory.displayUrl;
    setSelectedBanner({
      kind: "memory",
      id: memory.id,
      title: memory.title?.trim() || memory.description?.trim() || null,
      url,
    });
  }, []);

  const handleChipClick = React.useCallback((chip: string) => {
    setDraft(chip);
    setSelectedBanner({ kind: "ai", prompt: chip });
  }, []);

  const sendChat = React.useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed.length || chatBusy) return;

    const userMessage: ChatMessage = { id: randomId(), role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setDraft("");
    setChatBusy(true);
    setSelectedBanner({ kind: "ai", prompt: trimmed });

    const replyText = assistantReply(trimmed, normalizedName);
    if (aiReplyTimerRef.current) {
      window.clearTimeout(aiReplyTimerRef.current);
    }
    aiReplyTimerRef.current = window.setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { id: randomId(), role: "assistant", content: replyText },
      ]);
      setChatBusy(false);
    }, 720);
  }, [chatBusy, draft, normalizedName]);

  const handleComposerKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendChat();
      }
    },
    [sendChat],
  );

  const previewNode = React.useMemo(() => {
    if (!selectedBanner) {
      return (
        <div className={styles.previewPlaceholder}>
          <Sparkle size={32} weight="duotone" />
          <p>Start by chatting with Capsule AI or choosing an image.</p>
        </div>
      );
    }

    if (selectedBanner.kind === "ai") {
      return (
        <div className={styles.previewAi}>
          <span className={styles.previewAiLabel}>AI concept</span>
          <p>{selectedBanner.prompt}</p>
        </div>
      );
    }

    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={selectedBanner.url}
        alt="Banner preview"
        className={styles.previewImage}
        onError={(event) => {
          (event.currentTarget as HTMLImageElement).style.visibility = "hidden";
        }}
      />
    );
  }, [selectedBanner]);

  const renderChatMessage = (message: ChatMessage) => (
    <div key={message.id} className={styles.chatMessage} data-role={message.role}>
      <span className={styles.chatAvatar} aria-hidden>
        {message.role === "assistant" ? "AI" : "You"}
      </span>
      <div className={styles.chatBubble}>{message.content}</div>
    </div>
  );

  const overlayClick = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) {
        handleClose();
      }
    },
    [handleClose],
  );

  if (!open) return null;

  return (
    <div className={styles.overlay} role="presentation" onClick={overlayClick}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="banner-customizer-heading"
      >
        <header className={styles.header}>
          <div className={styles.titleGroup}>
            <h2 id="banner-customizer-heading">Customize capsule banner</h2>
            <p>
              Collaborate with Capsule AI, upload a new hero image, or reuse something from your
              memories.
            </p>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={handleClose}
            aria-label="Close banner customizer"
          >
            <X size={18} weight="bold" />
          </button>
        </header>

        <div className={styles.content}>
          <section className={styles.previewColumn}>
            <div className={styles.previewStage}>{previewNode}</div>
            <div className={styles.previewActions}>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleUploadClick}
                leftIcon={<UploadSimple size={16} weight="bold" />}
              >
                Upload image
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const firstMemory = limitedMemories[0];
                  if (firstMemory) {
                    handleMemorySelect(firstMemory);
                  }
                }}
                leftIcon={<ImagesSquare size={16} weight="bold" />}
              >
                Quick pick memory
              </Button>
            </div>
            <input
              ref={fileInputRef}
              className={styles.fileInput}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
            />

            <div className={styles.previewMeta}>
              <span className={styles.previewMetaLabel}>Selected banner</span>
              <p className={styles.previewMetaValue}>{describeSource(selectedBanner)}</p>
            </div>

            <div className={styles.memorySection}>
              <div className={styles.memoryHeader}>
                <div className={styles.memoryTitleGroup}>
                  <h3>Memories</h3>
                  <span>Use something you&apos;ve already saved</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void refresh();
                  }}
                  leftIcon={<ArrowClockwise size={16} weight="bold" />}
                  disabled={loading}
                >
                  {loading ? "Refreshing..." : "Refresh"}
                </Button>
              </div>
              {!user ? (
                <p className={styles.memoryStatus}>Sign in to access your memories.</p>
              ) : error ? (
                <p className={styles.memoryStatus}>{error}</p>
              ) : !limitedMemories.length ? (
                <p className={styles.memoryStatus}>
                  {loading ? "Loading your recent memories..." : "No memories found yet."}
                </p>
              ) : (
                <div className={styles.memoryGrid}>
                  {limitedMemories.map((memory) => {
                    const selected =
                      selectedBanner?.kind === "memory" && selectedBanner.id === memory.id;
                    const alt =
                      memory.title?.trim() ||
                      memory.description?.trim() ||
                      "Capsule memory preview";
                    return (
                      <button
                        key={memory.id}
                        type="button"
                        className={styles.memoryCard}
                        data-selected={selected ? "true" : undefined}
                        onClick={() => handleMemorySelect(memory)}
                        aria-label={`Use memory ${alt}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={memory.displayUrl} alt={alt} loading="lazy" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <section className={styles.chatColumn}>
            <div ref={chatLogRef} className={styles.chatLog} aria-live="polite">
              {messages.map((message) => renderChatMessage(message))}
              {chatBusy ? (
                <div className={styles.chatTyping} aria-live="polite">
                  Capsule AI is thinking...
                </div>
              ) : null}
            </div>

            <div className={styles.promptShelf}>
              <div className={styles.promptChips}>
                {PROMPT_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    className={styles.promptChip}
                    onClick={() => handleChipClick(chip)}
                  >
                    {chip}
                  </button>
                ))}
              </div>

              <div className={styles.chatComposer}>
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value.slice(0, MESSAGE_LIMIT))}
                  onKeyDown={handleComposerKeyDown}
                  className={styles.chatTextarea}
                  placeholder="Tell Capsule AI about the vibe, colors, or references you want..."
                  maxLength={MESSAGE_LIMIT}
                />
                <Button
                  variant="gradient"
                  size="sm"
                  onClick={sendChat}
                  disabled={!draft.trim().length || chatBusy}
                  leftIcon={<PaperPlaneTilt size={16} weight="fill" />}
                >
                  Ask Capsule AI
                </Button>
              </div>
              <span className={styles.chatHint}>
                {chatBusy
                  ? "Generating banner concepts..."
                  : "Shift+Enter for a new line. Capsule AI can describe, plan, or generate imagery ideas."}
              </span>
            </div>
          </section>
        </div>

        <footer className={styles.footer}>
          <div className={styles.footerStatus}>{describeSource(selectedBanner)}</div>
          <div className={styles.footerActions}>
            <Button variant="ghost" size="sm" onClick={handleClose}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" disabled={!selectedBanner}>
              Save banner
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
