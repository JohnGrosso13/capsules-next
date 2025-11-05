"use client";

import * as React from "react";
import styles from "../ai-composer.module.css";
import lightboxStyles from "@/components/home-feed.module.css";
import {
  X,
  Sparkle,
  ChatsTeardrop,
  FileText,
  FolderSimple,
  Brain,
  List,
  SidebarSimple,
  Plus,
} from "@phosphor-icons/react/dist/ssr";

import { ComposerLayout } from "./components/ComposerLayout";
import { AttachmentPanel } from "./components/AttachmentPanel";
import { PreviewColumn } from "./components/PreviewColumn";
import { ComposerMemoryPicker, type MemoryPickerTab } from "./components/ComposerMemoryPicker";
import { useComposerFormReducer, type ComposerFormState } from "./hooks/useComposerFormReducer";
import { useComposerLayout } from "./hooks/useComposerLayout";
import { useComposerVoice } from "./hooks/useComposerVoice";
import { useAttachmentViewer, useResponsiveRail } from "./hooks/useComposerPanels";
import { useComposer } from "./ComposerProvider";
import { PromptSurface } from "./components/PromptSurface";
import type {
  ComposerVideoStatus,
  ComposerSaveStatus,
  ComposerSaveRequest,
  ComposerMemorySavePayload,
  ComposerContextSnapshot,
  ComposerContextSnippet,
} from "./ComposerProvider";

import { HomeFeedList } from "@/components/home-feed-list";
import { useAttachmentUpload, type LocalAttachment } from "@/hooks/useAttachmentUpload";
import { formatFeedCount, type HomeFeedPost } from "@/hooks/useHomeFeed";
import { homeFeedStore } from "@/hooks/useHomeFeed/homeFeedStore";
import { formatExactTime, formatTimeAgo } from "@/hooks/useHomeFeed/time";
import { computeDisplayUploads } from "@/components/memory/process-uploads";
import { useMemoryUploads } from "@/components/memory/use-memory-uploads";
import type { DisplayMemoryUpload } from "@/components/memory/uploads-types";
import type { PrompterAttachment } from "@/components/ai-prompter-stage";
import { ensurePollStructure, isComposerDraftReady, type ComposerDraft } from "@/lib/composer/draft";
import type { ComposerSidebarData } from "@/lib/composer/sidebar-types";
import {
  buildImageVariants,
  pickBestDisplayVariant,
  pickBestFullVariant,
  type CloudflareImageVariantSet,
} from "@/lib/cloudflare/images";
import { buildLocalImageVariants, shouldBypassCloudflareImages } from "@/lib/cloudflare/runtime";
import type { ComposerChatMessage, ComposerChatAttachment } from "@/lib/composer/chat-types";
import { extractFileFromDataTransfer } from "@/lib/clipboard/files";
import type {
  SummaryConversationContext,
  SummaryConversationEntry,
  SummaryPresentationOptions,
} from "@/lib/composer/summary-context";
import type { SummaryResult } from "@/types/summary";
import { COMPOSER_SUMMARY_ACTION_EVENT } from "@/lib/events";
import { useCurrentUser } from "@/services/auth/client";
import { SummaryContextPanel } from "./components/SummaryContextPanel";
import { SummaryNarrativeCard } from "./components/SummaryNarrativeCard";

const PANEL_WELCOME =
  "Hey, I'm Capsule AI. Tell me what you're building: posts, polls, visuals, documents, tournaments, anything. I'll help you shape it.";

const MAX_POLL_OPTIONS = 6;

function formatClipDuration(totalSeconds: number | null | undefined): string | null {
  if (typeof totalSeconds !== "number" || !Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return null;
  }
  const rounded = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

type QuickPromptOption = { label: string; prompt: string };

const DEFAULT_QUICK_PROMPTS: QuickPromptOption[] = [
  {
    label: "Launch announcement",
    prompt: "Draft a hype launch announcement with three punchy bullet highlights.",
  },
  {
    label: "Weekly recap",
    prompt: "Summarize our latest wins in a warm, conversational recap post.",
  },
  {
    label: "Event teaser",
    prompt: "Write a teaser for an upcoming event with a strong call to action.",
  },
];

const QUICK_PROMPT_PRESETS: Record<string, QuickPromptOption[]> = {
  default: DEFAULT_QUICK_PROMPTS,
  poll: [
    {
      label: "Engagement poll",
      prompt: "Create a poll asking the community which initiative we should prioritize next.",
    },
    {
      label: "Preference check",
      prompt: "Draft a poll comparing three visual themes for our brand refresh.",
    },
  ],
  image: [
    {
      label: "Logo direction",
      prompt: "Explore a logo direction that feels modern, fluid, and a little rebellious.",
    },
    {
      label: "Moodboard",
      prompt: "Generate a cinematic moodboard for a late-night product drop.",
    },
  ],
  video: [
    {
      label: "Clip storyboard",
      prompt: "Outline a 30-second video storyboard with three scenes and caption ideas.",
    },
    {
      label: "Highlight reel",
      prompt: "Suggest cuts for a highlight reel that spotlights our top community moments.",
    },
  ],
  document: [
    {
      label: "Playbook outline",
      prompt: "Draft a one-page playbook with sections for goal, timeline, and takeaways.",
    },
    {
      label: "Brief template",
      prompt: "Create a creative brief template for designers with clear instructions.",
    },
  ],
  tournament: [
    {
      label: "Bracket kickoff",
      prompt: "Describe a tournament bracket reveal with rounds, rewards, and hype copy.",
    },
    {
      label: "Match highlights",
      prompt: "Summarize key matchups and storylines for our upcoming community tournament.",
    },
  ],
};

function resolveQuickPromptPreset(kind: string): QuickPromptOption[] {
  const preset = QUICK_PROMPT_PRESETS[kind];
  const fallback = QUICK_PROMPT_PRESETS.default;
  if (preset && preset.length > 0) {
    return preset;
  }
  if (fallback && fallback.length > 0) {
    return fallback;
  }
  return DEFAULT_QUICK_PROMPTS;
}

function truncateText(value: string, limit: number): string {
  if (!value) return "";
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function useHomeFeedSnapshot() {
  return React.useSyncExternalStore(
    homeFeedStore.subscribe,
    homeFeedStore.getState,
    homeFeedStore.getState,
  );
}

export type ClarifierPrompt = {
  questionId: string;
  question: string;
  rationale: string | null;
  suggestions: string[];
  styleTraits: string[];
};

type SidebarListItem = {
  id: string;
  title: string;
  subtitle?: string;
  onClick(): void;
  active?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
};

type SidebarSectionProps = {
  title: string;
  description?: string;
  items: SidebarListItem[];
  emptyMessage: string;
  itemIcon?: React.ReactNode;
  thumbClassName?: string;
  actionLabel?: string;
  onAction?: () => void;
  maxVisible?: number;
};

type SidebarTabKey = "recent" | "drafts" | "projects" | "memories";

type SidebarTabOption = {
  key: SidebarTabKey;
  label: string;
  renderIcon(selected: boolean): React.ReactNode;
};

const SIDEBAR_TAB_OPTIONS: SidebarTabOption[] = [
  {
    key: "recent",
    label: "Recent chats",
    renderIcon: (selected) => <ChatsTeardrop size={18} weight={selected ? "fill" : "duotone"} />,
  },
  {
    key: "drafts",
    label: "Saved drafts",
    renderIcon: (selected) => <FileText size={18} weight={selected ? "fill" : "duotone"} />,
  },
  {
    key: "projects",
    label: "Projects",
    renderIcon: (selected) => <FolderSimple size={18} weight={selected ? "fill" : "duotone"} />,
  },
  {
    key: "memories",
    label: "Memories",
    renderIcon: (selected) => <Brain size={18} weight={selected ? "fill" : "duotone"} />,
  },
];

function SidebarSection({
  title,
  description,
  items,
  emptyMessage,
  itemIcon,
  thumbClassName = "",
  actionLabel,
  onAction,
  maxVisible,
}: SidebarSectionProps) {
  const limit =
    typeof maxVisible === "number" && Number.isFinite(maxVisible) && maxVisible > 0
      ? Math.trunc(maxVisible)
      : null;
  const visibleItems = limit ? items.slice(0, limit) : items;

  return (
    <section className={styles.memorySection}>
      <header className={styles.memoryHeader}>
        <div className={styles.memoryHeaderTop}>
          <span className={styles.memoryTitle}>{title}</span>
          {onAction ? (
            <button type="button" className={styles.memoryLinkBtn} onClick={onAction}>
              {actionLabel ?? "Add"}
            </button>
          ) : null}
        </div>
        {description ? <p className={styles.memorySubtitle}>{description}</p> : null}
      </header>
      {visibleItems.length ? (
        <ol className={styles.memoryList}>
          {visibleItems.map((item) => {
            const cardClass = `${styles.memoryCard}${item.active ? ` ${styles.memoryCardActive}` : ""}`;
            const thumbClass = `${styles.memoryThumb}${thumbClassName ? ` ${thumbClassName}` : ""}`;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={cardClass}
                  onClick={item.onClick}
                  disabled={item.disabled}
                  title={`${item.title}${item.subtitle ? ` — ${item.subtitle}` : ""}`}
                  aria-label={`${item.title}${item.subtitle ? ` — ${item.subtitle}` : ""}`}
                >
                  <span className={thumbClass}>{item.icon ?? itemIcon ?? null}</span>
                  <span className={styles.memoryMeta}>
                    <span className={styles.memoryName}>{item.title}</span>
                    {item.subtitle ? (
                      <span className={styles.memoryType}>{item.subtitle}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className={styles.memoryEmpty}>{emptyMessage}</div>
      )}
    </section>
  );
}

type ComposerToolbarProps = {
  activeKey: string;
  onSelectKind: (key: string) => void;
  onClose: () => void;
  disabled: boolean;
  smartContextEnabled: boolean;
  onToggleContext: () => void;
  contextActive: boolean;
  onMenuToggle?: () => void;
  mobileRailOpen?: boolean;
  onPreviewToggle?: () => void;
  previewOpen?: boolean;
  isMobile?: boolean;
};

function ComposerToolbar({
  activeKey: _activeKey,
  onSelectKind: _onSelectKind,
  onClose,
  disabled,
  smartContextEnabled,
  onToggleContext,
  contextActive,
  onMenuToggle,
  mobileRailOpen,
  onPreviewToggle,
  previewOpen,
  isMobile,
}: ComposerToolbarProps) {
  return (
    <>
      <button
        type="button"
        className={styles.closeIcon}
        onClick={onClose}
        disabled={disabled}
        aria-label="Close composer"
      >
        <X size={18} weight="bold" />
      </button>

      <header className={styles.panelToolbar}>
        <div className={styles.toolbarHeading}>
          <h2 className={styles.toolbarTitle}>Composer Studio</h2>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.smartContextToggle}
            onClick={onToggleContext}
            aria-pressed={smartContextEnabled}
            disabled={disabled}
            data-active={smartContextEnabled ? "true" : undefined}
            title={smartContextEnabled ? "Smart context is feeding Capsule AI" : "Enable smart context to ground Capsule AI with your memories"}
          >
            <Sparkle size={18} weight={smartContextEnabled ? "fill" : "duotone"} />
            <span>{smartContextEnabled ? "Context on" : "Context off"}</span>
            {contextActive ? <span className={styles.smartContextPulse} aria-hidden="true" /> : null}
          </button>
          {isMobile && onMenuToggle ? (
            <button
              type="button"
              className={styles.mobileHeaderButton}
              onClick={onMenuToggle}
              aria-expanded={mobileRailOpen}
              aria-controls="composer-mobile-menu"
              data-active={mobileRailOpen ? "true" : undefined}
              disabled={disabled}
            >
              <List size={18} weight="bold" />
              <span>Sections</span>
            </button>
          ) : null}
          {isMobile && onPreviewToggle ? (
            <button
              type="button"
              className={styles.mobileHeaderButton}
              onClick={onPreviewToggle}
              aria-expanded={previewOpen}
              aria-controls="composer-mobile-preview"
              data-active={previewOpen ? "true" : undefined}
              disabled={disabled}
            >
              <SidebarSimple size={18} weight="bold" />
              <span>Preview</span>
            </button>
          ) : null}
        </div>
      </header>
    </>
  );
}

function toHighlightMarkup(html: string | null | undefined): string | null {
  if (!html) return null;
  return html.replace(/<\/?em>/gi, (token) => (token.toLowerCase() === "<em>" ? "<mark>" : "</mark>"));
}

type SmartContextSummaryProps = {
  enabled: boolean;
  snapshot: ComposerContextSnapshot | null;
  snippets: ComposerContextSnippet[];
};

function SmartContextSummary({ enabled, snapshot, snippets }: SmartContextSummaryProps) {
  if (!enabled) {
    return (
      <div className={styles.smartContextBanner} data-enabled="false">
        <p className={styles.smartContextMessage}>
          Smart context is off. Toggle it in the header to ground Capsule AI with your saved memories.
        </p>
      </div>
    );
  }

  if (!snippets.length) {
    return (
      <div className={styles.smartContextBanner} data-enabled="idle">
        <p className={styles.smartContextMessage}>
          Smart context is ready. Capsule AI will automatically pull in your memories when they match this conversation.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.smartContextBanner} data-enabled="true">
      <header className={styles.smartContextHeader}>
        <span className={styles.smartContextTitle}>
          Referencing {snippets.length} memory{snippets.length === 1 ? "" : "ies"}
        </span>
        {snapshot?.query ? (
          <span className={styles.smartContextQuery}>Query: {snapshot.query}</span>
        ) : null}
      </header>
      <ul className={styles.smartContextList}>
        {snippets.map((snippet, index) => {
          const highlightMarkup = toHighlightMarkup(snippet.highlightHtml ?? null);
          const displayText = highlightMarkup ?? snippet.snippet;
          return (
            <li key={`${snippet.id}-${index}`} className={styles.smartContextItem}>
              <div className={styles.smartContextItemHeader}>
                <span className={styles.smartContextMemoryId}>Memory #{index + 1}</span>
                {snippet.title ? (
                  <span className={styles.smartContextMemoryTitle}>{snippet.title}</span>
                ) : null}
                {snippet.source ? (
                  <span className={styles.smartContextMemorySource}>{snippet.source}</span>
                ) : null}
              </div>
              <p
                className={styles.smartContextPreview}
                dangerouslySetInnerHTML={{ __html: displayText }}
              />
              {snippet.tags.length ? (
                <div className={styles.smartContextTags}>
                  {snippet.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className={styles.smartContextTag}>
                      #{tag}
                    </span>
                  ))}
                </div>
              ) : null}
              {snippet.url ? (
                <a
                  href={snippet.url}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.smartContextLink}
                >
                  Open memory
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
type ComposerFooterProps = {
  footerHint: string;
  privacy: ComposerFormState["privacy"];
  onPrivacyChange: (value: ComposerFormState["privacy"]) => void;
  loading: boolean;
  attachmentUploading: boolean;
  onClose: () => void;
  onSave: () => void;
  onPreviewToggle: () => void;
  previewOpen: boolean;
  onPost: () => void;
  canSave: boolean;
  canPost: boolean;
  saving: boolean;
};

function ComposerFooter({
  footerHint,
  privacy,
  onPrivacyChange,
  loading,
  attachmentUploading,
  onClose,
  onSave,
  onPreviewToggle,
  previewOpen,
  onPost,
  canSave,
  canPost,
  saving,
}: ComposerFooterProps) {
  return (
    <footer className={styles.panelFooter}>
      <div className={styles.footerLeft}>
        <p className={styles.footerHint}>{footerHint}</p>
        <label className={styles.privacyGroup}>
          <span className={styles.privacyLabel}>Visibility</span>
          <select
            aria-label="Visibility"
            className={styles.privacySelect}
            value={privacy}
            onChange={(event) => {
              const nextValue = (event.target.value || "public") as ComposerFormState["privacy"];
              onPrivacyChange(nextValue);
            }}
            disabled={loading}
          >
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </label>
      </div>
      <div className={styles.footerActions}>
        <button
          type="button"
          className={styles.cancelAction}
          onClick={onClose}
          disabled={loading || attachmentUploading}
        >
          Cancel
        </button>
        <button
          type="button"
          className={styles.secondaryAction}
          onClick={onSave}
          disabled={!canSave || saving}
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          className={styles.previewToggle}
          onClick={onPreviewToggle}
          aria-pressed={previewOpen}
          aria-controls="composer-preview-pane"
        >
          Preview
        </button>
        <button type="button" className={styles.primaryAction} onClick={onPost} disabled={!canPost}>
          Post
        </button>
      </div>
    </footer>
  );
}

type ComposerViewerProps = {
  open: boolean;
  attachment: LocalAttachment | null;
  attachmentKind: string | null;
  attachmentFullUrl: string | null;
  attachmentDisplayUrl: string | null;
  attachmentPreviewUrl: string | null;
  onClose: () => void;
  onRemoveAttachment: () => void;
  onSelectSuggestion: (prompt: string) => void;
  vibeSuggestions: Array<{ label: string; prompt: string }>;
};

function ComposerViewer({
  open,
  attachment,
  attachmentKind,
  attachmentFullUrl,
  attachmentDisplayUrl,
  attachmentPreviewUrl,
  onClose,
  onRemoveAttachment,
  onSelectSuggestion,
  vibeSuggestions,
}: ComposerViewerProps) {
  if (!open || !attachment || attachment.status !== "ready") {
    return null;
  }

  const isVideo = attachmentKind === "video";

  return (
    <div className={lightboxStyles.lightboxOverlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={lightboxStyles.lightboxContent} onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className={lightboxStyles.lightboxClose}
          aria-label="Close preview"
          onClick={onClose}
        >
          <X size={18} weight="bold" />
        </button>
        <div className={lightboxStyles.lightboxBody}>
          <div className={lightboxStyles.lightboxMedia}>
            {isVideo ? (
              <video className={lightboxStyles.lightboxVideo} src={attachmentFullUrl ?? undefined} controls autoPlay />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className={lightboxStyles.lightboxImage}
                src={attachmentFullUrl ?? attachmentDisplayUrl ?? attachmentPreviewUrl ?? undefined}
                alt={attachment.name}
              />
            )}
          </div>
          <div className={lightboxStyles.lightboxCaption}>{attachment.name}</div>
        </div>
        <div className={styles.viewerActions}>
          {vibeSuggestions.map((suggestion) => (
            <button
              key={`viewer-${suggestion.prompt}`}
              type="button"
              className={styles.viewerActionBtn}
              onClick={() => {
                onSelectSuggestion(suggestion.prompt);
                onClose();
              }}
            >
              {suggestion.label}
            </button>
          ))}
          <button
            type="button"
            className={styles.viewerRemoveBtn}
            onClick={() => {
              onRemoveAttachment();
              onClose();
            }}
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

type MemoryPreset = {
  key: string;
  label: string;
  description: string;
  prompt: string;
};

const DEFAULT_MEMORY_PRESETS: MemoryPreset[] = [
  {
    key: "ai-launch-post",
    label: "AI Generated Launch Post",
    description: "Blueprint",
    prompt: "Write a launch announcement that blends optimism with a daring tone.",
  },
  {
    key: "ai-community-poll",
    label: "Community Pulse Check",
    description: "Blueprint",
    prompt: "Draft a poll that helps us understand what the community wants next.",
  },
  {
    key: "visual-logo",
    label: "Logo Direction",
    description: "Blueprint",
    prompt: "Explore a logo treatment that mixes playful gradients with crisp typography.",
  },
  {
    key: "weekly-recap",
    label: "Weekly Recap",
    description: "Blueprint",
    prompt: "Summarize the week’s highlights with sections for wins, shoutouts, and next moves.",
  },
];

const ASSET_KIND_OPTIONS = [
  { key: "text", label: "Post" },
  { key: "poll", label: "Poll" },
  { key: "image", label: "Visual" },
  { key: "video", label: "Video" },
  { key: "document", label: "Document" },
  { key: "tournament", label: "Tournament" },
];

const KIND_FALLBACK_LABELS: Record<string, string> = {
  text: "Post",
  poll: "Poll",
  image: "Visual",
  video: "Video",
  document: "Document",
  tournament: "Tournament",
};

function normalizeComposerKind(value: string | null | undefined): string {
  const raw = (value ?? "").toLowerCase();
  if (!raw) return "text";
  if (raw === "banner" || raw === "visual" || raw === "logo" || raw === "artwork") return "image";
  if (raw === "reel" || raw === "story" || raw === "clip") return "video";
  if (raw === "doc" || raw === "deck" || raw === "brief") return "document";
  if (raw === "tourney" || raw === "bracket") return "tournament";
  if (raw === "article" || raw === "summary") return "text";
  return raw;
}

function resolveKindLabel(kind: string): string {
  const fallback = KIND_FALLBACK_LABELS[kind];
  if (fallback) return fallback;
  if (!kind) return "Post";
  const first = kind.charAt(0);
  const rest = kind.slice(1);
  return `${first.toUpperCase()}${rest}`;
}

function getPromptPlaceholder(kind: string): string {
  switch (kind) {
    case "poll":
      return "Ask Capsule to craft poll questions or add your own...";
    case "image":
      return "Describe the vibe or upload a visual you want to evolve...";
    case "video":
      return "Explain the clip, storyboard, or edit you’re dreaming up...";
    case "document":
      return "Outline the doc, brief, or playbook you want Capsule AI to draft...";
    case "tournament":
      return "Sketch out the tournament structure or let Capsule AI design the bracket...";
    default:
      return "Describe what you need Capsule AI to create...";
  }
}

function getFooterHint(kind: string): string {
  switch (kind) {
    case "poll":
      return "Give Capsule AI a prompt or tweak the poll structure below.";
    case "image":
      return "Upload a visual, pull from your library, or describe the feel you’re after.";
    case "video":
      return "Drop in reference footage or narrate the scenes you need.";
    case "document":
      return "Share the sections you need, or ask Capsule AI to outline it for you.";
    case "tournament":
      return "Tell Capsule AI how the bracket should flow and it’ll draft it out.";
    default:
      return "Chat with Capsule AI, reference a blueprint, or upload supporting visuals.";
  }
}

type MemoryItem = {
  key: string;
  label: string;
  description: string;
  prompt: string | null;
  kind: "choice" | "preset";
};

type SaveDialogTarget =
  | { type: "draft" }
  | { type: "attachment"; attachment: ComposerChatAttachment };

export type ComposerChoice = { key: string; label: string };
function pickFirstMeaningful(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return "";
}

function formatTitleFromText(input: string, fallback = "Capsule creation"): string {
  const trimmed = input.trim();
  if (!trimmed.length) return fallback;
  const preview = trimmed.split(/\s+/).slice(0, 8).join(" ");
  return preview.charAt(0).toUpperCase() + preview.slice(1);
}

function formatDescriptionFromText(
  input: string,
  fallback = "Saved from Capsule Composer.",
): string {
  const trimmed = input.trim();
  if (!trimmed.length) return fallback;
  return trimmed.length > 400 ? `${trimmed.slice(0, 397)}...` : trimmed;
}


type ComposerFormProps = {
  loading: boolean;
  draft: ComposerDraft | null;
  prompt: string;
  message?: string | null | undefined;
  history?: ComposerChatMessage[] | null | undefined;
  choices?: ComposerChoice[] | null | undefined;
  clarifier?: ClarifierPrompt | null | undefined;
  summaryContext?: SummaryConversationContext | null;
  summaryResult?: SummaryResult | null;
  summaryOptions?: SummaryPresentationOptions | null;
  summaryMessageId?: string | null;
  sidebar: ComposerSidebarData;
  videoStatus: ComposerVideoStatus;
  saveStatus: ComposerSaveStatus;
  smartContextEnabled: boolean;
  contextSnapshot?: ComposerContextSnapshot | null;
  onSmartContextChange(enabled: boolean): void;
  onChange(draft: ComposerDraft): void;
  onClose(): void;
  onPost(): void;
  onSave?(projectId?: string | null): void;
  onSelectRecentChat(id: string): void;
  onSelectDraft(id: string): void;
  onCreateProject(name: string): void;
  onSelectProject(id: string | null): void;
  onForceChoice?(key: string): void;
  onPrompt?(prompt: string, attachments?: PrompterAttachment[] | null): Promise<void> | void;
  onClarifierRespond?(answer: string): void;
  onRetryVideo(): void;
  onSaveCreation(request: ComposerSaveRequest): Promise<string | null> | Promise<void> | void;
};

export function ComposerForm({
  loading,
  draft,
  prompt,
  message,
  history: historyInput,
  choices: _choices,
  clarifier: clarifierInput,
  summaryContext: summaryContextInput,
  summaryResult: summaryResultInput,
  summaryOptions: summaryOptionsInput,
  summaryMessageId: summaryMessageIdInput,
  sidebar,
  videoStatus,
  saveStatus,
  smartContextEnabled,
  contextSnapshot: contextSnapshotInput,
  onSmartContextChange,
  onChange,
  onClose,
  onPost,
  onSave,
  onSelectRecentChat,
  onSelectDraft,
  onCreateProject,
  onSelectProject,
  onPrompt,
  onForceChoice,
  onClarifierRespond,
  onRetryVideo,
  onSaveCreation,
}: ComposerFormProps) {
  const workingDraft = React.useMemo<ComposerDraft>(
    () =>
      draft ?? {
        kind: "text",
        content: "",
        title: null,
        mediaUrl: null,
        mediaPrompt: null,
        poll: null,
        suggestions: [],
      },
    [draft],
  );

  const conversationHistory = React.useMemo<ComposerChatMessage[]>(() => {
    if (!historyInput) return [];
    return Array.isArray(historyInput) ? historyInput : [];
  }, [historyInput]);
  const summaryContext = summaryContextInput ?? null;
  const summaryEntries = React.useMemo(
    () => summaryContext?.entries ?? [],
    [summaryContext],
  );
  const summaryResult = summaryResultInput ?? null;
  const summaryOptions = summaryOptionsInput ?? null;
  const summaryMessageId = summaryMessageIdInput ?? null;
  const contextSnapshot = contextSnapshotInput ?? null;
  const contextSnippets = React.useMemo(
    () => (contextSnapshot?.snippets ?? []).slice(0, 5),
    [contextSnapshot],
  );
  const hasContextSnippets = contextSnippets.length > 0;
  const renderedHistory = React.useMemo(() => {
    if (!summaryResult || !summaryMessageId) return conversationHistory;
    return conversationHistory.filter((entry) => entry.id !== summaryMessageId);
  }, [conversationHistory, summaryMessageId, summaryResult]);
  const [summaryPreviewEntry, setSummaryPreviewEntry] = React.useState<SummaryConversationEntry | null>(null);
  const feedState = useHomeFeedSnapshot();
  const { user: currentUser } = useCurrentUser();
  const canRemember = Boolean(currentUser);
  const summaryPreviewPost = React.useMemo<HomeFeedPost | null>(() => {
    if (!summaryPreviewEntry?.postId) return null;
    const target = summaryPreviewEntry.postId.trim();
    if (!target.length) return null;
    for (const post of feedState.posts) {
      if (post.id === target) return post;
      const dbId =
        typeof post.dbId === "string" && post.dbId.trim().length
          ? post.dbId.trim()
          : null;
      if (dbId === target) return post;
    }
    return null;
  }, [feedState.posts, summaryPreviewEntry?.postId]);
  const previewPosts = React.useMemo(
    () => (summaryPreviewPost ? [summaryPreviewPost] : []),
    [summaryPreviewPost],
  );
  const previewHasFetched = feedState.hasFetched || Boolean(summaryPreviewPost);
  const { likePending, memoryPending, activeFriendTarget, friendActionPending, isRefreshing } = feedState;

  const handlePreviewToggleLike = React.useCallback((postId: string) => {
    void homeFeedStore.actions.toggleLike(postId);
  }, []);

  const handlePreviewToggleMemory = React.useCallback(
    (post: HomeFeedPost, desired: boolean) =>
      homeFeedStore.actions.toggleMemory(post.id, { desired, canRemember }),
    [canRemember],
  );

  const handlePreviewFriendRequest = React.useCallback(
    (post: HomeFeedPost, identifier: string) =>
      homeFeedStore.actions.requestFriend(post.id, identifier),
    [],
  );

  const handlePreviewFriendRemove = React.useCallback(
    (post: HomeFeedPost, identifier: string) =>
      homeFeedStore.actions.removeFriend(post.id, identifier),
    [],
  );

  const handlePreviewToggleFriendTarget = React.useCallback((identifier: string | null) => {
    homeFeedStore.actions.setActiveFriendTarget(identifier);
  }, []);

  const handlePreviewDeletePost = React.useCallback((postId: string) => {
    void homeFeedStore.actions.deletePost(postId);
  }, []);

  const clarifier = React.useMemo<ClarifierPrompt | null>(() => {
    if (!clarifierInput) return null;
    return {
      questionId: clarifierInput.questionId,
      question: clarifierInput.question,
      rationale: clarifierInput.rationale,
      suggestions: clarifierInput.suggestions ?? [],
      styleTraits: clarifierInput.styleTraits ?? [],
    };
  }, [clarifierInput]);

  const pollStructure = React.useMemo(() => ensurePollStructure(workingDraft), [workingDraft]);

  const updateDraft = React.useCallback(
    (partial: Partial<ComposerDraft>) => {
      onChange({ ...workingDraft, ...partial });
    },
    [onChange, workingDraft],
  );

  const pollQuestionRef = React.useRef<HTMLTextAreaElement | null>(null);
  const pollOptionRefs = React.useRef<Record<number, HTMLInputElement | null>>({});
  const [pendingPollFocusIndex, setPendingPollFocusIndex] = React.useState<number | null>(null);

  const handlePollQuestionInput = React.useCallback(
    (value: string) => {
      updateDraft({
        poll: {
          question: value,
          options: [...pollStructure.options],
        },
      });
    },
    [pollStructure.options, updateDraft],
  );

  const handlePollOptionInput = React.useCallback(
    (index: number, value: string) => {
      const nextOptions = pollStructure.options.map((option, idx) =>
        idx === index ? value : option,
      );
      updateDraft({
        poll: {
          question: pollStructure.question,
          options: nextOptions,
        },
      });
    },
    [pollStructure.options, pollStructure.question, updateDraft],
  );

  const handleAddPollOption = React.useCallback(
    (afterIndex?: number) => {
      if (pollStructure.options.length >= MAX_POLL_OPTIONS) return;
      const nextOptions = [...pollStructure.options];
      const insertAt =
        typeof afterIndex === "number" && afterIndex >= -1 && afterIndex < nextOptions.length
          ? afterIndex + 1
          : nextOptions.length;
      nextOptions.splice(insertAt, 0, "");
      updateDraft({
        poll: {
          question: pollStructure.question,
          options: nextOptions,
        },
      });
      setPendingPollFocusIndex(insertAt);
    },
    [pollStructure.options, pollStructure.question, setPendingPollFocusIndex, updateDraft],
  );

  const handleRemovePollOption = React.useCallback(
    (index: number) => {
      if (index < 0 || index >= pollStructure.options.length) return;
      if (pollStructure.options.length <= 2) {
        const nextOptions = pollStructure.options.map((option, idx) =>
          idx === index ? "" : option,
        );
        updateDraft({
          poll: {
            question: pollStructure.question,
            options: nextOptions,
          },
        });
        setPendingPollFocusIndex(index);
        return;
      }
      const nextOptions = pollStructure.options.filter((_, idx) => idx !== index);
      if (nextOptions.length < 2) {
        nextOptions.push("");
      }
      updateDraft({
        poll: {
          question: pollStructure.question,
          options: nextOptions,
        },
      });
      setPendingPollFocusIndex(Math.min(index, nextOptions.length - 1));
    },
    [pollStructure.options, pollStructure.question, setPendingPollFocusIndex, updateDraft],
  );

  const handlePollBodyInput = React.useCallback(
    (value: string) => {
      updateDraft({ content: value });
    },
    [updateDraft],
  );

  const { activeCapsuleId } = useComposer();
  const { state, actions } = useComposerFormReducer();
  const { privacy, mobileRailOpen, previewOpen, layout, viewerOpen, voice: voiceState } = state;

  const columnsRef = React.useRef<HTMLDivElement | null>(null);
  const mainRef = React.useRef<HTMLDivElement | null>(null);
  const promptInputRef = React.useRef<HTMLInputElement | null>(null);
  const [promptValue, setPromptValue] = React.useState<string>(() =>
    conversationHistory.length > 0 ? "" : prompt ?? "",
  );
  const [recentModalOpen, setRecentModalOpen] = React.useState(false);
  const [activeSidebarTab, setActiveSidebarTab] = React.useState<SidebarTabKey>("recent");
  const [isMobileLayout, setIsMobileLayout] = React.useState(false);
  const lastSubmittedPromptRef = React.useRef<string | null>(null);
  const previousHistoryCountRef = React.useRef(conversationHistory.length);
  const [summaryPanelOpen, setSummaryPanelOpen] = React.useState(false);
  const summarySignatureRef = React.useRef<string | null>(null);
  const mobileMenuCloseRef = React.useRef<HTMLButtonElement | null>(null);
  const mobilePreviewCloseRef = React.useRef<HTMLButtonElement | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = React.useState(false);
  const [saveDialogTarget, setSaveDialogTarget] = React.useState<SaveDialogTarget | null>(null);
  const [saveTitle, setSaveTitle] = React.useState("");
  const [saveDescription, setSaveDescription] = React.useState("");
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const {
    fileInputRef,
    attachment,
    readyAttachment,
    uploading: attachmentUploading,
    clearAttachment,
    handleAttachClick,
    handleAttachmentSelect,
    handleAttachmentFile,
    attachRemoteAttachment,
  } = useAttachmentUpload(undefined, {
    metadata: () => (activeCapsuleId ? { capsule_id: activeCapsuleId } : null),
  });

  React.useEffect(() => {
    const normalized = prompt ?? "";
    const historyCount = conversationHistory.length;
    const previousCount = previousHistoryCountRef.current;

    if (historyCount > 0) {
      if (previousCount === 0) {
        setPromptValue(() => "");
      }
      lastSubmittedPromptRef.current = null;
    } else if (lastSubmittedPromptRef.current && normalized === lastSubmittedPromptRef.current) {
      lastSubmittedPromptRef.current = null;
    } else {
      setPromptValue(normalized);
    }

    previousHistoryCountRef.current = historyCount;
  }, [conversationHistory.length, prompt]);

  React.useEffect(() => {
    const signature = summaryEntries.map((entry) => entry.id).join("|");
    if (!summaryEntries.length) {
      summarySignatureRef.current = null;
      setSummaryPanelOpen(false);
      setSummaryPreviewEntry(null);
      return;
    }
    if (summarySignatureRef.current !== signature) {
      summarySignatureRef.current = signature;
      setSummaryPanelOpen(false);
      setSummaryPreviewEntry(null);
    }
  }, [summaryEntries]);

  React.useEffect(() => {
    if (!saveDialogOpen) return;
    if (saveStatus.state === "succeeded") {
      setSaveDialogOpen(false);
      setSaveDialogTarget(null);
      setSaveTitle("");
      setSaveDescription("");
      setSaveError(null);
    } else if (saveStatus.state === "failed" && saveStatus.message) {
      setSaveError(saveStatus.message);
    }
  }, [saveDialogOpen, saveStatus]);

  React.useEffect(() => {
    if (pendingPollFocusIndex === null) return;
    if (pendingPollFocusIndex === -1) {
      const questionElement = pollQuestionRef.current;
      if (questionElement) {
        questionElement.focus();
        const length = questionElement.value.length;
        try {
          questionElement.setSelectionRange(length, length);
        } catch {
          // Ignore selection errors on browsers that do not support setSelectionRange on textarea.
        }
        setPendingPollFocusIndex(null);
      }
      return;
    }
    const optionElement = pollOptionRefs.current[pendingPollFocusIndex];
    if (optionElement) {
      optionElement.focus();
      optionElement.select();
      setPendingPollFocusIndex(null);
    }
  }, [pendingPollFocusIndex, pollStructure.options.length]);

  React.useEffect(() => {
    if (activeSidebarTab !== "recent" && recentModalOpen) {
      setRecentModalOpen(false);
    }
  }, [activeSidebarTab, recentModalOpen]);
  const handlePromptPaste = React.useCallback(
    (event: React.ClipboardEvent<HTMLInputElement>) => {
      const file = extractFileFromDataTransfer(event.clipboardData);
      if (!file) return;
      event.preventDefault();
      void handleAttachmentFile(file);
    },
    [handleAttachmentFile],
  );
  const [memoryPickerOpen, setMemoryPickerOpen] = React.useState(false);
  const [memoryPickerTab, setMemoryPickerTab] = React.useState<MemoryPickerTab>("uploads");
  const memoryUploads = useMemoryUploads("upload");
  const memoryAssets = useMemoryUploads(null);
  const {
    items: uploadItems,
    loading: uploadsLoading,
    error: uploadsError,
    refresh: refreshUploads,
  } = memoryUploads;
  const {
    items: assetItems,
    loading: assetsLoading,
    error: assetsError,
    refresh: refreshAssets,
  } = memoryAssets;

  const openViewer = React.useCallback(() => actions.viewer.open(), [actions]);
  const closeViewer = React.useCallback(() => actions.viewer.close(), [actions]);

  const cloudflareBypass = React.useMemo(shouldBypassCloudflareImages, []);
  const cloudflareEnabled = React.useMemo(() => !cloudflareBypass, [cloudflareBypass]);
  const memoryOrigin = React.useMemo(
    () => (typeof window !== "undefined" ? window.location.origin : null),
    [],
  );
  const uploadMemories = React.useMemo(
    () => computeDisplayUploads(uploadItems, { origin: memoryOrigin, cloudflareEnabled }),
    [cloudflareEnabled, memoryOrigin, uploadItems],
  );
  const assetMemories = React.useMemo(
    () =>
      computeDisplayUploads(
        assetItems.filter((item) => (item.kind ?? "").toLowerCase() !== "upload"),
        { origin: memoryOrigin, cloudflareEnabled },
      ),
    [assetItems, cloudflareEnabled, memoryOrigin],
  );

  useComposerLayout({ layout, layoutActions: actions.layout, mainRef });

  const voiceControls = useComposerVoice({
    voiceState,
    voiceActions: actions.voice,
    promptValue,
    setPromptValue,
    promptInputRef,
    loading,
    attachmentUploading,
  });

  useAttachmentViewer({ open: viewerOpen, onClose: closeViewer });
  const closeMobileRail = React.useCallback(() => actions.setMobileRailOpen(false), [actions]);
  useResponsiveRail({ open: mobileRailOpen, onClose: closeMobileRail });

  React.useEffect(() => {
    if (!mobileRailOpen || !isMobileLayout) return;
    const closeButton = mobileMenuCloseRef.current;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButton?.focus();
    return () => {
      previouslyFocused?.focus?.();
    };
  }, [isMobileLayout, mobileRailOpen]);

  React.useEffect(() => {
    if (!mobileRailOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMobileRail();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeMobileRail, mobileRailOpen]);

  React.useEffect(() => {
    if (!memoryPickerOpen) return;
    void refreshUploads();
    void refreshAssets();
  }, [memoryPickerOpen, refreshAssets, refreshUploads]);

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const media = window.matchMedia("(max-width: 900px)");
    const apply = (matches: boolean) => {
      setIsMobileLayout(matches);
      actions.setPreviewOpen(matches ? false : true);
    };
    apply(media.matches);
    const handleChange = (event: MediaQueryListEvent) => apply(event.matches);
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handleChange);
      return () => media.removeEventListener("change", handleChange);
    }
    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, [actions]);

  React.useEffect(() => {
    if (!isMobileLayout || !previewOpen) return;
    const closeButton = mobilePreviewCloseRef.current;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButton?.focus();
    return () => {
      previouslyFocused?.focus?.();
    };
  }, [isMobileLayout, previewOpen]);

  React.useEffect(() => {
    if (!isMobileLayout || !previewOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        actions.setPreviewOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [actions, isMobileLayout, previewOpen]);

  const displayAttachment = React.useMemo<LocalAttachment | null>(() => {
    if (attachment) return attachment;
    if (workingDraft.mediaUrl) {
      const inferredKind = (workingDraft.kind ?? "").toLowerCase();
      let inferredMime = "application/octet-stream";
      if (inferredKind.startsWith("video")) inferredMime = "video/*";
      else if (inferredKind.startsWith("image")) inferredMime = "image/*";
      else if (inferredKind.startsWith("audio")) inferredMime = "audio/*";
      else if (inferredKind.startsWith("text")) inferredMime = "text/plain";
      else if (inferredKind.startsWith("document")) inferredMime = "application/octet-stream";
      const derivedName =
        workingDraft.mediaPrompt?.trim() ||
        workingDraft.title?.trim() ||
        workingDraft.mediaUrl.split("/").pop() ||
        "Attached media";
      return {
        id: "draft-media",
        name: derivedName,
        size: 0,
        mimeType: inferredMime,
        status: "ready",
        url: workingDraft.mediaUrl ?? workingDraft.mediaPlaybackUrl ?? null,
        progress: 1,
        thumbUrl: workingDraft.mediaThumbnailUrl ?? null,
        role: "reference",
        source: "ai",
      };
    }
    return null;
  }, [
    attachment,
    workingDraft.kind,
    workingDraft.mediaPrompt,
    workingDraft.mediaUrl,
    workingDraft.mediaPlaybackUrl,
    workingDraft.mediaThumbnailUrl,
    workingDraft.title,
  ]);

  const attachmentStatusLabel = React.useMemo(() => {
    if (!displayAttachment) return null;
    if (displayAttachment.status === "uploading") {
      if (displayAttachment.phase === "finalizing") {
        return "Finishing upload...";
      }
      const pct = Math.round((displayAttachment.progress ?? 0) * 100);
      return pct > 0 ? `Uploading ${pct}%` : "Uploading...";
    }
    if (displayAttachment.status === "error") {
      return displayAttachment.error ?? "Upload failed";
    }
    return "Attachment ready";
  }, [displayAttachment]);

  const attachmentPreviewUrl = React.useMemo(() => {
    if (!displayAttachment) return null;
    if (displayAttachment.thumbUrl) return displayAttachment.thumbUrl;
    if (displayAttachment.url && displayAttachment.mimeType.startsWith("image/")) {
      return displayAttachment.url;
    }
    return null;
  }, [displayAttachment]);

  const hasAttachment = Boolean(displayAttachment);
  const attachmentMime = displayAttachment?.mimeType ?? "";
  const attachmentUrl = displayAttachment?.url ?? null;
  const attachmentThumb = displayAttachment?.thumbUrl ?? attachmentPreviewUrl ?? null;
  const attachmentProgress = displayAttachment?.progress ?? 0;
  const attachmentKind = React.useMemo(
    () => (attachmentMime.startsWith("video/") ? "video" : attachmentMime ? "image" : null),
    [attachmentMime],
  );
  const attachmentProgressPct = React.useMemo(
    () => Math.round((attachmentProgress ?? 0) * 100),
    [attachmentProgress],
  );

  const attachmentVariants = React.useMemo<CloudflareImageVariantSet | null>(() => {
    if (!hasAttachment || attachmentKind !== "image" || !attachmentUrl) return null;
    const origin = typeof window !== "undefined" ? window.location.origin : null;
    if (cloudflareBypass) {
      return buildLocalImageVariants(attachmentUrl, attachmentThumb, origin);
    }
    return buildImageVariants(attachmentUrl, {
      thumbnailUrl: attachmentThumb,
      origin,
    });
  }, [attachmentKind, attachmentThumb, attachmentUrl, cloudflareBypass, hasAttachment]);

  const attachmentDisplayUrl = React.useMemo(() => {
    if (!hasAttachment) return null;
    if (attachmentKind === "video") {
      return attachmentUrl;
    }
    const variantUrl = pickBestDisplayVariant(attachmentVariants);
    return variantUrl ?? attachmentPreviewUrl ?? attachmentUrl;
  }, [attachmentKind, attachmentPreviewUrl, attachmentUrl, attachmentVariants, hasAttachment]);

  const attachmentFullUrl = React.useMemo(() => {
    if (!hasAttachment) return null;
    if (attachmentKind === "video") {
      return attachmentUrl;
    }
    const variantUrl = pickBestFullVariant(attachmentVariants);
    return variantUrl ?? attachmentUrl;
  }, [attachmentKind, attachmentUrl, attachmentVariants, hasAttachment]);

  const activeKind = React.useMemo(() => {
    const normalized = normalizeComposerKind(workingDraft.kind);
    if ((normalized === "text" || !normalized) && attachmentKind) {
      return attachmentKind;
    }
    return normalized;
  }, [attachmentKind, workingDraft.kind]);

  const toggleActiveKey = React.useMemo(
    () => (ASSET_KIND_OPTIONS.some((option) => option.key === activeKind) ? activeKind : "text"),
    [activeKind],
  );

  const promptPlaceholder = React.useMemo(() => getPromptPlaceholder(activeKind), [activeKind]);
  const currentPromptPlaceholder = clarifier
    ? "Answer with a quick description or pick a suggestion..."
    : promptPlaceholder;
  const footerHint = React.useMemo(() => getFooterHint(activeKind), [activeKind]);
  const activeKindLabel = React.useMemo(() => resolveKindLabel(activeKind), [activeKind]);

  const vibeSuggestions = React.useMemo(() => {
    if (!displayAttachment || displayAttachment.status !== "ready" || !displayAttachment.url) {
      return [] as Array<{ label: string; prompt: string }>;
    }
    const isVideo = displayAttachment.mimeType.startsWith("video/");
    if (isVideo) {
      return [
        {
          label: "Summarize this clip",
          prompt: "Summarize this video and call out the key beats.",
        },
        { label: "Suggest edits", prompt: "Suggest ways we could edit or enhance this video." },
        {
          label: "Remove distractions",
          prompt: "Remove background distractions and keep the focus on the key people in this clip.",
        },
        {
          label: "Tighten the cut",
          prompt: "Trim this video to the most impactful 20 seconds and smooth the transitions.",
        },
        { label: "Prep a post", prompt: "Draft a social post that spotlights this video." },
      ];
    }
    return [
      { label: "Describe this image", prompt: "Describe this image in vivid detail." },
      {
        label: "Create a post",
        prompt: "Draft a social post that uses this image as the hero visual.",
      },
      { label: "Edit ideas", prompt: "Suggest edits or variations for this image." },
    ];
  }, [displayAttachment]);

  const handleSuggestionSelect = React.useCallback((nextPrompt: string) => {
    setPromptValue(nextPrompt);
    window.requestAnimationFrame(() => {
      promptInputRef.current?.focus();
    });
  }, []);

  const handleSummaryAsk = React.useCallback(
    (entry: SummaryConversationEntry) => {
      const snippet = truncateText(entry.summary ?? "", 220);
      const parts: string[] = [
        entry.author ? `Tell me more about ${entry.author}'s update.` : "Tell me more about this update.",
      ];
      if (snippet) {
        parts.push(`Context: ${snippet}`);
      }
      handleSuggestionSelect(parts.join(" "));
      setSummaryPreviewEntry(entry);
    },
    [handleSuggestionSelect],
  );

  const handleSummaryView = React.useCallback((entry: SummaryConversationEntry) => {
    setSummaryPreviewEntry(entry);
    if (typeof window === "undefined") return;
    if (!entry.postId) return;
    window.dispatchEvent(
      new CustomEvent(COMPOSER_SUMMARY_ACTION_EVENT, {
        detail: { action: "view", postId: entry.postId },
      }),
    );
  }, []);

  const handleSummaryComment = React.useCallback(
    (entry: SummaryConversationEntry) => {
      const snippet = truncateText(entry.summary ?? "", 220);
      const promptSegments: string[] = [
        entry.author
          ? `Draft a short, friendly comment I can post on ${entry.author}'s update.`
          : "Draft a short, friendly comment I can post on this update.",
      ];
      if (snippet) {
        promptSegments.push(`Use this context: ${snippet}`);
      }
      handleSuggestionSelect(promptSegments.join(" "));
      setSummaryPreviewEntry(entry);
      if (typeof window !== "undefined" && entry.postId) {
        window.dispatchEvent(
          new CustomEvent(COMPOSER_SUMMARY_ACTION_EVENT, {
            detail: { action: "comment", postId: entry.postId },
          }),
        );
      }
    },
    [handleSuggestionSelect],
  );

  const baseQuickPromptOptions = React.useMemo(
    () => resolveQuickPromptPreset(activeKind),
    [activeKind],
  );

  const summaryQuickPromptOptions = React.useMemo<QuickPromptOption[]>(() => {
    if (!summaryEntries.length) return [];
    return summaryEntries.slice(0, 3).map((entry, index) => {
      const snippet = truncateText(entry.summary ?? "", 180);
      const promptSegments: string[] = [
        entry.author ? `Tell me more about ${entry.author}'s update.` : `Tell me more about this update.`,
      ];
      if (snippet) {
        promptSegments.push(`What else should I know about it? Context: ${snippet}`);
      }
      return {
        label: entry.author ? `Ask about ${entry.author}` : `Ask about update ${index + 1}`,
        prompt: promptSegments.join(" "),
      };
    });
  }, [summaryEntries]);

  const quickPromptOptions = React.useMemo<QuickPromptOption[]>(() => {
    if (vibeSuggestions.length) {
      return vibeSuggestions;
    }
    if (summaryQuickPromptOptions.length) {
      return [...summaryQuickPromptOptions, ...baseQuickPromptOptions];
    }
    return baseQuickPromptOptions;
  }, [baseQuickPromptOptions, summaryQuickPromptOptions, vibeSuggestions]);

  const memoryItems = React.useMemo<MemoryItem[]>(() => {
    if (_choices?.length) {
      return _choices.map((choice) => ({
        key: choice.key,
        label: choice.label,
        description: "Blueprint",
        prompt: null,
        kind: "choice" as const,
      }));
    }
    return DEFAULT_MEMORY_PRESETS.map((preset) => ({
      key: preset.key,
      label: preset.label,
      description: preset.description,
      prompt: preset.prompt,
      kind: "preset" as const,
    }));
  }, [_choices]);


  const handleMemorySelect = React.useCallback(
    (item: MemoryItem) => {
      if (item.kind === "choice") {
        if (onForceChoice) {
          onForceChoice(item.key);
        }
      } else if (item.prompt) {
        handleSuggestionSelect(item.prompt);
      }
      closeMobileRail();
    },
    [closeMobileRail, handleSuggestionSelect, onForceChoice],
  );

  const handleBlueprintShortcut = React.useCallback(() => {
    if (!memoryItems.length) return;
    const firstMemory = memoryItems[0];
    if (!firstMemory) return;
    handleMemorySelect(firstMemory);
  }, [handleMemorySelect, memoryItems]);

  const handleMemoryPickerClose = React.useCallback(() => {
    setMemoryPickerOpen(false);
  }, []);

  const handleMemoryPickerOpen = React.useCallback(
    (tab: MemoryPickerTab = "uploads") => {
      setMemoryPickerTab(tab);
      setMemoryPickerOpen(true);
      closeMobileRail();
    },
    [closeMobileRail],
  );

  const handleMemoryAttach = React.useCallback(
    (memory: DisplayMemoryUpload) => {
      const primaryUrl =
        memory.fullUrl?.trim() ||
        memory.media_url?.trim() ||
        memory.displayUrl?.trim() ||
        "";
      if (!primaryUrl) return;
      const displayName =
        memory.title?.trim() ||
        memory.description?.trim() ||
        "Memory asset";
      attachRemoteAttachment({
        url: primaryUrl,
        name: displayName,
        mimeType: memory.media_type ?? null,
        thumbUrl: memory.displayUrl ?? null,
      });
      setMemoryPickerOpen(false);
      closeMobileRail();
      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          promptInputRef.current?.focus();
        });
      }
    },
    [attachRemoteAttachment, closeMobileRail],
  );

  const handleMemoryTabChange = React.useCallback((tab: MemoryPickerTab) => {
    setMemoryPickerTab(tab);
  }, []);

  const handleKindSelect = React.useCallback(
    (nextKind: string) => {
      const normalized = normalizeComposerKind(nextKind);
      const partial: Partial<ComposerDraft> = { kind: normalized };
      if (normalized === "poll") {
        partial.poll = ensurePollStructure(workingDraft);
      }
      updateDraft(partial);
    },
    [updateDraft, workingDraft],
  );


  const handlePreviewToggle = React.useCallback(() => {
    actions.setPreviewOpen(!previewOpen);
  }, [actions, previewOpen]);

  const handlePrivacyChange = React.useCallback(
    (value: ComposerFormState["privacy"]) => {
      actions.setPrivacy(value);
    },
    [actions],
  );

  const handlePromptSubmit = React.useCallback(() => {
    if (!onPrompt) return;
    if (loading || attachmentUploading) return;
    const trimmed = promptValue.trim();
    if (!trimmed) return;
    lastSubmittedPromptRef.current = trimmed;

    let attachments: PrompterAttachment[] | null = null;
    if (readyAttachment?.url) {
      attachments = [
        {
          id: readyAttachment.id,
          name: readyAttachment.name,
          mimeType: readyAttachment.mimeType,
          size: readyAttachment.size,
          url: readyAttachment.url,
          thumbnailUrl: readyAttachment.thumbUrl ?? undefined,
          storageKey: readyAttachment.key ?? null,
          sessionId: readyAttachment.sessionId ?? null,
        },
      ];
    }

    const result = onPrompt(trimmed, attachments);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      void (result as Promise<unknown>).finally(() => setPromptValue(""));
    } else {
      setPromptValue("");
    }
  }, [attachmentUploading, loading, onPrompt, promptValue, readyAttachment]);

  const showVibePrompt = React.useMemo(
    () =>
      Boolean(
        displayAttachment &&
          displayAttachment.status === "ready" &&
          !attachmentUploading &&
          !loading &&
          !message,
      ),
    [displayAttachment, attachmentUploading, loading, message],
  );

  React.useEffect(() => {
    if (!readyAttachment?.url) return;
    if (readyAttachment.url === workingDraft.mediaUrl) return;
    const nextKind = readyAttachment.mimeType.startsWith("video/") ? "video" : "image";
    const currentKind = (workingDraft.kind ?? "text").toLowerCase();
    const partial: Partial<ComposerDraft> = {
      mediaUrl: readyAttachment.url,
      mediaPrompt: null,
      mediaThumbnailUrl: readyAttachment.thumbUrl ?? null,
      mediaPlaybackUrl: readyAttachment.url,
      mediaDurationSeconds: null,
      muxPlaybackId: null,
      muxAssetId: null,
    };
    if (
      currentKind === "text" ||
      currentKind === "image" ||
      currentKind === "video" ||
      !currentKind
    ) {
      partial.kind = nextKind;
    }
    updateDraft(partial);
  }, [readyAttachment, updateDraft, workingDraft.kind, workingDraft.mediaUrl]);

  React.useEffect(() => {
    if (attachment && attachment.status === "uploading" && workingDraft.mediaUrl) {
      const currentKind = (workingDraft.kind ?? "text").toLowerCase();
      const partial: Partial<ComposerDraft> = {
        mediaUrl: null,
        mediaPrompt: null,
        mediaThumbnailUrl: null,
        mediaPlaybackUrl: null,
        mediaDurationSeconds: null,
        muxPlaybackId: null,
        muxAssetId: null,
      };
      if (currentKind === "image" || currentKind === "video") {
        partial.kind = "text";
      }
      updateDraft(partial);
    }
  }, [attachment, updateDraft, workingDraft.kind, workingDraft.mediaUrl]);

  const handleRemoveAttachment = React.useCallback(() => {
    const currentKind = (workingDraft.kind ?? "text").toLowerCase();
    const partial: Partial<ComposerDraft> = {
      mediaUrl: null,
      mediaPrompt: null,
      mediaThumbnailUrl: null,
      mediaPlaybackUrl: null,
      mediaDurationSeconds: null,
      muxPlaybackId: null,
      muxAssetId: null,
    };
    if (currentKind === "image" || currentKind === "video") {
      partial.kind = "text";
    }
    updateDraft(partial);
    clearAttachment();
  }, [clearAttachment, updateDraft, workingDraft.kind]);

  const draftReady = isComposerDraftReady(workingDraft);

  const hasDraftContent = React.useMemo(() => {
    if ((workingDraft.content ?? "").trim().length > 0) return true;
    if ((workingDraft.title ?? "").trim().length > 0) return true;
    if ((workingDraft.mediaUrl ?? "").trim().length > 0) return true;
    if (readyAttachment?.url) return true;
    if (pollStructure) {
      const hasQuestion = pollStructure.question.trim().length > 0;
      const hasOption = pollStructure.options.some((option) => option.trim().length > 0);
      if (hasQuestion || hasOption) return true;
    }
    return false;
  }, [
    readyAttachment?.url,
    workingDraft.content,
    workingDraft.mediaUrl,
    workingDraft.title,
    pollStructure,
  ]);

  const savingCreation = saveStatus.state === "saving";
  const saveFailureMessage = saveStatus.state === "failed" ? saveStatus.message ?? "Failed to save creation." : null;

  const canSave = hasDraftContent && !attachmentUploading && !loading && !savingCreation;
  const canPost = draftReady && !attachmentUploading && !loading;

  const handleSaveDialogClose = React.useCallback(() => {
    if (savingCreation) return;
    setSaveDialogOpen(false);
    setSaveDialogTarget(null);
    setSaveError(null);
  }, [savingCreation]);

  const handleSaveClick = React.useCallback(() => {
    if (onSave) {
      onSave(sidebar.selectedProjectId ?? null);
    }
    const attachmentForPreview = displayAttachment;
    if (!attachmentForPreview || attachmentForPreview.status !== "ready" || !attachmentForPreview.url) {
      const fallbackTitle = pickFirstMeaningful(
        workingDraft.title,
        workingDraft.mediaPrompt,
        workingDraft.content,
        message ?? null,
        promptValue,
      );
      const fallbackDescription = pickFirstMeaningful(
        workingDraft.mediaPrompt,
        workingDraft.content,
        message ?? null,
        promptValue,
      );
      setSaveDialogTarget({ type: "draft" });
      setSaveTitle(formatTitleFromText(fallbackTitle || "Capsule creation"));
      setSaveDescription(
        formatDescriptionFromText(
          fallbackDescription || "Saved from Capsule Composer.",
        ),
      );
      setSaveError("Generate or attach a visual before saving.");
      setSaveDialogOpen(true);
      return;
    }
    const titleSource = pickFirstMeaningful(
      workingDraft.title,
      workingDraft.mediaPrompt,
      videoStatus.prompt,
      workingDraft.content,
      message ?? null,
      promptValue,
    );
    const descriptionSource = pickFirstMeaningful(
      workingDraft.mediaPrompt,
      workingDraft.content,
      videoStatus.message,
      message ?? null,
    );
    setSaveDialogTarget({ type: "draft" });
    setSaveTitle(formatTitleFromText(titleSource || "Capsule creation"));
    setSaveDescription(
      formatDescriptionFromText(
        descriptionSource || "Saved from Capsule Composer.",
      ),
    );
    setSaveError(null);
    setSaveDialogOpen(true);
  }, [
    displayAttachment,
    message,
    onSave,
    promptValue,
    sidebar.selectedProjectId,
    videoStatus.message,
    videoStatus.prompt,
    workingDraft.content,
    workingDraft.mediaPrompt,
    workingDraft.title,
  ]);

  const handleAttachmentSave = React.useCallback(
    (attachment: ComposerChatAttachment) => {
      if (!attachment.url) return;
      const titleSource = pickFirstMeaningful(
        attachment.name,
        attachment.excerpt,
        workingDraft.mediaPrompt,
        videoStatus.prompt,
      );
      const descriptionSource = pickFirstMeaningful(
        attachment.excerpt,
        videoStatus.message,
        attachment.name,
      );
      setSaveDialogTarget({ type: "attachment", attachment });
      setSaveTitle(formatTitleFromText(titleSource || "Capsule creation"));
      setSaveDescription(
        formatDescriptionFromText(
          descriptionSource || "Saved from Capsule Composer.",
        ),
      );
      setSaveError(null);
      setSaveDialogOpen(true);
    },
    [videoStatus.message, videoStatus.prompt, workingDraft.mediaPrompt],
  );

  const canSaveAttachment = (attachment: ComposerChatAttachment): boolean => {
    if (!attachment.url) return false;
    const source = (attachment.source ?? "").toLowerCase();
    return source === "ai" || attachment.role === "output";
  };

  const handleSaveConfirm = React.useCallback(async () => {
    if (!saveDialogTarget) return;
    const trimmedTitle = saveTitle.trim();
    const trimmedDescription = saveDescription.trim();
    setSaveError(null);
    if (!trimmedTitle.length) {
      setSaveError("Add a title before saving.");
      return;
    }
    if (!trimmedDescription.length) {
      setSaveError("Add a description before saving.");
      return;
    }

    let payload: ComposerMemorySavePayload | null = null;

    if (saveDialogTarget.type === "draft") {
      if (!displayAttachment || displayAttachment.status !== "ready" || !displayAttachment.url) {
        setSaveError("Generate or attach a visual before saving.");
        return;
      }
      const primaryUrl = (workingDraft.mediaUrl ?? displayAttachment.url)?.trim();
      if (!primaryUrl) {
        setSaveError("Generate or attach a visual before saving.");
        return;
      }
      const mimeType = displayAttachment.mimeType ?? "";
      const lowerMime = mimeType.toLowerCase();
      const inferredKind = (workingDraft.kind ?? "").toLowerCase();
      const isVideo = lowerMime.startsWith("video/") || inferredKind === "video";
      const kind = isVideo ? "video" : "image";
      const mediaType = mimeType || (isVideo ? "video/*" : "image/*");
      const downloadUrl =
        (workingDraft.mediaPlaybackUrl ?? displayAttachment.url)?.trim() || primaryUrl;
      const thumbnailUrl =
        workingDraft.mediaThumbnailUrl?.trim() ?? displayAttachment.thumbUrl ?? null;
      const metadata: Record<string, unknown> = { source_kind: "draft" };
      if (displayAttachment.role) {
        metadata.attachment_role = displayAttachment.role;
      }
      payload = {
        title: trimmedTitle,
        description: trimmedDescription,
        kind,
        mediaUrl: primaryUrl,
        mediaType,
        downloadUrl,
        thumbnailUrl,
        prompt:
          workingDraft.mediaPrompt ??
          videoStatus.prompt ??
          workingDraft.content ??
          message ??
          promptValue,
        durationSeconds: workingDraft.mediaDurationSeconds ?? null,
        muxPlaybackId: workingDraft.muxPlaybackId ?? null,
        muxAssetId: workingDraft.muxAssetId ?? null,
        runId: workingDraft.videoRunId ?? videoStatus.runId ?? null,
        tags: ["composer", "capsule_creation", kind],
        metadata,
      };
    } else {
      const attachment = saveDialogTarget.attachment;
      if (!attachment.url) {
        setSaveError("Attachment is missing a URL.");
        return;
      }
      const mimeType = attachment.mimeType ?? "";
      const lowerMime = mimeType.toLowerCase();
      const kind = lowerMime.startsWith("video/")
        ? "video"
        : lowerMime.startsWith("image/")
          ? "image"
          : "upload";
      const metadata: Record<string, unknown> = { source_kind: "chat-attachment" };
      if (attachment.id) metadata.attachment_id = attachment.id;
      if (attachment.source) metadata.attachment_source = attachment.source;
      if (attachment.role) metadata.attachment_role = attachment.role;
      if (attachment.excerpt) metadata.attachment_excerpt = attachment.excerpt;
      payload = {
        title: trimmedTitle,
        description: trimmedDescription,
        kind,
        mediaUrl: attachment.url,
        mediaType: attachment.mimeType ?? null,
        downloadUrl: attachment.url,
        thumbnailUrl: attachment.thumbnailUrl ?? null,
        prompt: attachment.excerpt ?? promptValue,
        tags: ["composer", "capsule_creation", kind],
        metadata,
      };
    }

    if (!payload) {
      setSaveError("Unable to build save request.");
      return;
    }

    try {
      await onSaveCreation({ target: saveDialogTarget.type, payload });
    } catch (error) {
      const messageText =
        error instanceof Error && error.message
          ? error.message
          : "Failed to save creation.";
      setSaveError(messageText);
    }
  }, [
    displayAttachment,
    message,
    onSaveCreation,
    promptValue,
    saveDescription,
    saveDialogTarget,
    saveTitle,
    videoStatus.prompt,
    videoStatus.runId,
    workingDraft.content,
    workingDraft.kind,
    workingDraft.mediaDurationSeconds,
    workingDraft.mediaPlaybackUrl,
    workingDraft.mediaPrompt,
    workingDraft.mediaThumbnailUrl,
    workingDraft.mediaUrl,
    workingDraft.videoRunId,
    workingDraft.muxAssetId,
    workingDraft.muxPlaybackId,
  ]);


  const hasConversation = renderedHistory.length > 0;
  const showWelcomeMessage = !hasConversation;

  const recentSidebarItems: SidebarListItem[] = React.useMemo(
    () =>
      sidebar.recentChats.map((item) => ({
        id: item.id,
        title: item.title,
        subtitle: item.caption,
        onClick: () => {
          onSelectRecentChat(item.id);
          setRecentModalOpen(false);
        },
      })),
    [onSelectRecentChat, sidebar.recentChats],
  );

  const draftSidebarItems: SidebarListItem[] = React.useMemo(() => {
    const seenDraftIds = new Set<string>();
    const seenDraftSignatures = new Set<string>();
    const seenChoiceKeys = new Set<string>();
    const items: SidebarListItem[] = [];

    for (const item of sidebar.drafts) {
      if (item.kind === "draft") {
        const normalizedId = (item.id ?? "").trim();
        if (normalizedId && seenDraftIds.has(normalizedId)) continue;

        const signature = `${(item.projectId ?? "none").trim().toLowerCase()}|${(
          item.title ?? ""
        )
          .trim()
          .toLowerCase()}|${(item.caption ?? "").trim().toLowerCase()}`;
        if (signature && seenDraftSignatures.has(signature)) continue;

        if (normalizedId) seenDraftIds.add(normalizedId);
        if (signature) seenDraftSignatures.add(signature);

        items.push({
          id: item.id,
          title: item.title,
          subtitle: item.caption,
          onClick: () => onSelectDraft(item.id),
          active:
            Boolean(sidebar.selectedProjectId) &&
            Boolean(item.projectId) &&
            sidebar.selectedProjectId === item.projectId,
          icon: <FileText size={18} weight="duotone" />,
        });
        continue;
      }

      if (seenChoiceKeys.has(item.key)) continue;
      seenChoiceKeys.add(item.key);
      items.push({
        id: `choice-${item.key}`,
        title: item.title,
        subtitle: item.caption,
        onClick: () => {
          if (onForceChoice) onForceChoice(item.key);
        },
        disabled: !onForceChoice,
        icon: <Sparkle size={18} weight="fill" />,
      });
    }

    return items;
  }, [onForceChoice, onSelectDraft, sidebar.drafts, sidebar.selectedProjectId]);

  const projectSidebarItems: SidebarListItem[] = React.useMemo(
    () =>
      sidebar.projects.map((project) => {
        const isActive = sidebar.selectedProjectId === project.id;
        return {
          id: project.id,
          title: project.name,
          subtitle: project.caption,
          active: isActive,
          onClick: () => onSelectProject(isActive ? null : project.id),
          icon: <FolderSimple size={18} weight="duotone" />,
        };
      }),
    [onSelectProject, sidebar.projects, sidebar.selectedProjectId],
  );

  const recentItemIcon = React.useMemo(() => <ChatsTeardrop size={18} weight="duotone" />, []);
  const RECENT_VISIBLE_LIMIT = 6;
  const recentHasOverflow = recentSidebarItems.length > RECENT_VISIBLE_LIMIT;
  const handleShowRecentModal = React.useCallback(() => {
    setRecentModalOpen(true);
  }, []);
  const recentActionProps = React.useMemo(
    () =>
      recentHasOverflow
        ? {
            actionLabel: "See all" as const,
            onAction: handleShowRecentModal,
          }
        : null,
    [recentHasOverflow, handleShowRecentModal],
  );

  const handleCreateProjectClick = React.useCallback(() => {
    if (typeof window === "undefined") return;
    const input = window.prompt("Name your project");
    if (!input) return;
    const trimmed = input.trim();
    if (!trimmed) return;
    onCreateProject(trimmed);
  }, [onCreateProject]);

  const sidebarContent = React.useMemo(() => {
    switch (activeSidebarTab) {
      case "recent":
        return (
          <SidebarSection
            title="Recent chats"
            description="Pick up where you and Capsule left off."
            items={recentSidebarItems}
            emptyMessage="No chats yet"
            itemIcon={recentItemIcon}
            thumbClassName={styles.memoryThumbChat ?? ""}
            maxVisible={RECENT_VISIBLE_LIMIT}
            {...(recentActionProps ?? {})}
          />
        );
      case "drafts":
        return (
          <SidebarSection
            title="Saved drafts"
            description="Continue refining drafts or jump into AI suggestions."
            items={draftSidebarItems}
            emptyMessage="No drafts saved yet"
            itemIcon={<FileText size={18} weight="duotone" />}
            thumbClassName={styles.memoryThumbDraft ?? ""}
          />
        );
      case "projects":
        return (
          <SidebarSection
            title="Projects"
            description="Organize drafts and ideas into collections."
            items={projectSidebarItems}
            emptyMessage="Create a project to organize drafts"
            itemIcon={<FolderSimple size={18} weight="duotone" />}
            thumbClassName={styles.memoryThumbProject ?? ""}
            actionLabel="New project"
            onAction={handleCreateProjectClick}
          />
        );
      case "memories":
        return (
          <div className={styles.sidebarMemories}>
            <div className={styles.sidebarMemoriesCopy}>
              <span className={styles.memoryTitle}>Memories</span>
              <p className={styles.memorySubtitle}>Open your stored assets and brand visuals.</p>
            </div>
            <button
              type="button"
              className={styles.sidebarMemoriesButton}
              onClick={() => handleMemoryPickerOpen("uploads")}
            >
              <span className={`${styles.memoryThumb} ${styles.memoryThumbMemory}`}>
                <Brain size={18} weight="fill" />
              </span>
              <span>Browse memories</span>
            </button>
          </div>
        );
      default:
        return null;
    }
  }, [
    activeSidebarTab,
    draftSidebarItems,
    handleCreateProjectClick,
    handleMemoryPickerOpen,
    projectSidebarItems,
    recentActionProps,
    recentItemIcon,
    recentSidebarItems,
  ]);

  const leftRail = (
    <div className={styles.memoryRail}>
      <div className={styles.sidebarTabs} role="tablist" aria-label="Composer navigation">
        {SIDEBAR_TAB_OPTIONS.map((tab) => {
          const selected = tab.key === activeSidebarTab;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              className={`${styles.sidebarTab} ${selected ? styles.sidebarTabActive : ""}`}
              data-selected={selected ? "true" : undefined}
              onClick={() => setActiveSidebarTab(tab.key)}
              title={tab.label}
            >
              {tab.renderIcon(selected)}
              <span className={styles.srOnly}>{tab.label}</span>
            </button>
          );
        })}
      </div>
      <div className={styles.sidebarScroll}>{sidebarContent}</div>
      {recentModalOpen ? (
        <div
          className={styles.sidebarOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="All recent chats"
          onClick={() => setRecentModalOpen(false)}
        >
          <div
            className={styles.sidebarOverlayCard}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.sidebarOverlayHeader}>
              <span className={styles.sidebarOverlayTitle}>Recent chats</span>
              <button
                type="button"
                className={styles.sidebarOverlayClose}
                onClick={() => setRecentModalOpen(false)}
              >
                Close
              </button>
            </div>
            <div className={styles.sidebarOverlayList}>
              <ol className={styles.memoryList}>
                {recentSidebarItems.map((item) => {
                  const cardClass = `${styles.memoryCard}${
                    item.active ? ` ${styles.memoryCardActive}` : ""
                  }`;
                  const thumbClass = `${styles.memoryThumb} ${styles.memoryThumbChat ?? ""}`;
                  return (
                    <li key={`recent-modal-${item.id}`}>
                      <button
                        type="button"
                        className={cardClass}
                        onClick={item.onClick}
                        disabled={item.disabled}
                        title={`${item.title}${item.subtitle ? ` — ${item.subtitle}` : ""}`}
                        aria-label={`${item.title}${item.subtitle ? ` — ${item.subtitle}` : ""}`}
                      >
                        <span className={thumbClass}>{item.icon ?? recentItemIcon}</span>
                        <span className={styles.memoryMeta}>
                          <span className={styles.memoryName}>{item.title}</span>
                          {item.subtitle ? (
                            <span className={styles.memoryType}>{item.subtitle}</span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  const mainContent = (
    <>
      <div className={styles.chatArea}>
        {summaryEntries.length ? (
          <>
            <div className={styles.summaryContextToggleRow}>
              <button
                type="button"
                className={styles.summaryContextToggleBtn}
                data-active={summaryPanelOpen ? "true" : undefined}
                aria-expanded={summaryPanelOpen}
                onClick={() => setSummaryPanelOpen((open) => !open)}
              >
                {summaryPanelOpen
                  ? "Hide referenced updates"
                  : `View referenced updates (${summaryEntries.length})`}
              </button>
            </div>
            {summaryPanelOpen ? (
              <SummaryContextPanel
                entries={summaryEntries}
                onAsk={handleSummaryAsk}
                onComment={handleSummaryComment}
                onView={handleSummaryView}
              />
            ) : null}
          </>
        ) : null}
        <div className={styles.chatScroll}>
          {summaryResult ? (
            <SummaryNarrativeCard
              result={summaryResult}
              options={summaryOptions}
              entries={summaryEntries}
              onAsk={handleSummaryAsk}
              onComment={handleSummaryComment}
              onView={handleSummaryView}
            />
          ) : null}
          <ol className={styles.chatList}>
            {showWelcomeMessage ? (
              <li className={styles.msgRow} data-role="ai">
                <div className={`${styles.msgBubble} ${styles.aiBubble}`}>{PANEL_WELCOME}</div>
              </li>
            ) : null}

            {renderedHistory.length
              ? renderedHistory.map((entry, index) => {
                  const role = entry.role === "user" ? "user" : "ai";
                  const bubbleClass =
                    role === "user"
                      ? `${styles.msgBubble} ${styles.userBubble}`
                      : `${styles.msgBubble} ${styles.aiBubble}`;
                  const key = entry.id || `${role}-${index}`;
                  const attachments = Array.isArray(entry.attachments)
                    ? entry.attachments
                    : [];
                  return (
                    <li key={key} className={styles.msgRow} data-role={role}>
                      <div className={bubbleClass}>
                        <div className={styles.chatMessageText}>{entry.content}</div>
                        {attachments.length ? (
                          <div className={styles.chatAttachmentList}>
                            {attachments.map((attachment) => {
                              const attachmentKey = attachment.id || `${key}-${attachment.name}`;
                              const mimeType = (attachment.mimeType ?? "").toLowerCase();
                              const isImage = mimeType.startsWith("image/");
                              const previewSrc = attachment.thumbnailUrl ?? attachment.url ?? null;
                              const hasUrl = typeof attachment.url === "string" && attachment.url.length > 0;
                              return (
                                <div key={attachmentKey} className={styles.chatAttachmentCard}>
                                  <a
                                    href={hasUrl ? attachment.url : undefined}
                                    target={hasUrl ? "_blank" : undefined}
                                    rel={hasUrl ? "noreferrer" : undefined}
                                    className={styles.chatAttachmentLink}
                                    aria-disabled={hasUrl ? undefined : "true"}
                                    onClick={
                                      hasUrl
                                        ? undefined
                                        : (event) => {
                                            event.preventDefault();
                                          }
                                    }
                                  >
                                    {isImage && previewSrc ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={previewSrc}
                                        alt={attachment.name}
                                        className={styles.chatAttachmentPreview}
                                      />
                                    ) : null}
                                    <span className={styles.chatAttachmentLabel}>{attachment.name}</span>
                                  </a>
                                  <div className={styles.chatAttachmentActions}>
                                    {canSaveAttachment(attachment) ? (
                                      <button
                                        type="button"
                                        className={styles.chatAttachmentActionBtn}
                                        onClick={() => handleAttachmentSave(attachment)}
                                      >
                                        Save to Memory
                                      </button>
                                    ) : null}
                                    {hasUrl ? (
                                      <a
                                        className={styles.chatAttachmentActionBtn}
                                        href={attachment.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        download
                                      >
                                        Download
                                      </a>
                                    ) : null}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })
              : null}

            {!renderedHistory.length && prompt ? (
              <li className={styles.msgRow} data-role="user">
                <div className={`${styles.msgBubble} ${styles.userBubble}`}>{prompt}</div>
              </li>
            ) : null}

            {displayAttachment ? (
              <AttachmentPanel
                attachment={displayAttachment}
                kind={attachmentKind}
                statusLabel={attachmentStatusLabel}
                displayUrl={attachmentDisplayUrl}
                progressPct={attachmentProgressPct}
                loading={loading}
                uploading={attachmentUploading}
                onRemove={handleRemoveAttachment}
                onOpenViewer={openViewer}
              />
            ) : null}

            {videoStatus.state === "running" ? (
              <li className={styles.msgRow} data-role="ai">
                <div className={`${styles.msgBubble} ${styles.aiBubble} ${styles.videoStatusBubble}`}>
                  <span className={styles.videoStatusSpinner} aria-hidden="true" />
                  <p>{videoStatus.message ?? "Rendering your clip..."}</p>
                </div>
              </li>
            ) : null}

            {videoStatus.state === "failed" ? (
              <li className={styles.msgRow} data-role="ai">
                <div className={`${styles.msgBubble} ${styles.aiBubble} ${styles.videoStatusError}`}>
                  <p>{videoStatus.error ?? "We hit a snag while rendering that clip."}</p>
                  <div className={styles.videoStatusActions}>
                    <button type="button" className={styles.videoRetryButton} onClick={onRetryVideo}>
                      Try again
                    </button>
                  </div>
                </div>
              </li>
            ) : null}

            {showVibePrompt ? (
              <li className={styles.msgRow} data-role="ai">
                <div
                  className={`${styles.msgBubble} ${styles.aiBubble} ${styles.attachmentPromptBubble}`}
                >
                  <p className={styles.attachmentPromptIntro}>
                    Ready to vibe this {attachmentKind === "video" ? "clip" : "visual"} into
                    something new. What should we explore next?
                  </p>
                  <div className={styles.vibeActions}>
                    {vibeSuggestions.map((suggestion) => (
                      <button
                        key={suggestion.prompt}
                        type="button"
                        className={styles.vibeAction}
                        onClick={() => handleSuggestionSelect(suggestion.prompt)}
                      >
                        {suggestion.label}
                      </button>
                    ))}
                  </div>
                </div>
              </li>
            ) : null}

            {clarifier ? (
              <li className={styles.msgRow} data-role="ai">
                <div className={`${styles.msgBubble} ${styles.aiBubble} ${styles.clarifierBubble}`}>
                  <p className={styles.clarifierHeading}>{clarifier.question}</p>
                  {clarifier.rationale ? (
                    <p className={styles.clarifierRationale}>{clarifier.rationale}</p>
                  ) : null}
                  {clarifier.styleTraits.length ? (
                    <div className={styles.clarifierTraits}>
                      {clarifier.styleTraits.map((trait) => (
                        <span key={`${clarifier.questionId}-${trait}`} className={styles.clarifierTrait}>
                          {trait}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {clarifier.suggestions.length ? (
                    <div className={styles.clarifierSuggestions}>
                      {clarifier.suggestions.map((suggestion) => (
                        <button
                          key={`${clarifier.questionId}-${suggestion}`}
                          type="button"
                          className={styles.clarifierSuggestion}
                          onClick={() => onClarifierRespond?.(suggestion)}
                          disabled={loading}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </li>
            ) : null}

            {!renderedHistory.length && message && !clarifier ? (
              <li className={styles.msgRow} data-role="ai">
                <div className={`${styles.msgBubble} ${styles.aiBubble}`}>{message}</div>
              </li>
            ) : null}

            {loading ? (
              <li className={styles.msgRow} data-role="ai">
                <div
                  className={`${styles.msgBubble} ${styles.aiBubble} ${styles.streaming}`}
                  aria-live="polite"
                >
                  <span className={styles.streamDot} />
                  <span className={styles.streamDot} />
                  <span className={styles.streamDot} />
                </div>
              </li>
            ) : null}
          </ol>
        </div>
      </div>

      <PromptSurface
        loading={loading}
        attachmentUploading={attachmentUploading}
        onAttachClick={handleAttachClick}
        onAttachmentSelect={handleAttachmentSelect}
        fileInputRef={fileInputRef}
        promptInputRef={promptInputRef}
        promptValue={promptValue}
        placeholder={currentPromptPlaceholder}
        onPromptChange={setPromptValue}
        onPromptPaste={handlePromptPaste}
        onPromptSubmit={handlePromptSubmit}
        quickPromptOptions={quickPromptOptions}
        onQuickPromptSelect={handleSuggestionSelect}
        showQuickPrompts={!summaryResult}
        voiceControls={voiceControls}
      />
    </>
  );

  const previewState = React.useMemo(() => {
    const kind = activeKind;
    let label = activeKindLabel;
    const content = (workingDraft.content ?? "").trim();
    const title = (workingDraft.title ?? "").trim();
    const mediaPrompt = (workingDraft.mediaPrompt ?? "").trim();
    const mediaUrl =
      attachmentDisplayUrl ??
      attachmentFullUrl ??
      workingDraft.mediaUrl ??
      workingDraft.mediaPlaybackUrl ??
      null;
    const attachmentName = displayAttachment?.name ?? null;
    const attachmentThumb =
      displayAttachment?.thumbUrl ?? workingDraft.mediaThumbnailUrl ?? null;
    const clipDurationSeconds = workingDraft.mediaDurationSeconds ?? null;
    const pollBodyValue = workingDraft.content ?? "";
    const trimmedPollBody = pollBodyValue.trim();
    const pollQuestionValue = pollStructure.question ?? "";
    const trimmedPollQuestion = pollQuestionValue.trim();
    const trimmedPollOptions = pollStructure.options.map((option) => option.trim()).filter(Boolean);
    const pollHasStructure =
      trimmedPollBody.length > 0 ||
      trimmedPollQuestion.length > 0 ||
      trimmedPollOptions.length > 0;
    const pollOptionCount = trimmedPollOptions.length || pollStructure.options.length;
    const pollHelperText = `${pollOptionCount} option${pollOptionCount === 1 ? "" : "s"} ready`;
    const pollPreviewCard = (
      <div className={styles.previewPollCard} data-editable="true">
        <div className={styles.pollEditorField}>
          <label className={styles.pollEditorLabel} htmlFor="composer-poll-intro">
            Poll intro
          </label>
          <textarea
            id="composer-poll-intro"
            className={`${styles.previewPollBody} ${styles.pollEditorQuestion}`}
            value={pollBodyValue}
            placeholder="Prep the community with a short vibe check..."
            rows={3}
            onChange={(event) => handlePollBodyInput(event.target.value)}
          />
        </div>
        <div className={styles.pollEditorField}>
          <label className={styles.pollEditorLabel} htmlFor="composer-poll-question">
            Poll title
          </label>
          <textarea
            id="composer-poll-question"
            ref={pollQuestionRef}
            className={`${styles.previewPollQuestion} ${styles.pollEditorQuestion}`}
            value={pollQuestionValue}
            placeholder="Untitled poll"
            rows={2}
            onChange={(event) => handlePollQuestionInput(event.target.value)}
          />
        </div>
        <div className={styles.pollEditorField}>
          <span className={styles.pollEditorLabel}>Poll options</span>
          <ul className={`${styles.previewPollOptions} ${styles.pollEditorOptions}`} role="list">
            {pollStructure.options.map((option, index) => {
              const allowRemoval = pollStructure.options.length > 2;
              return (
                <li key={`poll-option-${index}`} className={styles.pollEditorOptionRow}>
                  <span className={styles.previewPollOptionBullet}>{index + 1}</span>
                  <input
                    ref={(element) => {
                      if (element) {
                        pollOptionRefs.current[index] = element;
                      } else {
                        delete pollOptionRefs.current[index];
                      }
                    }}
                    className={`${styles.previewPollOptionLabel} ${styles.pollEditorOptionInput}`}
                    value={option}
                    placeholder={`Option ${index + 1}`}
                    type="text"
                    autoComplete="off"
                    onChange={(event) => handlePollOptionInput(index, event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        handleAddPollOption(index);
                      } else if (
                        (event.key === "Backspace" || event.key === "Delete") &&
                        !event.currentTarget.value.trim() &&
                        pollStructure.options.length > 2
                      ) {
                        event.preventDefault();
                        handleRemovePollOption(index);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className={styles.pollEditorRemove}
                    onClick={() => handleRemovePollOption(index)}
                    aria-label={
                      allowRemoval
                        ? `Remove option ${index + 1}`
                        : `Clear option ${index + 1}`
                    }
                  >
                    <X size={12} weight="bold" />
                  </button>
                </li>
              );
            })}
          </ul>
          {pollStructure.options.length < MAX_POLL_OPTIONS ? (
            <button
              type="button"
              className={styles.pollEditorAdd}
              onClick={() => handleAddPollOption()}
            >
              <span className={styles.pollEditorAddIcon}>
                <Plus size={14} weight="bold" />
              </span>
              <span>Add option</span>
            </button>
          ) : null}
        </div>
      </div>
    );
    const renderPlaceholder = (message: string) => (
      <div className={styles.previewPlaceholderCard}>
        <span className={styles.previewPlaceholderIcon}>
          <Sparkle size={20} weight="fill" />
        </span>
        <p>{message}</p>
      </div>
    );

    let helper: string | null = null;
    let body: React.ReactNode;
    let empty = false;

    if (kind === "poll") {
      if (!pollHasStructure) {
        empty = true;
        body = renderPlaceholder(
          "Describe the poll or start drafting your intro and the live preview will appear.",
        );
      } else {
        empty = false;
        helper = pollHelperText;
        body = pollPreviewCard;
      }
    } else {
      switch (kind) {
        case "image": {
          empty = !mediaUrl;
          helper = mediaPrompt || attachmentName;
          if (empty) {
            body = renderPlaceholder("Upload or describe a visual to stage it here.");
          } else {
            body = (
              <figure className={styles.previewMediaFrame} data-kind="image">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={mediaUrl ?? undefined}
                  alt={attachmentName ?? (mediaPrompt || "Generated visual preview")}
                />
                {mediaPrompt ? <figcaption>{mediaPrompt}</figcaption> : null}
              </figure>
            );
          }
          break;
        }
        case "video": {
          empty = !mediaUrl;
          const durationLabel = formatClipDuration(clipDurationSeconds);
          helper = [mediaPrompt || attachmentName, durationLabel].filter(Boolean).join(" • ");
          if (empty) {
            body = renderPlaceholder("Drop a clip or describe scenes to preview them here.");
          } else {
            const captionParts = [];
            if (mediaPrompt) captionParts.push(mediaPrompt);
            if (durationLabel) captionParts.push(durationLabel);
            body = (
              <figure className={styles.previewMediaFrame} data-kind="video">
                <video
                  src={mediaUrl ?? undefined}
                  controls
                  preload="metadata"
                  poster={attachmentThumb ?? undefined}
                />
                {captionParts.length ? <figcaption>{captionParts.join(" • ")}</figcaption> : null}
              </figure>
            );
          }
          break;
        }
        case "document": {
          const blocks = content
            ? content.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean)
            : [];
          empty = blocks.length === 0 && !title;
          if (empty) {
            body = renderPlaceholder("Outline the sections you need and the document will render.");
          } else {
            const displayBlocks = blocks.length ? blocks : ["Overview", "Highlights", "Next steps"];
            helper = `${displayBlocks.length} section${
              displayBlocks.length === 1 ? "" : "s"
            } in progress`;
            body = (
              <div className={styles.previewDocumentCard}>
                <h3 className={styles.previewDocumentTitle}>{title || "Untitled document"}</h3>
                <ol className={styles.previewDocumentSections}>
                  {displayBlocks.map((block, index) => {
                    const [heading, ...rest] = block.split(/\n+/);
                    const bodyText = rest.join(" ").trim();
                    return (
                      <li key={`${heading}-${index}`}>
                        <span className={styles.previewDocumentSectionBadge}>
                          {index + 1 < 10 ? `0${index + 1}` : index + 1}
                        </span>
                        <div className={styles.previewDocumentSectionContent}>
                          <h4>{heading || `Section ${index + 1}`}</h4>
                          {bodyText ? <p>{bodyText}</p> : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          }
          break;
        }
        case "tournament": {
          const rounds = content
            ? content.split(/\n+/).map((value) => value.trim()).filter(Boolean)
            : [];
          empty = rounds.length === 0 && !title;
          if (empty) {
            body = renderPlaceholder(
              "Tell Capsule AI about rounds, seeds, or teams to map the bracket.",
            );
          } else {
            const displayRounds = rounds.length
              ? rounds
              : ["Round of 16", "Quarterfinals", "Semifinals", "Final"];
            helper = `${displayRounds.length} stage${
              displayRounds.length === 1 ? "" : "s"
            } plotted`;
            body = (
              <div className={styles.previewTournamentCard}>
                <h3 className={styles.previewTournamentTitle}>{title || "Tournament bracket"}</h3>
                <div className={styles.previewTournamentGrid}>
                  {displayRounds.map((round, index) => (
                    <div key={`${round}-${index}`} className={styles.previewTournamentColumn}>
                      <span>{round}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          }
          break;
        }
        default: {
          const paragraphs = content
            ? content.split(/\n+/).map((block) => block.trim()).filter(Boolean)
            : [];
          empty = paragraphs.length === 0 && !title;
          if (empty) {
            body = renderPlaceholder(
              `Give Capsule AI a prompt to see your ${label.toLowerCase()} take shape.`,
            );
          } else {
            body = (
              <div className={styles.previewPostCard}>
                {title ? <h3 className={styles.previewPostTitle}>{title}</h3> : null}
                <div className={styles.previewPostBody}>
                  {paragraphs.map((paragraph, index) => (
                    <p key={`${paragraph}-${index}`}>{paragraph}</p>
                  ))}
                </div>
              </div>
            );
          }
          break;
        }
      }
    }

    if (kind !== "poll" && pollHasStructure) {
      if (empty) {
        body = pollPreviewCard;
      } else {
        const composite: React.ReactNode[] = [
          <div key="base" className={styles.previewPrimary}>
            {body}
          </div>,
        ];
        composite.push(
          <div key="divider" className={styles.previewDivider} aria-hidden="true" />,
        );
        composite.push(
          <div key="poll" className={styles.previewSupplement}>
            {pollPreviewCard}
          </div>,
        );
        body = <div className={styles.previewComposite}>{composite}</div>;
      }
      helper = helper ?? pollHelperText;
      empty = false;
      label = `${activeKindLabel} + Poll`;
    }

    return { kind, label, body, empty, helper };
  }, [
    activeKind,
    activeKindLabel,
    attachmentDisplayUrl,
    attachmentFullUrl,
    displayAttachment?.name,
    displayAttachment?.thumbUrl,
    handleAddPollOption,
    handlePollBodyInput,
    handlePollOptionInput,
    handlePollQuestionInput,
    handleRemovePollOption,
    pollStructure,
    workingDraft.content,
    workingDraft.mediaPrompt,
    workingDraft.mediaUrl,
    workingDraft.mediaPlaybackUrl,
    workingDraft.mediaThumbnailUrl,
    workingDraft.mediaDurationSeconds,
    workingDraft.title,
  ]);

  const previewPrimaryAction = React.useMemo(() => {
    if (activeKind === "image" || activeKind === "video") {
      return {
        label: "Upload asset",
        onClick: handleAttachClick,
        disabled: loading || attachmentUploading,
      };
    }
    const trimmed = promptValue.trim();
    const pollHasStructure =
      pollStructure.question.trim().length > 0 ||
      pollStructure.options.some((option) => option.trim().length > 0);
    const label =
      activeKind === "poll" ? "Generate via AI" : activeKind === "document" ? "Outline with AI" : "Ask Capsule";
    const allowed = trimmed.length > 0 || pollHasStructure;
    return {
      label,
      onClick: handlePromptSubmit,
      disabled: loading || attachmentUploading || !allowed,
    };
  }, [
    activeKind,
    attachmentUploading,
    handleAttachClick,
    handlePromptSubmit,
    loading,
    promptValue,
    pollStructure,
  ]);

  const previewSecondaryAction = React.useMemo(() => {
    if (activeKind === "image" || activeKind === "video") {
      return {
        label: "Open library",
        onClick: () => handleMemoryPickerOpen(memoryPickerTab),
        disabled: false,
      };
    }
    return {
      label: "Browse blueprints",
      onClick: handleBlueprintShortcut,
      disabled: !memoryItems.length,
    };
  }, [activeKind, handleBlueprintShortcut, handleMemoryPickerOpen, memoryItems.length, memoryPickerTab]);

  const summaryPreviewContent = React.useMemo(() => {
    if (!summaryPreviewEntry) return null;
    const hasPost = Boolean(summaryPreviewEntry.postId);
    const highlightChips =
      summaryPreviewEntry.highlights && summaryPreviewEntry.highlights.length ? (
        <div className={styles.summaryPreviewHighlights}>
          {summaryPreviewEntry.highlights.map((highlight, index) => (
            <span key={`${summaryPreviewEntry.id}-highlight-${index}`} className={styles.summaryPreviewHighlight}>
              {highlight}
            </span>
          ))}
        </div>
      ) : null;

    const actions = (
      <div className={styles.summaryPreviewActions}>
        <button
          type="button"
          className={styles.summaryPreviewActionBtn}
          onClick={() => handleSummaryView(summaryPreviewEntry)}
        >
          Open in feed
        </button>
        <button
          type="button"
          className={styles.summaryPreviewActionBtn}
          onClick={() => handleSummaryComment(summaryPreviewEntry)}
          disabled={!hasPost}
          data-disabled={!hasPost ? "true" : undefined}
        >
          Open comments
        </button>
      </div>
    );

    if (summaryPreviewPost) {
      return (
        <PreviewColumn
          title="Referenced update"
          subtitle={summaryPreviewEntry.author ?? "Feed activity"}
          meta={summaryPreviewEntry.relativeTime ? <span>{summaryPreviewEntry.relativeTime}</span> : null}
          actions={
            <button
              type="button"
              className={styles.summaryPreviewBackBtn}
              onClick={() => setSummaryPreviewEntry(null)}
            >
              Back to composer
            </button>
          }
        >
          <div className={styles.summaryPreviewPost}>
            {summaryPreviewEntry.summary ? (
              <p className={styles.summaryPreviewText}>{summaryPreviewEntry.summary}</p>
            ) : null}
            {highlightChips}
            <div className={styles.summaryPreviewPostFeed}>
              <HomeFeedList
                posts={previewPosts}
                likePending={likePending}
                memoryPending={memoryPending}
                activeFriendTarget={activeFriendTarget}
                friendActionPending={friendActionPending}
                onToggleLike={handlePreviewToggleLike}
                onToggleMemory={handlePreviewToggleMemory}
                onFriendRequest={handlePreviewFriendRequest}
                onDelete={handlePreviewDeletePost}
                onRemoveFriend={handlePreviewFriendRemove}
                onToggleFriendTarget={handlePreviewToggleFriendTarget}
                formatCount={formatFeedCount}
                timeAgo={formatTimeAgo}
                exactTime={formatExactTime}
                canRemember={canRemember}
                hasFetched={previewHasFetched}
                isRefreshing={isRefreshing}
                onLoadMore={() => {}}
                hasMore={false}
                isLoadingMore={false}
              />
            </div>
            {actions}
          </div>
        </PreviewColumn>
      );
    }

    return (
      <PreviewColumn
        title="Referenced update"
        subtitle={summaryPreviewEntry.author ?? "Feed activity"}
        meta={summaryPreviewEntry.relativeTime ? <span>{summaryPreviewEntry.relativeTime}</span> : null}
        actions={
          <button
            type="button"
            className={styles.summaryPreviewBackBtn}
            onClick={() => setSummaryPreviewEntry(null)}
          >
            Back to composer
          </button>
        }
      >
        <div className={styles.summaryPreviewCard}>
          {summaryPreviewEntry.summary ? (
            <p className={styles.summaryPreviewText}>{summaryPreviewEntry.summary}</p>
          ) : null}
          {highlightChips}
          {!summaryPreviewPost && hasPost ? (
            <p className={styles.summaryPreviewHint}>
              We couldn&apos;t load this post in the preview. Use Open in feed to view it in the timeline.
            </p>
          ) : null}
          {actions}
        </div>
      </PreviewColumn>
    );
  }, [
    activeFriendTarget,
    canRemember,
    friendActionPending,
    handlePreviewDeletePost,
    handlePreviewFriendRemove,
    handlePreviewFriendRequest,
    handlePreviewToggleFriendTarget,
    handlePreviewToggleLike,
    handlePreviewToggleMemory,
    handleSummaryComment,
    handleSummaryView,
    isRefreshing,
    likePending,
    memoryPending,
    previewHasFetched,
    previewPosts,
    summaryPreviewEntry,
    summaryPreviewPost,
  ]);

  const previewContent = summaryPreviewContent ?? (
    <PreviewColumn
      title="Preview"
      meta={<span className={styles.previewTypeBadge}>{previewState.label}</span>}
    >
      <div
        id="composer-preview-pane"
        className={styles.previewCanvas}
        data-kind={previewState.kind}
        data-empty={previewState.empty ? "true" : undefined}
      >
        <div className={styles.previewStage}>{previewState.body}</div>
        {previewState.helper ? (
          <p className={styles.previewHelper}>{previewState.helper}</p>
        ) : null}
        <div className={styles.previewActions}>
          <button
            type="button"
            className={styles.previewActionPrimary}
            onClick={previewPrimaryAction.onClick}
            disabled={previewPrimaryAction.disabled}
          >
            {previewPrimaryAction.label}
          </button>
          <button
            type="button"
            className={styles.previewActionSecondary}
            onClick={previewSecondaryAction.onClick}
            disabled={previewSecondaryAction.disabled}
          >
            {previewSecondaryAction.label}
          </button>
        </div>
      </div>
    </PreviewColumn>
  );

  const renderMobileListItem = React.useCallback(
    (item: SidebarListItem, fallbackIcon?: React.ReactNode) => (
      <li key={item.id}>
        <button
          type="button"
          onClick={() => {
            item.onClick();
            closeMobileRail();
          }}
          disabled={item.disabled}
          data-active={item.active ? "true" : undefined}
        >
          <span className={styles.mobileSheetListIcon}>{item.icon ?? fallbackIcon ?? null}</span>
          <span className={styles.mobileSheetListMeta}>
            <span className={styles.mobileSheetListTitle}>{item.title}</span>
            {item.subtitle ? (
              <span className={styles.mobileSheetListCaption}>{item.subtitle}</span>
            ) : null}
          </span>
        </button>
      </li>
    ),
    [closeMobileRail],
  );

  const mobileMenu =
    !isMobileLayout || !mobileRailOpen
      ? null
      : (
          <div
            id="composer-mobile-menu"
            className={styles.mobileSheet}
            role="dialog"
            aria-modal="true"
            aria-labelledby="composer-mobile-menu-title"
            onClick={closeMobileRail}
          >
            <div className={styles.mobileSheetBackdrop} />
            <div
              className={styles.mobileSheetPanel}
              role="document"
              onClick={(event) => event.stopPropagation()}
            >
              <div className={styles.mobileSheetHeader}>
                <span id="composer-mobile-menu-title" className={styles.mobileSheetTitle}>
                  Composer menu
                </span>
                <button
                  type="button"
                  className={styles.mobileSheetClose}
                  onClick={closeMobileRail}
                  ref={mobileMenuCloseRef}
                  aria-label="Close composer menu"
                >
                  <X size={16} weight="bold" />
                </button>
              </div>
              <div className={styles.mobileSheetBody}>
                <section className={styles.mobileSheetSection}>
                  <header>
                    <span className={styles.mobileSheetSectionTitle}>Recent chats</span>
                    {recentActionProps ? (
                      <button
                        type="button"
                        className={styles.mobileSheetSectionAction}
                        onClick={() => {
                          closeMobileRail();
                          recentActionProps.onAction();
                        }}
                      >
                        {recentActionProps.actionLabel ?? "See all"}
                      </button>
                    ) : null}
                  </header>
                  {recentSidebarItems.length ? (
                    <ul className={styles.mobileSheetList} role="list">
                      {recentSidebarItems.map((item) =>
                        renderMobileListItem(item, recentItemIcon),
                      )}
                    </ul>
                  ) : (
                    <div className={styles.memoryEmpty}>No chats yet</div>
                  )}
                </section>

                <section className={styles.mobileSheetSection}>
                  <header>
                    <span className={styles.mobileSheetSectionTitle}>Saved drafts</span>
                  </header>
                  {draftSidebarItems.length ? (
                    <ul className={styles.mobileSheetList} role="list">
                      {draftSidebarItems.map((item) => renderMobileListItem(item))}
                    </ul>
                  ) : (
                    <div className={styles.memoryEmpty}>No drafts saved yet</div>
                  )}
                </section>

                <section className={styles.mobileSheetSection}>
                  <header>
                    <span className={styles.mobileSheetSectionTitle}>Projects</span>
                    <button
                      type="button"
                      className={styles.mobileSheetSectionAction}
                      onClick={() => {
                        closeMobileRail();
                        handleCreateProjectClick();
                      }}
                    >
                      New project
                    </button>
                  </header>
                  {projectSidebarItems.length ? (
                    <ul className={styles.mobileSheetList} role="list">
                      {projectSidebarItems.map((item) => renderMobileListItem(item))}
                    </ul>
                  ) : (
                    <div className={styles.memoryEmpty}>Create a project to organize drafts</div>
                  )}
                </section>

                <section className={styles.mobileSheetSection}>
                  <header>
                    <span className={styles.mobileSheetSectionTitle}>Memories</span>
                  </header>
                  <ul className={styles.mobileSheetList} role="list">
                    <li>
                      <button
                        type="button"
                        onClick={() => {
                          closeMobileRail();
                          handleMemoryPickerOpen("uploads");
                        }}
                      >
                        <span className={styles.mobileSheetListIcon}>
                          <Brain size={18} weight="fill" />
                        </span>
                        <span className={styles.mobileSheetListMeta}>
                          <span className={styles.mobileSheetListTitle}>Browse memories</span>
                          <span className={styles.mobileSheetListCaption}>
                            Open your stored assets and brand visuals.
                          </span>
                        </span>
                      </button>
                    </li>
                  </ul>
                </section>

                <section className={styles.mobileSheetSection}>
                  <header>
                    <span className={styles.mobileSheetSectionTitle}>Settings</span>
                  </header>
                  <div className={styles.privacyGroup}>
                    <span className={styles.privacyLabel}>Visibility</span>
                    <select
                      aria-label="Visibility"
                      className={styles.privacySelect}
                      value={privacy}
                      onChange={(event) => {
                        const nextValue = (event.target.value || "public") as ComposerFormState["privacy"];
                        actions.setPrivacy(nextValue);
                      }}
                      disabled={loading}
                    >
                      <option value="public">Public</option>
                      <option value="private">Private</option>
                    </select>
                  </div>
                  <div>
                    <button
                      type="button"
                      className={styles.secondaryAction}
                      onClick={() => {
                        handleSaveClick();
                        closeMobileRail();
                      }}
                      disabled={!canSave}
                    >
                      {savingCreation ? "Saving..." : "Save"}
                    </button>
                  </div>
                </section>
              </div>
            </div>
          </div>
        );

  const startLeftResize = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      actions.layout.setDrag({ kind: "left", startX: event.clientX, start: layout.leftWidth });
    },
    [actions, layout.leftWidth],
  );

  const startRightResize = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      actions.layout.setDrag({ kind: "right", startX: event.clientX, start: layout.rightWidth });
    },
    [actions, layout.rightWidth],
  );

  const startBottomResize = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      actions.layout.setDrag({ kind: "bottom", startY: event.clientY, start: layout.bottomHeight });
    },
    [actions, layout.bottomHeight],
  );

  return (
    <div className={styles.overlay}>
      <div className={styles.backdrop} />
      <aside className={styles.panel} role="dialog" aria-label="AI Composer">
        <ComposerToolbar
          activeKey={toggleActiveKey}
          onSelectKind={handleKindSelect}
          onClose={onClose}
          disabled={loading}
          smartContextEnabled={smartContextEnabled}
          onToggleContext={() => onSmartContextChange(!smartContextEnabled)}
          contextActive={smartContextEnabled && hasContextSnippets}
          onMenuToggle={() => actions.setMobileRailOpen(!mobileRailOpen)}
          mobileRailOpen={mobileRailOpen}
          onPreviewToggle={handlePreviewToggle}
          previewOpen={previewOpen}
          isMobile={isMobileLayout}
        />

        <SmartContextSummary
          enabled={smartContextEnabled}
          snapshot={contextSnapshot}
          snippets={contextSnippets}
        />

        <div className={styles.panelBody}>
          <ComposerLayout
            columnsRef={columnsRef}
            mainRef={mainRef}
            layout={layout}
            previewOpen={isMobileLayout ? false : previewOpen}
            leftRail={leftRail}
            mainContent={mainContent}
            previewContent={isMobileLayout ? null : previewContent}
            mobileRailOpen={mobileRailOpen}
            onToggleMobileRail={() => actions.setMobileRailOpen(!mobileRailOpen)}
            mobileMenu={mobileMenu}
            onLeftResizeStart={startLeftResize}
            onRightResizeStart={startRightResize}
            onBottomResizeStart={startBottomResize}
          />

          {isMobileLayout && previewOpen ? (
            <>
              <div
                className={styles.mobilePreviewBackdrop}
                onClick={() => actions.setPreviewOpen(false)}
              />
              <div
                id="composer-mobile-preview"
                className={styles.mobilePreviewOverlay}
                role="dialog"
                aria-modal="true"
                aria-labelledby="composer-mobile-preview-title"
                onClick={() => actions.setPreviewOpen(false)}
              >
                <div
                  className={styles.mobilePreviewDialog}
                  role="document"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className={styles.mobilePreviewHeader}>
                    <span
                      className={styles.mobileSheetTitle}
                      id="composer-mobile-preview-title"
                    >
                      Preview
                    </span>
                    <button
                      type="button"
                      className={styles.mobilePreviewClose}
                      onClick={() => actions.setPreviewOpen(false)}
                      ref={mobilePreviewCloseRef}
                      aria-label="Close preview"
                    >
                      <X size={16} weight="bold" />
                    </button>
                  </div>
                  <div className={styles.mobilePreviewContent}>{previewContent}</div>
                </div>
              </div>
            </>
          ) : null}
        </div>

        <ComposerFooter
          footerHint={footerHint}
          privacy={privacy}
          onPrivacyChange={handlePrivacyChange}
          loading={loading}
          attachmentUploading={attachmentUploading}
          onClose={onClose}
          onSave={handleSaveClick}
          onPreviewToggle={handlePreviewToggle}
          previewOpen={previewOpen}
          onPost={onPost}
          canSave={canSave}
          canPost={canPost}
          saving={savingCreation}
        />

        {saveDialogOpen ? (
          <div
            className={styles.saveDialogOverlay}
            role="dialog"
            aria-modal="true"
            aria-labelledby="composer-save-dialog-title"
            onClick={handleSaveDialogClose}
          >
            <div
              className={styles.saveDialog}
              onClick={(event) => event.stopPropagation()}
            >
              <div className={styles.saveDialogHeader}>
                <h3 id="composer-save-dialog-title">Save to Memory</h3>
                <button
                  type="button"
                  className={styles.saveDialogClose}
                  onClick={handleSaveDialogClose}
                  aria-label="Close save dialog"
                  disabled={savingCreation}
                >
                  <X size={16} weight="bold" />
                </button>
              </div>
              <div className={styles.saveDialogBody}>
                <label className={styles.saveDialogLabel} htmlFor="composer-save-title">
                  Title
                </label>
                <input
                  id="composer-save-title"
                  className={styles.saveDialogInput}
                  value={saveTitle}
                  onChange={(event) => setSaveTitle(event.target.value)}
                  placeholder="Describe this creation"
                  disabled={savingCreation}
                />
                <label className={styles.saveDialogLabel} htmlFor="composer-save-description">
                  Description
                </label>
                <textarea
                  id="composer-save-description"
                  className={styles.saveDialogTextarea}
                  value={saveDescription}
                  onChange={(event) => setSaveDescription(event.target.value)}
                  rows={4}
                  placeholder="Capsule uses this description for recall."
                  disabled={savingCreation}
                />
                {(saveError ?? saveFailureMessage) ? (
                  <p className={styles.saveDialogError} role="alert">
                    {saveError ?? saveFailureMessage}
                  </p>
                ) : null}
              </div>
              <div className={styles.saveDialogActions}>
                <button
                  type="button"
                  className={styles.saveDialogSecondary}
                  onClick={handleSaveDialogClose}
                  disabled={savingCreation}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.saveDialogPrimary}
                  onClick={handleSaveConfirm}
                  disabled={savingCreation}
                >
                  {savingCreation ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <ComposerMemoryPicker
          open={memoryPickerOpen}
          activeTab={memoryPickerTab}
          onTabChange={handleMemoryTabChange}
          uploads={uploadMemories}
          uploadsLoading={uploadsLoading}
          uploadsError={uploadsError}
          assets={assetMemories}
          assetsLoading={assetsLoading}
          assetsError={assetsError}
          onSelect={handleMemoryAttach}
          onClose={handleMemoryPickerClose}
        />

        <ComposerViewer
          open={viewerOpen}
          attachment={displayAttachment}
          attachmentKind={attachmentKind}
          attachmentFullUrl={attachmentFullUrl}
          attachmentDisplayUrl={attachmentDisplayUrl}
          attachmentPreviewUrl={attachmentPreviewUrl}
          onClose={closeViewer}
          onRemoveAttachment={handleRemoveAttachment}
          onSelectSuggestion={handleSuggestionSelect}
          vibeSuggestions={vibeSuggestions}
        />
      </aside>
    </div>
  );
}


