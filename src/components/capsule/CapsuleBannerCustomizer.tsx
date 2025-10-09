"use client";

import * as React from "react";
import { UploadSimple, ImagesSquare, Sparkle, X, ArrowClockwise, Brain } from "@phosphor-icons/react/dist/ssr";

import styles from "./CapsuleBannerCustomizer.module.css";
import { AiPrompterStage, type PrompterAction } from "@/components/ai-prompter-stage";
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

type BannerCrop = {
  /**
   * Normalized offset (-1 to 1) along the X axis where 0 means centered.
   * Positive values shift the image down/right, negative up/left.
   */
  offsetX: number;
  /**
   * Normalized offset (-1 to 1) along the Y axis where 0 means centered.
   */
  offsetY: number;
};

type CroppableBanner = {
  crop: BannerCrop;
};

type SelectedBanner =
  | ({ kind: "upload"; name: string; url: string } & CroppableBanner)
  | ({ kind: "memory"; id: string; title: string | null; url: string } & CroppableBanner)
  | { kind: "ai"; prompt: string };

type DragState = {
  pointerId: number;
  cleanup: () => void;
};

type PreviewMetrics = {
  overflowX: number;
  overflowY: number;
  maxOffsetX: number;
  maxOffsetY: number;
};

type CapsuleBannerCustomizerProps = {
  open?: boolean;
  capsuleId?: string | null;
  capsuleName?: string | null;
  onClose: () => void;
};

// Keep exactly three to ensure a single row that feels intentional
const PROMPT_CHIPS = [
  "Bold neon gradients",
  "Soft sunrise palette",
  "Minimal dark mode",
] as const;

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

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

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

  const [messages, setMessages] = React.useState<ChatMessage[]>(() => [
    {
      id: randomId(),
      role: "assistant",
      content: `Hi! I'm Capsule AI. Let's craft a banner for ${normalizedName}. Describe the mood you're aiming for or pick an image to start.`,
    },
  ]);
  const [chatBusy, setChatBusy] = React.useState(false);
  const [selectedBanner, setSelectedBanner] = React.useState<SelectedBanner | null>(null);
  const previewOffsetRef = React.useRef({ x: 0, y: 0 });
  const [previewOffset, setPreviewOffset] = React.useState(previewOffsetRef.current);
  const [isDraggingPreview, setIsDraggingPreview] = React.useState(false);
  const [previewCanPan, setPreviewCanPan] = React.useState(false);
  const [prompterSession, setPrompterSession] = React.useState(0);
  const [memoryPickerOpen, setMemoryPickerOpen] = React.useState(false);
  const chatLogRef = React.useRef<HTMLDivElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const memoryButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const uploadObjectUrlRef = React.useRef<string | null>(null);
  const aiReplyTimerRef = React.useRef<number | null>(null);
  const previewStageRef = React.useRef<HTMLDivElement | null>(null);
  const previewImageRef = React.useRef<HTMLImageElement | null>(null);
  const previewMetricsRef = React.useRef<PreviewMetrics>({
    overflowX: 0,
    overflowY: 0,
    maxOffsetX: 0,
    maxOffsetY: 0,
  });
  const dragStateRef = React.useRef<DragState | null>(null);

  const applyPreviewOffset = React.useCallback(
    (nextX: number, nextY: number, metricsOverride?: PreviewMetrics) => {
      const metrics = metricsOverride ?? previewMetricsRef.current;
      const { maxOffsetX, maxOffsetY } = metrics;
      const clampedX = maxOffsetX ? clamp(nextX, -maxOffsetX, maxOffsetX) : 0;
      const clampedY = maxOffsetY ? clamp(nextY, -maxOffsetY, maxOffsetY) : 0;
      const nextOffset = { x: clampedX, y: clampedY };

      const hasOffsetChanged =
        previewOffsetRef.current.x !== nextOffset.x || previewOffsetRef.current.y !== nextOffset.y;

      previewOffsetRef.current = nextOffset;

      setPreviewOffset((prev) => {
        if (!hasOffsetChanged) {
          return prev;
        }
        return nextOffset;
      });

      const normalizedX = maxOffsetX ? nextOffset.x / maxOffsetX : 0;
      const normalizedY = maxOffsetY ? nextOffset.y / maxOffsetY : 0;

      setSelectedBanner((prev) => {
        if (!prev || prev.kind === "ai") return prev;
        const existingCrop = prev.crop ?? { offsetX: 0, offsetY: 0 };
        if (existingCrop.offsetX === normalizedX && existingCrop.offsetY === normalizedY) {
          return prev;
        }
        return { ...prev, crop: { offsetX: normalizedX, offsetY: normalizedY } };
      });
    },
    [setPreviewOffset, setSelectedBanner],
  );

  const resetPreviewPosition = React.useCallback(() => {
    applyPreviewOffset(0, 0);
  }, [applyPreviewOffset]);

  const updateSelectedBanner = React.useCallback(
    (banner: SelectedBanner | null) => {
      if (dragStateRef.current) {
        dragStateRef.current.cleanup();
      }
      setIsDraggingPreview(false);
      setPreviewCanPan(false);
      previewMetricsRef.current = {
        overflowX: 0,
        overflowY: 0,
        maxOffsetX: 0,
        maxOffsetY: 0,
      };

      const normalizedBanner =
        banner && banner.kind !== "ai"
          ? { ...banner, crop: banner.crop ?? { offsetX: 0, offsetY: 0 } }
          : banner;

      setSelectedBanner(normalizedBanner);
      applyPreviewOffset(0, 0, previewMetricsRef.current);
    },
    [applyPreviewOffset],
  );

  const measurePreview = React.useCallback(() => {
    const container = previewStageRef.current;
    const image = previewImageRef.current;
    if (!container || !image) return;

    const containerRect = container.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();
    if (!containerRect.width || !containerRect.height || !imageRect.width || !imageRect.height) {
      return;
    }

    const overflowX = Math.max(0, imageRect.width - containerRect.width);
    const overflowY = Math.max(0, imageRect.height - containerRect.height);
    const metrics: PreviewMetrics = {
      overflowX,
      overflowY,
      maxOffsetX: overflowX / 2,
      maxOffsetY: overflowY / 2,
    };

    previewMetricsRef.current = metrics;
    setPreviewCanPan(metrics.maxOffsetX > 0 || metrics.maxOffsetY > 0);
    applyPreviewOffset(previewOffsetRef.current.x, previewOffsetRef.current.y, metrics);
  }, [applyPreviewOffset]);

  const closeMemoryPicker = React.useCallback(() => {
    setMemoryPickerOpen((previous) => {
      if (!previous) return previous;
      if (typeof window !== "undefined") {
        window.setTimeout(() => {
          memoryButtonRef.current?.focus();
        }, 0);
      } else {
        memoryButtonRef.current?.focus();
      }
      return false;
    });
  }, []);

  const openMemoryPicker = React.useCallback(() => {
    if (!memoryPickerOpen && !loading && items.length === 0) {
      void refresh();
    }
    setMemoryPickerOpen(true);
  }, [items.length, loading, memoryPickerOpen, refresh]);

  React.useEffect(() => {
    if (!open) return;
    setMessages([
      {
        id: randomId(),
        role: "assistant",
        content: `Hi! I'm Capsule AI. Let's craft a banner for ${normalizedName}. Describe the mood you're aiming for or pick an image to start.`,
      },
    ]);
    setChatBusy(false);
    updateSelectedBanner(null);
    setPrompterSession((value) => value + 1);
    if (uploadObjectUrlRef.current) {
      URL.revokeObjectURL(uploadObjectUrlRef.current);
      uploadObjectUrlRef.current = null;
    }
  }, [normalizedName, open, updateSelectedBanner]);

  React.useEffect(() => {
    if (!open) {
      setMemoryPickerOpen(false);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (memoryPickerOpen) return;
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [memoryPickerOpen, onClose, open]);

  React.useEffect(() => {
    return () => {
      dragStateRef.current?.cleanup();
    };
  }, []);

  React.useEffect(() => {
    if (!open && dragStateRef.current) {
      dragStateRef.current.cleanup();
    }
  }, [open]);

  React.useLayoutEffect(() => {
    if (!open) return;
    measurePreview();
  }, [measurePreview, open, activeImageUrl]);

  React.useEffect(() => {
    if (!open) return;
    const stage = previewStageRef.current;
    if (!stage || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      measurePreview();
    });

    observer.observe(stage);
    return () => observer.disconnect();
  }, [measurePreview, open]);

  React.useEffect(() => {
    if (!open) return;
    const handleResize = () => {
      measurePreview();
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [measurePreview, open]);

  React.useEffect(() => {
    if (!memoryPickerOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMemoryPicker();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeMemoryPicker, memoryPickerOpen]);

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
    updateSelectedBanner({
      kind: "upload",
      name: file.name,
      url: objectUrl,
      crop: { offsetX: 0, offsetY: 0 },
    });
  }, [updateSelectedBanner]);

  const handleMemorySelect = React.useCallback((memory: DisplayMemoryUpload) => {
    const url = memory.fullUrl || memory.displayUrl;
    updateSelectedBanner({
      kind: "memory",
      id: memory.id,
      title: memory.title?.trim() || memory.description?.trim() || null,
      url,
      crop: { offsetX: 0, offsetY: 0 },
    });
  }, [updateSelectedBanner]);

  const handleMemoryPick = React.useCallback(
    (memory: DisplayMemoryUpload) => {
      handleMemorySelect(memory);
      closeMemoryPicker();
    },
    [closeMemoryPicker, handleMemorySelect],
  );

  const handleQuickPick = React.useCallback(() => {
    const firstMemory = processedMemories[0];
    if (firstMemory) {
      handleMemoryPick(firstMemory);
    }
  }, [handleMemoryPick, processedMemories]);

  const handlePrompterAction = React.useCallback(
    (action: PrompterAction) => {
      if (chatBusy) return;

      const firstAttachment = action.attachments?.[0];
      if (firstAttachment?.url) {
        updateSelectedBanner({
          kind: "upload",
          name: firstAttachment.name ?? "Uploaded image",
          url: firstAttachment.url,
          crop: { offsetX: 0, offsetY: 0 },
        });
      }

      const rawText =
        action.kind === "generate"
          ? action.text
          : action.kind === "style" || action.kind === "post_ai" || action.kind === "tool_logo" || action.kind === "tool_poll" || action.kind === "tool_image_edit"
            ? action.prompt
            : action.kind === "post_manual"
              ? action.content
              : "";
      const trimmed = rawText?.trim();
      if (!trimmed) {
        return;
      }

      const userMessage: ChatMessage = { id: randomId(), role: "user", content: trimmed };
      setMessages((prev) => [...prev, userMessage]);
      updateSelectedBanner({ kind: "ai", prompt: trimmed });
      setChatBusy(true);

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
    },
    [chatBusy, normalizedName, updateSelectedBanner],
  );

  const previewDraggable =
    selectedBanner?.kind === "upload" || selectedBanner?.kind === "memory";
  const previewPannable = previewDraggable && previewCanPan;
  const activeImageUrl = previewDraggable ? selectedBanner?.url ?? null : null;

  const handlePreviewPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!previewDraggable) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;

      measurePreview();
      const metrics = previewMetricsRef.current;
      if (!metrics || (metrics.maxOffsetX === 0 && metrics.maxOffsetY === 0)) {
        return;
      }

      if (dragStateRef.current) {
        dragStateRef.current.cleanup();
      }

      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startY = event.clientY;
      const startOffset = { ...previewOffsetRef.current };

      const move = (nativeEvent: PointerEvent) => {
        if (nativeEvent.pointerId !== pointerId) return;
        nativeEvent.preventDefault();
        const deltaX = nativeEvent.clientX - startX;
        const deltaY = nativeEvent.clientY - startY;
        applyPreviewOffset(startOffset.x + deltaX, startOffset.y + deltaY);
      };

      const finish = (nativeEvent: PointerEvent) => {
        if (nativeEvent.pointerId !== pointerId) return;
        cleanup();
      };

      function cleanup() {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        dragStateRef.current = null;
        setIsDraggingPreview(false);
      }

      dragStateRef.current = {
        pointerId,
        cleanup,
      };

      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);

      setIsDraggingPreview(true);
      event.preventDefault();
    },
    [applyPreviewOffset, measurePreview, previewDraggable],
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
        ref={previewImageRef}
        src={selectedBanner.url}
        alt="Banner preview"
        className={styles.previewImage}
        style={{
          transform: `translate3d(-50%, -50%, 0) translate3d(${previewOffset.x}px, ${previewOffset.y}px, 0)`,
        }}
        draggable={false}
        onDragStart={(event) => event.preventDefault()}
        onLoad={measurePreview}
        onError={(event) => {
          (event.currentTarget as HTMLImageElement).style.visibility = "hidden";
        }}
      />
    );
  }, [measurePreview, previewOffset.x, previewOffset.y, selectedBanner]);

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
          <section className={styles.chatColumn}>
            <div ref={chatLogRef} className={styles.chatLog} aria-live="polite">
              {messages.map((message) => renderChatMessage(message))}
              {chatBusy ? (
                <div className={styles.chatTyping} aria-live="polite">
                  Capsule AI is thinking...
                </div>
              ) : null}
            </div>

            {/* Dock: prompter + chips live together and sit at the bottom */}
            <div className={styles.prompterDock}>
              <div className={styles.prompterWrap}>
                <AiPrompterStage
                  key={prompterSession}
                  placeholder="Tell Capsule AI about the vibe, colors, or references you want..."
                  chips={[]}
                  statusMessage={null}
                  onAction={handlePrompterAction}
                />
              </div>

              <div className={styles.intentChips}>
                {PROMPT_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    className={styles.intentChip}
                    onClick={() =>
                      handlePrompterAction({
                        kind: "generate",
                        text: chip,
                        raw: chip,
                      })
                    }
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className={styles.previewColumn}>
            <div className={styles.previewPanel}>
              <div
                ref={previewStageRef}
                className={styles.previewStage}
                data-draggable={previewPannable ? "true" : undefined}
                data-dragging={isDraggingPreview ? "true" : undefined}
                onPointerDown={handlePreviewPointerDown}
              >
                {previewNode}
              </div>
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
                  ref={memoryButtonRef}
                  variant="secondary"
                  size="sm"
                  onClick={openMemoryPicker}
                  leftIcon={<Brain size={16} weight="bold" />}
                  aria-haspopup="dialog"
                  aria-expanded={memoryPickerOpen}
                  aria-controls="memory-picker-dialog"
                >
                  Memory
                </Button>
              </div>
              <input
                ref={fileInputRef}
                className={styles.fileInput}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
              />

            </div>
          </section>

          {memoryPickerOpen ? (
            <div
              className={styles.memoryPickerOverlay}
              role="presentation"
              onClick={closeMemoryPicker}
            >
              <div
                id="memory-picker-dialog"
                className={styles.memoryPickerPanel}
                role="dialog"
                aria-modal="true"
                aria-labelledby="memory-picker-heading"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className={`${styles.closeButton} ${styles.memoryPickerClose}`}
                  onClick={closeMemoryPicker}
                  aria-label="Close memory picker"
                >
                  <X size={18} weight="bold" />
                </button>
                <div className={styles.memorySection}>
                  <div className={styles.memoryHeader}>
                    <div className={styles.memoryTitleGroup}>
                      <h3 id="memory-picker-heading">Memories</h3>
                      <span>Use something you&apos;ve already saved</span>
                    </div>
                    <div className={styles.memoryActions}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleQuickPick}
                        leftIcon={<ImagesSquare size={16} weight="bold" />}
                        disabled={!processedMemories.length}
                      >
                        Quick pick
                      </Button>
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
                  </div>
                  <div className={styles.memoryPickerContent}>
                    {!user ? (
                      <p className={styles.memoryStatus}>Sign in to access your memories.</p>
                    ) : error ? (
                      <p className={styles.memoryStatus}>{error}</p>
                    ) : !processedMemories.length ? (
                      <p className={styles.memoryStatus}>
                        {loading ? "Loading your memories..." : "No memories found yet."}
                      </p>
                    ) : (
                      <div className={styles.memoryGrid}>
                        {processedMemories.map((memory) => {
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
                              onClick={() => handleMemoryPick(memory)}
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
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <footer className={styles.footer}>
          <div className={styles.footerStatus}>
            {selectedBanner
              ? describeSource(selectedBanner)
              : "Upload an image, pick a memory, or describe a new banner below."}
          </div>
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
