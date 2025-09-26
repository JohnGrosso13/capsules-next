"use client";

import React from "react";
import { useRouter } from "next/navigation";

import {
  detectIntentHeuristically,
  intentLabel,
  normalizeIntent,
  type IntentResolution,
  type PromptIntent,
} from "@/lib/ai/intent";
import { setTheme, type Theme } from "@/lib/theme";

import styles from "./home.module.css";

const defaultChips = [
  "Post an update",
  "Share a photo",
  "Bring feed image",
  "Summarize my feed",
  "Style my capsule",
];

const MAX_ATTACHMENT_SIZE = 8 * 1024 * 1024;

export type ComposerMode = "post" | "image" | "video" | "poll";

export type PrompterAttachment = { id: string; name: string; mimeType: string; size: number; url: string; thumbnailUrl?: string };

export type PrompterAction =
  | { kind: "post_manual"; content: string; raw: string; attachments?: PrompterAttachment[] }
  | { kind: "post_ai"; prompt: string; mode: ComposerMode; raw: string; attachments?: PrompterAttachment[] }
  | { kind: "generate"; text: string; raw: string; attachments?: PrompterAttachment[] }
  | { kind: "style"; prompt: string; raw: string; attachments?: PrompterAttachment[] };

type Props = {
  placeholder?: string;
  chips?: string[];
  statusMessage?: string | null;
  onAction?: (action: PrompterAction) => void;
};

type IntentResponse = {
  intent?: string;
  confidence?: number;
  reason?: string;
  source?: "heuristic" | "ai" | "none";
};

type NavigationTarget =
  | { kind: "route"; path: string; label: string }
  | { kind: "theme"; value: Theme; label: string };

type PostPlan =
  | { mode: "none" }
  | { mode: "manual"; content: string }
  | { mode: "ai"; composeMode: ComposerMode };

type LocalAttachment = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  status: "idle" | "uploading" | "ready" | "error";
  url: string | null;
  thumbUrl?: string | null;
  error?: string;
};

const HEURISTIC_CONFIDENCE_THRESHOLD = 0.6;

const NAV_VERB_RE = /(go|open|navigate|take|bring|show|switch|launch|visit|return|back)/;
const AI_POST_RE = /(make|draft|write|craft|compose|generate|build)\s+(me\s+)?(a\s+)?(social\s+)?post/;
const AI_IMAGE_RE = /(image|photo|picture|graphic|art|poster|thumbnail|banner|illustration)/;
const AI_VIDEO_RE = /(video|clip|reel|short|story|trailer)/;
const AI_POLL_RE = /(poll|survey|vote|questionnaire|choices?)/;

function detectComposerMode(text: string): ComposerMode {
  if (AI_POLL_RE.test(text)) return "poll";
  if (AI_VIDEO_RE.test(text)) return "video";
  if (AI_IMAGE_RE.test(text)) return "image";
  return "post";
}

function resolveNavigationTarget(text: string): NavigationTarget | null {
  const query = text.trim().toLowerCase();
  if (!query) return null;

  if (/(switch|change|set|turn)\s+(to\s+)?(dark)\s+(mode|theme)/.test(query) || /\bdark\s+(mode|theme)\b/.test(query) || /night\s+mode/.test(query)) {
    return { kind: "theme", value: "dark", label: "Dark mode" };
  }
  if (/(switch|change|set|turn)\s+(to\s+)?(light)\s+(mode|theme)/.test(query) || /\blight\s+(mode|theme)\b/.test(query) || /day\s+mode/.test(query)) {
    return { kind: "theme", value: "light", label: "Light mode" };
  }

  const hasNavVerb = NAV_VERB_RE.test(query);
  const routes: Array<{ regex: RegExp; path: string; label: string }> = [
    { regex: /(home(\s*page)?|landing)/, path: "/", label: "Home" },
    { regex: /create(\s*(page|tab))?/, path: "/create", label: "Create" },
    { regex: /capsule(\s*(page|tab))?/, path: "/capsule", label: "Capsule" },
    { regex: /(settings?|preferences?)/, path: "/settings", label: "Settings" },
  ];

  for (const route of routes) {
    if (!route.regex.test(query)) continue;
    if (hasNavVerb || /(page|tab|view|screen)/.test(query)) {
      return { kind: "route", path: route.path, label: route.label };
    }
  }

  return null;
}

function navHint(target: NavigationTarget | null): string | null {
  if (!target) return null;
  if (target.kind === "route") {
    return `Ready to open ${target.label}`;
  }
  return `Ready to switch to ${target.label}`;
}

function resolvePostPlan(text: string): PostPlan {
  const trimmed = text.trim();
  if (!trimmed) return { mode: "none" };
  const lower = trimmed.toLowerCase();

  if (AI_POST_RE.test(lower)) {
    return { mode: "ai", composeMode: detectComposerMode(lower) };
  }

  const manualColon = trimmed.match(/^post\s*[:\-]\s*(.+)$/i);
  if (manualColon && manualColon[1].trim()) {
    return { mode: "manual", content: manualColon[1].trim() };
  }

  const manualSimple = trimmed.match(/^post\s+(?!me\s+a\s+post)(.+)$/i);
  if (manualSimple && manualSimple[1].trim()) {
    return { mode: "manual", content: manualSimple[1].trim() };
  }

  const shorthand = trimmed.match(/^p:\s*(.+)$/i);
  if (shorthand && shorthand[1].trim()) {
    return { mode: "manual", content: shorthand[1].trim() };
  }

  return { mode: "none" };
}

function truncate(text: string, length = 80): string {
  if (text.length <= length) return text;
  return `${text.slice(0, length - 1)}...`;
}

export function AiPrompterStage({
  placeholder = "Ask your Capsule AI to create anything...",
  chips = defaultChips,
  statusMessage = null,
  onAction,
}: Props) {
  const router = useRouter();

  const [text, setText] = React.useState("");
  const [autoIntent, setAutoIntent] = React.useState<IntentResolution>(() => detectIntentHeuristically(""));
  const [manualIntent, setManualIntent] = React.useState<PromptIntent | null>(null);
  const [isResolving, setIsResolving] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const anchorRef = React.useRef<HTMLButtonElement | null>(null);
  const requestRef = React.useRef(0);
  const textRef = React.useRef<HTMLInputElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [attachment, setAttachment] = React.useState<LocalAttachment | null>(null);

  const trimmed = text.trim();
  const readyAttachment = attachment && attachment.status === "ready" && attachment.url ? attachment : null;
  const hasAttachment = Boolean(readyAttachment);
  const attachmentUploading = attachment?.status === "uploading";
  const baseIntent = manualIntent ?? (hasAttachment && trimmed.length === 0 ? "post" : autoIntent.intent);
  const navTarget = React.useMemo(() => resolveNavigationTarget(trimmed), [trimmed]);
  const postPlan = React.useMemo(() => resolvePostPlan(trimmed), [trimmed]);
  const effectiveIntent: PromptIntent = navTarget
    ? "navigate"
    : postPlan.mode !== "none"
    ? "post"
    : baseIntent;

  const buttonBusy = isResolving && manualIntent === null;
  const navigateReady = effectiveIntent === "navigate" && navTarget !== null;

  const buttonLabel = navigateReady
    ? "Go"
    : postPlan.mode === "manual"
    ? "Post"
    : postPlan.mode === "ai"
    ? "Draft"
    : buttonBusy
    ? "Analyzing..."
    : intentLabel(effectiveIntent);

  const buttonClassName =
    navigateReady
      ? `${styles.genBtn} ${styles.genBtnNavigate}`
      : effectiveIntent === "post"
      ? `${styles.genBtn} ${styles.genBtnPost}`
      : effectiveIntent === "style"
      ? `${styles.genBtn} ${styles.genBtnStyle}`
      : styles.genBtn;

  const buttonDisabled =
    attachmentUploading ||
    (!hasAttachment && trimmed.length === 0) ||
    (effectiveIntent === "navigate" && !navTarget) ||
    (postPlan.mode === "manual" && (!postPlan.content || !postPlan.content.trim()));

  React.useEffect(() => {
    if (!menuOpen) return;

    function handleClick(event: MouseEvent) {
      const target = event.target as Node;
      const insideAnchor = anchorRef.current?.contains(target) ?? false;
      const insideMenu = menuRef.current?.contains(target) ?? false;
      if (!insideAnchor && !insideMenu) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [menuOpen]);

  React.useEffect(() => {
    const currentText = trimmed;
    if (!currentText) {
      setAutoIntent(detectIntentHeuristically(""));
      setIsResolving(false);
      return;
    }

    const heuristic = detectIntentHeuristically(currentText);
    setAutoIntent(heuristic);

    if (heuristic.intent !== "generate" && heuristic.confidence >= HEURISTIC_CONFIDENCE_THRESHOLD) {
      setIsResolving(false);
      return;
    }

    const controller = new AbortController();
    const requestId = ++requestRef.current;

    const timeout = setTimeout(() => {
      setIsResolving(true);
      fetch("/api/ai/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: currentText }),
        signal: controller.signal,
      })
        .then((res) => (res.ok ? (res.json() as Promise<IntentResponse>) : null))
        .then((data) => {
          if (!data || requestRef.current !== requestId) return;
          const intent = normalizeIntent(data.intent);
          setAutoIntent({
            intent,
            confidence:
              typeof data.confidence === "number"
                ? Math.max(0, Math.min(1, data.confidence))
                : heuristic.confidence,
            reason: typeof data.reason === "string" && data.reason.length ? data.reason : heuristic.reason,
            source: data.source === "ai" ? "ai" : heuristic.source,
          });
        })
        .catch((error) => {
          if ((error as Error)?.name !== "AbortError") {
            console.error("Intent detection error", error);
          }
        })
        .finally(() => {
          if (requestRef.current === requestId) {
            setIsResolving(false);
          }
        });
    }, 150);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [trimmed]);

  function clearAttachment() {
    setAttachment(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleAttachClick() {
    fileInputRef.current?.click();
  }

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Couldn't read that file."));
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === "string") {
          resolve(result);
        } else {
          reject(new Error("Unsupported file format."));
        }
      };
      reader.readAsDataURL(file);
    });
  }

  function captureVideoThumbnail(file: File, atSeconds = 0.3): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.preload = "metadata";
      video.src = url;
      video.muted = true;
      (video as HTMLVideoElement & { playsInline?: boolean }).playsInline = true;
      const cleanup = () => URL.revokeObjectURL(url);
      const onError = () => {
        cleanup();
        reject(new Error("Couldn't read video"));
      };
      video.onerror = onError;
      video.onloadeddata = async () => {
        try {
          if (!Number.isFinite(atSeconds) || atSeconds < 0) atSeconds = 0;
          video.currentTime = Math.min(atSeconds, (video.duration || atSeconds) - 0.01);
        } catch {
          // ignore seek errors
        }
      };
      video.onseeked = () => {
        try {
          const canvas = document.createElement("canvas");
          const w = video.videoWidth || 640;
          const h = video.videoHeight || 360;
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas not supported");
          ctx.drawImage(video, 0, 0, w, h);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
          cleanup();
          resolve(dataUrl);
        } catch (err) {
          cleanup();
          reject(err instanceof Error ? err : new Error("Thumbnail failed"));
        }
      };
    });
  }

  const handleAttachmentSelect = React.useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (event.target.value) {
      event.target.value = "";
    }
    if (!file) return;

    const id = crypto.randomUUID();
    const mimeType = file.type || "application/octet-stream";

    if (!mimeType.startsWith("image/") && !mimeType.startsWith("video/")) {
      setAttachment({
        id,
        name: file.name,
        size: file.size,
        mimeType,
        status: "error",
        url: null,
        error: "Only image or video attachments are supported right now.",
      });
      return;
    }

    if (file.size > MAX_ATTACHMENT_SIZE) {
      setAttachment({
        id,
        name: file.name,
        size: file.size,
        mimeType,
        status: "error",
        url: null,
        error: "Image is too large (max 8 MB).",
      });
      return;
    }

    setAttachment({
      id,
      name: file.name,
      size: file.size,
      mimeType,
      status: "uploading",
      url: null,
      thumbUrl: null,
    });

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const base64 = dataUrl.split(",").pop() ?? "";
      const response = await fetch("/api/upload_base64", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          content_type: mimeType,
          data_base64: base64,
        }),
      });
      if (!response.ok) {
        const message = await response.text().catch(() => "");
        throw new Error(message || "Upload failed");
      }
      const payload = (await response.json()) as { url?: string };
      let thumbUrl: string | null = null;
      if (mimeType.startsWith("video/")) {
        try {
          const thumbDataUrl = await captureVideoThumbnail(file, 0.3);
          const thumbBase64 = thumbDataUrl.split(",").pop() ?? "";
          const thumbRes = await fetch("/api/upload_base64", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename: `thumb-${file.name.replace(/\.[^.]+$/, '')}.jpg`,
              content_type: "image/jpeg",
              data_base64: thumbBase64,
            }),
          });
          if (thumbRes.ok) {
            const t = (await thumbRes.json()) as { url?: string };
            if (t?.url) thumbUrl = t.url;
          }
        } catch (err) {
          console.warn("thumbnail extract failed", err);
        }
      }
      if (!payload?.url) {
        throw new Error("Upload failed");
      }
      setAttachment((prev) => {
        if (!prev || prev.id !== id) {
          return prev;
        }
        return { ...prev, status: "ready", url: payload.url, thumbUrl: thumbUrl, error: undefined };
      });
    } catch (error) {
      console.error("Attachment upload failed", error);
      const message = error instanceof Error ? error.message : "Upload failed";
      setAttachment((prev) => {
        if (!prev || prev.id !== id) {
          return prev;
        }
        return { ...prev, status: "error", url: null, error: message };
      });
    }
  }, []);

  function handleGenerate() {
    if (attachmentUploading) return;

    const readyAttachments = readyAttachment
      ? [{
          id: readyAttachment.id,
          name: readyAttachment.name,
          mimeType: readyAttachment.mimeType,
          size: readyAttachment.size,
          url: readyAttachment.url!,
          thumbnailUrl: readyAttachment.thumbUrl ?? undefined,
        }]
      : undefined;
    const hasAttachmentPayload = Boolean(readyAttachments && readyAttachments.length);
    const value = trimmed;
    const hasValue = value.length > 0;

    if (!hasValue && !hasAttachmentPayload) {
      textRef.current?.focus();
      return;
    }

    const resetAfterSubmit = () => {
      setText("");
      setManualIntent(null);
      setMenuOpen(false);
      clearAttachment();
      textRef.current?.focus();
    };

    if (effectiveIntent === "navigate") {
      if (!navTarget) return;
      if (navTarget.kind === "route") {
        router.push(navTarget.path);
      } else {
        setTheme(navTarget.value);
      }
      resetAfterSubmit();
      return;
    }

    if (effectiveIntent === "post") {
      if (postPlan.mode === "manual") {
        const content = postPlan.content.trim();
        if (!content && !hasAttachmentPayload) return;
        onAction?.({ kind: "post_manual", content, raw: value, attachments: readyAttachments });
      } else if (postPlan.mode === "ai") {
        onAction?.({
          kind: "post_ai",
          prompt: value,
          mode: detectComposerMode(value.toLowerCase()),
          raw: value,
          attachments: readyAttachments,
        });
      } else if (hasAttachmentPayload) {
        onAction?.({ kind: "post_manual", content: value, raw: value, attachments: readyAttachments });
      } else {
        onAction?.({ kind: "generate", text: value, raw: value, attachments: readyAttachments });
      }
      resetAfterSubmit();
      return;
    }

    if (effectiveIntent === "style") {
      onAction?.({ kind: "style", prompt: value, raw: value, attachments: readyAttachments });
      resetAfterSubmit();
      return;
    }

    onAction?.({ kind: "generate", text: value, raw: value, attachments: readyAttachments });
    resetAfterSubmit();
  }

  function applyManualIntent(intent: PromptIntent | null) {
    setManualIntent(intent);
    setMenuOpen(false);
  }

  const manualNote = manualIntent
    ? manualIntent === "navigate"
      ? "Intent override: Navigate"
      : manualIntent === "post"
      ? "Intent override: Post"
      : manualIntent === "style"
      ? "Intent override: Style"
      : "Manual override active"
    : null;

  const navMessage = navHint(navigateReady ? navTarget : null);
  const postHint =
    postPlan.mode === "manual"
      ? postPlan.content
        ? `Ready to post: "${truncate(postPlan.content, 50)}"`
        : "Add what you'd like to share."
      : postPlan.mode === "ai"
      ? "AI will draft this for you."
      : null;
  const styleHint =
    effectiveIntent === "style"
      ? "AI Styler is ready."
      : null;

  const hint =
    statusMessage ??
    manualNote ??
    navMessage ??
    postHint ??
    styleHint ??
    (attachment?.status === "error" ? attachment.error : null) ??
    (buttonBusy ? "Analyzing intent..." : autoIntent.reason ?? null);

  return (
    <section className={styles.prompterStage} aria-label="AI Prompter">
      <div className={styles.prompter}>
        <div className={styles.promptBar}>
          <input
            className={styles.input}
            placeholder={placeholder}
            ref={textRef}
            id="ai-prompter-input"
            name="ai_prompter"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            className={buttonClassName}
            type="button"
            onClick={handleGenerate}
            disabled={buttonDisabled}
            data-intent={effectiveIntent}
          >
            <span className={styles.genLabel}>{buttonLabel}</span>
          </button>
        </div>

        <div className={styles.intentControls}>
          <div className={styles.attachGroup}>
            <button
              type="button"
              className={styles.attachButton}
              onClick={handleAttachClick}
              disabled={attachmentUploading}
              aria-label="Attach an image"
            >
              <span className={styles.attachIcon} aria-hidden>+</span>
              <span className={styles.attachLabel}>Attach</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className={styles.attachInput}
              onChange={handleAttachmentSelect}
            />
            {attachment ? (
              <span
                className={styles.attachmentChip}
                data-status={attachment.status}
                title={attachment.status === "error" ? attachment.error ?? "Upload failed" : attachment.name}
              >
                <span className={styles.attachmentName}>{attachment.name}</span>
                {attachment.status === "uploading" ? (
                  <span className={styles.attachmentStatus}>Uploading...</span>
                ) : attachment.status === "error" ? (
                  <span className={styles.attachmentStatusError}>{attachment.error ?? "Upload failed"}</span>
                ) : (
                  <span className={styles.attachmentStatus}>Attached</span>
                )}
                <button
                  type="button"
                  className={styles.attachmentRemove}
                  onClick={clearAttachment}
                  aria-label="Remove attachment"
                >
                  x
                </button>
              </span>
            ) : null}
          </div>
          {hint ? <span className={styles.intentHint}>{hint}</span> : null}
          <div className={styles.intentOverride} ref={menuRef}>
            <button
              type="button"
              className={manualIntent ? `${styles.intentChip} ${styles.intentChipActive}` : styles.intentChip}
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-haspopup="listbox"
              ref={anchorRef}
            >
              {manualIntent ? intentLabel(manualIntent) : "Auto"}
              {manualIntent ? " (override)" : ""}
              <span className={styles.intentCaret} aria-hidden>
                v
              </span>
            </button>
            {menuOpen ? (
              <div className={styles.intentMenu} role="listbox">
                <button
                  type="button"
                  onClick={() => applyManualIntent(null)}
                  role="option"
                  aria-selected={manualIntent === null}
                >
                  Auto (AI decide)
                </button>
                <button
                  type="button"
                  onClick={() => applyManualIntent("post")}
                  role="option"
                  aria-selected={manualIntent === "post"}
                >
                  Post
                </button>
                <button
                  type="button"
                  onClick={() => applyManualIntent("navigate")}
                  role="option"
                  aria-selected={manualIntent === "navigate"}
                >
                  Navigate
                </button>
                <button
                  type="button"
                  onClick={() => applyManualIntent("style")}
                  role="option"
                  aria-selected={manualIntent === "style"}
                >
                  Style
                </button>
                <button
                  type="button"
                  onClick={() => applyManualIntent("generate")}
                  role="option"
                  aria-selected={manualIntent === "generate"}
                >
                  Generate
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className={styles.chips}>
          {chips.map((c) => (
            <button key={c} className={styles.chip} type="button" onClick={() => setText(c)}>
              {c}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}











