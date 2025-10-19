"use client";

import * as React from "react";
import styles from "../ai-composer.module.css";
import homeStyles from "@/components/home.module.css";
import contextMenuStyles from "@/components/ui/context-menu.module.css";
import {
  X,
  Paperclip,
  CaretDown,
  Sparkle,
  ChatsTeardrop,
  FileText,
  FolderSimple,
  Brain,
} from "@phosphor-icons/react/dist/ssr";

import { ComposerLayout } from "./components/ComposerLayout";
import { AttachmentPanel } from "./components/AttachmentPanel";
import { PreviewColumn } from "./components/PreviewColumn";
import { VoiceRecorder } from "./components/VoiceRecorder";
import { ComposerMemoryPicker, type MemoryPickerTab } from "./components/ComposerMemoryPicker";
import { useComposerFormReducer, type ComposerFormState } from "./hooks/useComposerFormReducer";
import { useComposerLayout } from "./hooks/useComposerLayout";
import { useComposerVoice } from "./hooks/useComposerVoice";
import { useAttachmentViewer, useResponsiveRail } from "./hooks/useComposerPanels";

import { useAttachmentUpload, type LocalAttachment } from "@/hooks/useAttachmentUpload";
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

const PANEL_WELCOME =
  "Hey, I'm Capsule AI. Tell me what you're building: posts, polls, visuals, documents, tournaments, anything. I'll help you shape it.";

const QUICK_PROMPT_PRESETS: Record<string, Array<{ label: string; prompt: string }>> = {
  default: [
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
  ],
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
}: SidebarSectionProps) {
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
      {items.length ? (
        <ol className={styles.memoryList}>
          {items.map((item) => {
            const cardClass = `${styles.memoryCard}${item.active ? ` ${styles.memoryCardActive}` : ""}`;
            const thumbClass = `${styles.memoryThumb}${thumbClassName ? ` ${thumbClassName}` : ""}`;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={cardClass}
                  onClick={item.onClick}
                  disabled={item.disabled}
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

export type ComposerChoice = { key: string; label: string };

type ComposerFormProps = {
  loading: boolean;
  draft: ComposerDraft | null;
  prompt: string;
  message?: string | null | undefined;
  choices?: ComposerChoice[] | null | undefined;
  sidebar: ComposerSidebarData;
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
};

export function ComposerForm({
  loading,
  draft,
  prompt,
  message,
  choices: _choices,
  sidebar,
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

  const pollStructure = React.useMemo(() => ensurePollStructure(workingDraft), [workingDraft]);

  const updateDraft = React.useCallback(
    (partial: Partial<ComposerDraft>) => {
      onChange({ ...workingDraft, ...partial });
    },
    [onChange, workingDraft],
  );

  const { state, actions } = useComposerFormReducer();
  const { privacy, mobileRailOpen, previewOpen, layout, viewerOpen, voice: voiceState } = state;

  const columnsRef = React.useRef<HTMLDivElement | null>(null);
  const mainRef = React.useRef<HTMLDivElement | null>(null);
  const promptInputRef = React.useRef<HTMLInputElement | null>(null);

  const {
    fileInputRef,
    attachment,
    readyAttachment,
    uploading: attachmentUploading,
    clearAttachment,
    handleAttachClick,
    handleAttachmentSelect,
    attachRemoteAttachment,
  } = useAttachmentUpload();
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
    workingDraft,
    updateDraft,
    promptInputRef,
    loading,
    attachmentUploading,
  });

  useAttachmentViewer({ open: viewerOpen, onClose: closeViewer });
  const closeMobileRail = React.useCallback(() => actions.setMobileRailOpen(false), [actions]);
  useResponsiveRail({ open: mobileRailOpen, onClose: closeMobileRail });

  React.useEffect(() => {
    if (!memoryPickerOpen) return;
    void refreshUploads();
    void refreshAssets();
  }, [memoryPickerOpen, refreshAssets, refreshUploads]);

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const media = window.matchMedia("(max-width: 900px)");
    const apply = (matches: boolean) => {
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

  const displayAttachment = React.useMemo<LocalAttachment | null>(() => {
    if (attachment) return attachment;
    if (workingDraft.mediaUrl) {
      const inferredKind = (workingDraft.kind ?? "").toLowerCase();
      const inferredMime = inferredKind.startsWith("video") ? "video/*" : "image/*";
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
        url: workingDraft.mediaUrl,
        progress: 1,
        thumbUrl: null,
      };
    }
    return null;
  }, [
    attachment,
    workingDraft.kind,
    workingDraft.mediaPrompt,
    workingDraft.mediaUrl,
    workingDraft.title,
  ]);

  const attachmentStatusLabel = React.useMemo(() => {
    if (!displayAttachment) return null;
    if (displayAttachment.status === "uploading") {
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

  const handleSuggestionSelect = React.useCallback(
    (promptValue: string) => {
      updateDraft({ content: promptValue });
      window.requestAnimationFrame(() => {
        promptInputRef.current?.focus();
      });
    },
    [updateDraft],
  );

  const baseQuickPromptOptions = React.useMemo(
    () => QUICK_PROMPT_PRESETS[activeKind] ?? QUICK_PROMPT_PRESETS.default,
    [activeKind],
  );

  const quickPromptOptions = React.useMemo(() => {
    if (vibeSuggestions.length) {
      return vibeSuggestions;
    }
    return baseQuickPromptOptions;
  }, [baseQuickPromptOptions, vibeSuggestions]);

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

  const handleSave = React.useCallback(() => {
    if (onSave) {
      onSave(sidebar.selectedProjectId ?? null);
    } else {
      onPost();
    }
  }, [onPost, onSave, sidebar.selectedProjectId]);

  const handlePreviewToggle = React.useCallback(() => {
    actions.setPreviewOpen(!previewOpen);
  }, [actions, previewOpen]);

  const handlePromptSubmit = React.useCallback(() => {
    if (!onPrompt) return;
    if (loading || attachmentUploading) return;
    const trimmed = (workingDraft.content ?? "").trim();
    if (!trimmed) return;

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

    void onPrompt(trimmed, attachments);
  }, [attachmentUploading, loading, onPrompt, readyAttachment, workingDraft.content]);

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

  const canSave = hasDraftContent && !attachmentUploading && !loading;
  const canPost = draftReady && !attachmentUploading && !loading;

  const showWelcomeMessage = !message;

  const [activeSidebarTab, setActiveSidebarTab] = React.useState<SidebarTabKey>("recent");

  const recentSidebarItems: SidebarListItem[] = React.useMemo(
    () =>
      sidebar.recentChats.map((item) => ({
        id: item.id,
        title: item.title,
        subtitle: item.caption,
        onClick: () => onSelectRecentChat(item.id),
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
            itemIcon={<ChatsTeardrop size={18} weight="duotone" />}
            thumbClassName={styles.memoryThumbChat ?? ""}
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
    </div>
  );

  const mainContent = (
    <>
      <div className={styles.chatArea}>
        <div className={styles.chatIntro}>
          <span className={styles.chatBadge}>AI</span>
        </div>
        <div className={styles.chatScroll}>
          <ol className={styles.chatList}>
            {showWelcomeMessage ? (
              <li className={styles.msgRow} data-role="ai">
                <div className={`${styles.msgBubble} ${styles.aiBubble}`}>{PANEL_WELCOME}</div>
              </li>
            ) : null}

            {prompt ? (
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

            {message ? (
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

      <div className={styles.composerBottom}>
        <div className={styles.promptSurface}>
          <button
            type="button"
            className={styles.promptIconBtn}
            aria-label="Attach file"
            onClick={handleAttachClick}
            disabled={loading || attachmentUploading}
          >
            <Paperclip size={18} weight="duotone" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className={styles.hiddenFileInput}
            onChange={handleAttachmentSelect}
            disabled={loading || attachmentUploading}
          />
          <input
            ref={promptInputRef}
            className={styles.promptInput}
            placeholder={promptPlaceholder}
            value={workingDraft.content}
            onChange={(e) => updateDraft({ content: e.target.value })}
            disabled={loading}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handlePromptSubmit();
              }
            }}
          />
          <VoiceRecorder
            isActive={voiceControls.isActive}
            status={voiceControls.status}
            buttonLabel={voiceControls.buttonLabel}
            buttonDisabled={voiceControls.buttonDisabled}
            onToggle={voiceControls.toggle}
            errorMessage={voiceControls.errorMessage}
          />
          <button
            type="button"
            className={styles.promptGenerateBtn}
            onClick={handlePromptSubmit}
            disabled={loading || attachmentUploading || !workingDraft.content.trim()}
          >
            <span className={styles.generateIcon}>
              <Sparkle size={16} weight="fill" />
            </span>
            <span className={styles.generateLabel}>Generate</span>
            <CaretDown size={14} weight="bold" />
          </button>
        </div>

        {voiceControls.hint ? (
          <div
            className={styles.voiceStatus}
            data-state={voiceControls.hintState ?? undefined}
            role="status"
            aria-live="polite"
          >
            {voiceControls.hint}
          </div>
        ) : null}

        <div className={styles.promptPresets}>
          {quickPromptOptions.map((option) => (
            <button
              key={option.prompt}
              type="button"
              className={styles.promptPresetBtn}
              onClick={() => handleSuggestionSelect(option.prompt)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );

  const previewState = React.useMemo(() => {
    const kind = activeKind;
    const label = activeKindLabel;
    const content = (workingDraft.content ?? "").trim();
    const title = (workingDraft.title ?? "").trim();
    const mediaPrompt = (workingDraft.mediaPrompt ?? "").trim();
    const mediaUrl = attachmentDisplayUrl ?? attachmentFullUrl ?? workingDraft.mediaUrl ?? null;
    const attachmentName = displayAttachment?.name ?? null;
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

    switch (kind) {
      case "poll": {
        const poll = pollStructure;
        const question = poll.question.trim();
        const options = poll.options.map((option) => option.trim()).filter(Boolean);
        empty = !question && options.length === 0;
        if (empty) {
          body = renderPlaceholder("Describe the poll you want and the live preview will appear.");
        } else {
          const displayOptions = options.length ? options : ["Option 1", "Option 2", "Option 3"];
          helper = `${displayOptions.length} option${displayOptions.length === 1 ? "" : "s"} ready`;
          body = (
            <div className={styles.previewPollCard}>
              <h3 className={styles.previewPollQuestion}>{question || "Untitled poll"}</h3>
              <ul className={styles.previewPollOptions}>
                {displayOptions.map((option, index) => (
                  <li key={`${option}-${index}`}>
                    <span className={styles.previewPollOptionBullet}>{index + 1}</span>
                    <span className={styles.previewPollOptionLabel}>{option}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        }
        break;
      }
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
                alt={attachmentName ?? mediaPrompt || "Generated visual preview"}
              />
              {mediaPrompt ? <figcaption>{mediaPrompt}</figcaption> : null}
            </figure>
          );
        }
        break;
      }
      case "video": {
        empty = !mediaUrl;
        helper = mediaPrompt || attachmentName;
        if (empty) {
          body = renderPlaceholder("Drop a clip or describe scenes to preview them here.");
        } else {
          body = (
            <figure className={styles.previewMediaFrame} data-kind="video">
              <video src={mediaUrl ?? undefined} controls preload="metadata" />
              {mediaPrompt ? <figcaption>{mediaPrompt}</figcaption> : null}
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

    return { kind, label, body, empty, helper };
  }, [
    activeKind,
    activeKindLabel,
    attachmentDisplayUrl,
    attachmentFullUrl,
    displayAttachment?.name,
    pollStructure,
    workingDraft.content,
    workingDraft.mediaPrompt,
    workingDraft.mediaUrl,
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
    const trimmed = (workingDraft.content ?? "").trim();
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
    workingDraft.content,
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

  const previewContent = (
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

  const mobileMenu = (
    <div className={`${contextMenuStyles.menu} ${styles.mobileRailMenu}`} role="menu">
      <button type="button" className={contextMenuStyles.item}>
        New Chat
      </button>
      <div className={contextMenuStyles.separator} />
      <div className={contextMenuStyles.sectionLabel}>Active Drafts</div>
      <div className={styles.menuEmpty}>No active drafts</div>
      <div className={contextMenuStyles.separator} />
      <div className={contextMenuStyles.sectionLabel}>Projects</div>
      <div className={styles.menuEmpty}>No projects yet</div>
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
        <button
          type="button"
          className={styles.closeIcon}
          onClick={onClose}
          disabled={loading}
          aria-label="Close composer"
        >
          <X size={18} weight="bold" />
        </button>

        <header className={styles.panelToolbar}>
          <div className={styles.toolbarHeading}>
            <h2 className={styles.toolbarTitle}>Composer Studio</h2>
          </div>
          <div
            className={styles.toolbarModes}
            role="tablist"
            aria-label="Select what you want to create"
          >
            {ASSET_KIND_OPTIONS.map((option) => {
              const selected = toggleActiveKey === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={`${styles.modeToggle} ${selected ? styles.modeToggleActive : ""}`}
                  data-selected={selected ? "true" : undefined}
                  onClick={() => handleKindSelect(option.key)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </header>

        <div className={styles.panelBody}>
          <ComposerLayout
            columnsRef={columnsRef}
            mainRef={mainRef}
            layout={layout}
            previewOpen={previewOpen}
            leftRail={leftRail}
            mainContent={mainContent}
            previewContent={previewContent}
            mobileRailOpen={mobileRailOpen}
            onToggleMobileRail={() => actions.setMobileRailOpen(!mobileRailOpen)}
            mobileMenu={mobileMenu}
            onLeftResizeStart={startLeftResize}
            onRightResizeStart={startRightResize}
            onBottomResizeStart={startBottomResize}
          />
        </div>

        <footer className={styles.panelFooter}>
          <div className={styles.footerLeft}>
            <p className={styles.footerHint}>{footerHint}</p>
            <label className={styles.privacyGroup}>
              <span className={styles.privacyLabel}>Visibility</span>
              <select
                aria-label="Visibility"
                className={styles.privacySelect}
                value={privacy}
                onChange={(e) =>
                  actions.setPrivacy((e.target.value as ComposerFormState["privacy"]) ?? "public")
                }
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
              onClick={handleSave}
              disabled={!canSave}
            >
              Save
            </button>
            <button
              type="button"
              className={styles.previewToggle}
              onClick={handlePreviewToggle}
              aria-pressed={previewOpen}
              aria-controls="composer-preview-pane"
            >
              Preview
            </button>
            <button
              type="button"
              className={styles.primaryAction}
              onClick={onPost}
              disabled={!canPost}
            >
              Post
            </button>
          </div>
        </footer>

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

        {viewerOpen && displayAttachment && displayAttachment.status === "ready" ? (
          <div
            className={homeStyles.lightboxOverlay}
            role="dialog"
            aria-modal="true"
            onClick={closeViewer}
          >
            <div
              className={homeStyles.lightboxContent}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className={homeStyles.lightboxClose}
                aria-label="Close preview"
                onClick={closeViewer}
              >
                <X size={18} weight="bold" />
              </button>
              <div className={homeStyles.lightboxBody}>
                <div className={homeStyles.lightboxMedia}>
                  {attachmentKind === "video" ? (
                    <video
                      className={homeStyles.lightboxVideo}
                      src={attachmentFullUrl ?? undefined}
                      controls
                      autoPlay
                    />
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      className={homeStyles.lightboxImage}
                      src={
                        attachmentFullUrl ??
                        attachmentDisplayUrl ??
                        attachmentPreviewUrl ??
                        undefined
                      }
                      alt={displayAttachment.name}
                    />
                  )}
                </div>
                <div className={homeStyles.lightboxCaption}>{displayAttachment.name}</div>
              </div>
              <div className={styles.viewerActions}>
                {vibeSuggestions.map((suggestion) => (
                  <button
                    key={`viewer-${suggestion.prompt}`}
                    type="button"
                    className={styles.viewerActionBtn}
                    onClick={() => {
                      handleSuggestionSelect(suggestion.prompt);
                      closeViewer();
                    }}
                  >
                    {suggestion.label}
                  </button>
                ))}
                <button
                  type="button"
                  className={styles.viewerRemoveBtn}
                  onClick={() => {
                    handleRemoveAttachment();
                    closeViewer();
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}








