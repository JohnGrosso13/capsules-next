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

export type ComposerMode = "post" | "image" | "video" | "poll";

export type PrompterAction =
  | { kind: "post_manual"; content: string; raw: string }
  | { kind: "post_ai"; prompt: string; mode: ComposerMode; raw: string }
  | { kind: "generate"; text: string; raw: string }
  | { kind: "style"; prompt: string; raw: string };

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

  const trimmed = text.trim();
  const baseIntent = manualIntent ?? autoIntent.intent;
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
      : postPlan.mode === "manual"
      ? `${styles.genBtn} ${styles.genBtnPost}`
      : styles.genBtn;

  const buttonDisabled =
    trimmed.length === 0 ||
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

  function handleGenerate() {
    const value = trimmed;
    if (!value) {
      textRef.current?.focus();
      return;
    }

    if (effectiveIntent === "navigate") {
      if (!navTarget) return;
      if (navTarget.kind === "route") {
        router.push(navTarget.path);
      } else {
        setTheme(navTarget.value);
      }
      setText("");
      setManualIntent(null);
      setMenuOpen(false);
      textRef.current?.focus();
      return;
    }

    if (effectiveIntent === "post") {
      if (postPlan.mode === "manual") {
        const content = postPlan.content.trim();
        if (!content) return;
        onAction?.({ kind: "post_manual", content, raw: value });
      } else if (postPlan.mode === "ai") {
        onAction?.({ kind: "post_ai", prompt: value, mode: detectComposerMode(value.toLowerCase()), raw: value });
      } else {
        onAction?.({ kind: "generate", text: value, raw: value });
      }
      setText("");
      setManualIntent(null);
      textRef.current?.focus();
      return;
    }

    if (effectiveIntent === "style") {
      onAction?.({ kind: "style", prompt: value, raw: value });
      setText("");
      setManualIntent(null);
      textRef.current?.focus();
      return;
    }

    onAction?.({ kind: "generate", text: value, raw: value });
    setText("");
    setManualIntent(null);
    textRef.current?.focus();
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
    (buttonBusy ? "Analyzing intent..." : autoIntent.reason || "AI will adjust automatically");

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
          <span className={styles.intentHint}>{hint}</span>
          <div className={styles.intentOverride} ref={menuRef}>
            <button
              type="button"
              className={manualIntent ? `${styles.intentChip} ${styles.intentChipActive}` : styles.intentChip}
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-haspopup="listbox"
              ref={anchorRef}
            >
              Intent: {intentLabel(effectiveIntent)}{manualIntent ? " (override)" : ""}
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
                  aria-selected={manualIntent === null && effectiveIntent === "generate"}
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











