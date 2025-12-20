"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import styles from "./styles";

import { ComposerLayout } from "./components/ComposerLayout";
import { ComposerFooter } from "./components/ComposerFooter";
import { ComposerViewer } from "./components/ComposerViewer";
import { ComposerMemoryPicker, type MemoryPickerTab } from "./components/ComposerMemoryPicker";
import { ComposerToolbar } from "./components/ComposerToolbar";
import { ComposerMobileSettings } from "./components/ComposerMobileSettings";
import { ComposerMobilePreview } from "./components/ComposerMobilePreview";
import { ComposerSaveDialog } from "./components/ComposerSaveDialog";
import { ThemePreviewBanner } from "./components/ThemePreviewBanner";
import { useComposerFormReducer } from "./hooks/useComposerFormReducer";
import { useComposerLayout } from "./hooks/useComposerLayout";
import { useAttachmentViewer, useResponsiveRail } from "./hooks/useComposerPanels";
import { useComposer } from "./ComposerProvider";
import { usePollBuilder } from "./features/poll-builder/usePollBuilder";
import { PollBuilderCard } from "./features/poll-builder/PollBuilderCard";
import type { ComposerContextSnapshot, ComposerChoice } from "./types";
import type {
  ComposerVideoStatus,
  ComposerSaveStatus,
  ComposerSaveRequest,
  ComposerMemorySavePayload,
  PromptSubmitOptions,
} from "./types";

import type { PrompterAttachment } from "@/components/ai-prompter-stage";
import { isComposerDraftReady, type ComposerDraft } from "@/lib/composer/draft";
import type { ComposerSidebarData } from "@/lib/composer/sidebar-types";
import type { ComposerChatMessage, ComposerChatAttachment } from "@/lib/composer/chat-types";
import { extractFileFromDataTransfer } from "@/lib/clipboard/files";
import type {
  SummaryConversationContext,
  SummaryConversationEntry,
  SummaryPresentationOptions,
} from "@/lib/composer/summary-context";
import type { SummaryResult } from "@/types/summary";
import type { SearchSelectionPayload } from "@/types/search";
import { useCurrentUser } from "@/services/auth/client";
import {
  useAttachmentRail,
  type AttachmentMemoryItem,
} from "./features/attachment-rail/useAttachmentRail";
import { useFeedPreview } from "./features/feed-preview/useFeedPreview";
import { usePromptSurface } from "./features/prompt-surface/usePromptSurface";
import { useSummarySidebar } from "./features/summary-sidebar/useSummarySidebar";
import type { PromptPaneProps, PromptPaneSurfaceProps } from "./panes/PromptPane";
import type { PreviewPaneProps } from "./panes/PreviewPane";
import { useComposerSidebar } from "./hooks/useComposerSidebar";
import {
  type SidebarRailProps,
  type SidebarSectionProps,
  type MobileSidebarMenuProps,
  type SidebarTabKey,
} from "./panes/SidebarPane";
import { useComposerSaveDialog } from "./hooks/useComposerSaveDialog";
import { useComposerMobileLayout } from "./hooks/useComposerMobileLayout";

const PANEL_WELCOME =
  "Hey, I'm your assistant. Tell me what you're building: posts, polls, visuals, documents, tournaments, anything. I'll help you shape it.";

const ASSET_KIND_OPTIONS = [
  { key: "text", label: "Text" },
  { key: "image", label: "Image" },
  { key: "video", label: "Video" },
  { key: "poll", label: "Poll" },
];

const normalizeComposerKind = (kind?: string | null): "text" | "image" | "video" | "poll" => {
  const normalized = (kind ?? "").toLowerCase();
  if (normalized === "image" || normalized === "video" || normalized === "poll") return normalized;
  return "text";
};

const getPromptPlaceholder = (kind?: string | null): string => {
  const normalized = normalizeComposerKind(kind);
  if (normalized === "image") return "Describe the image you want to create.";
  if (normalized === "video") return "Describe the clip or story you want to capture.";
  if (normalized === "poll") return "Ask a question and add options.";
  return "What should we compose?";
};

const getFooterHint = (kind?: string | null): string => {
  const normalized = normalizeComposerKind(kind);
  if (normalized === "image") return "Add a description so we can generate visuals.";
  if (normalized === "video") return "Add context for the edit or clip you want.";
  if (normalized === "poll") return "Add a question and options, then share it.";
  return "";
};

const resolveKindLabel = (kind?: string | null): string => {
  const normalized = normalizeComposerKind(kind);
  const match = ASSET_KIND_OPTIONS.find((option) => option.key === normalized);
  return match?.label ?? "Text";
};

const PromptPane = dynamic<PromptPaneProps>(
  () => import("./panes/PromptPane").then((mod) => mod.PromptPane),
  { ssr: false, loading: () => null },
);

const PreviewPane = dynamic<PreviewPaneProps>(
  () => import("./panes/PreviewPane").then((mod) => mod.PreviewPane),
  { ssr: false, loading: () => null },
);

const SidebarRail = dynamic<SidebarRailProps>(
  () => import("./panes/SidebarPane").then((mod) => mod.SidebarRail),
  { ssr: false, loading: () => null },
);

const SidebarSection = dynamic<SidebarSectionProps>(
  () => import("./panes/SidebarPane").then((mod) => mod.SidebarSection),
  { ssr: false, loading: () => null },
);

const MobileSidebarMenu = dynamic<MobileSidebarMenuProps>(
  () => import("./panes/SidebarPane").then((mod) => mod.MobileSidebarMenu),
  { ssr: false, loading: () => null },
);

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
  loadingKind?: "image" | "video" | null;
  draft: ComposerDraft | null;
  prompt: string;
  message?: string | null | undefined;
  history?: ComposerChatMessage[] | null | undefined;
  choices?: ComposerChoice[] | null | undefined;
  summaryContext?: SummaryConversationContext | null;
  summaryResult?: SummaryResult | null;
  summaryOptions?: SummaryPresentationOptions | null;
  summaryMessageId?: string | null;
  sidebar: ComposerSidebarData;
  videoStatus: ComposerVideoStatus;
  saveStatus: ComposerSaveStatus;
  smartContextEnabled: boolean;
  contextSnapshot?: ComposerContextSnapshot | null;
  themePreview: {
    summary: string;
    details?: string | null;
    source: "heuristic" | "ai";
  } | null;
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
  onPrompt?(
    prompt: string,
    attachments?: PrompterAttachment[] | null,
    options?: PromptSubmitOptions,
  ): Promise<void> | void;
  onApplyThemePreview(): void;
  onCancelThemePreview(): void;
  onRetryVideo(): void;
  onSaveCreation(request: ComposerSaveRequest): Promise<string | null> | Promise<void> | void;
  onRetryLastPrompt(): void;
  canRetryLastPrompt: boolean;
  onCancelRun(): void;
};

export function ComposerForm({
  loading,
  loadingKind = null,
  draft,
  prompt,
  message,
  history: historyInput,
  choices: _choices,
  summaryContext: summaryContextInput,
  summaryResult: summaryResultInput,
  summaryOptions: summaryOptionsInput,
  summaryMessageId: summaryMessageIdInput,
  sidebar,
  videoStatus,
  saveStatus,
  smartContextEnabled,
  contextSnapshot: contextSnapshotInput,
  themePreview,
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
  onApplyThemePreview,
  onCancelThemePreview,
  onForceChoice,
  onRetryVideo,
  onSaveCreation,
  onRetryLastPrompt,
  canRetryLastPrompt,
  onCancelRun,
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
  const summaryEntrySignature = React.useMemo(
    () => summaryEntries.map((entry) => entry.id).join("|"),
    [summaryEntries],
  );
  const summaryResult = summaryResultInput ?? null;
  const summaryOptions = summaryOptionsInput ?? null;
  const summaryMessageId = summaryMessageIdInput ?? null;
  const [summaryCollapsed, setSummaryCollapsed] = React.useState(false);
  const summaryAutoCollapseRef = React.useRef(false);

  React.useEffect(() => {
    summaryAutoCollapseRef.current = false;
    setSummaryCollapsed(false);
  }, [summaryEntrySignature, summaryMessageId]);
  const hasUserMessages = React.useMemo(
    () => conversationHistory.some((entry) => entry.role === "user"),
    [conversationHistory],
  );
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
  const updateDraft = React.useCallback(
    (partial: Partial<ComposerDraft>) => {
      onChange({ ...workingDraft, ...partial });
    },
    [onChange, workingDraft],
  );

  const handlePostContentChange = React.useCallback(
    (value: string) => {
      updateDraft({ content: value });
    },
    [updateDraft],
  );

  const { activeCapsuleId, imageSettings, updateImageSettings } = useComposer();
  const { state, actions } = useComposerFormReducer();
  const { mobileRailOpen, previewOpen, layout, viewerOpen, voice: voiceState } = state;

  const {
    pollStructure,
    pollBodyValue,
    pollQuestionValue,
    pollHelperText,
    hasStructure: pollHasStructure,
    registerPollOptionRef,
    pollQuestionRef,
    handlePollBodyInput,
    handlePollQuestionInput,
    handlePollOptionInput,
    handleAddPollOption,
    handleRemovePollOption,
  } = usePollBuilder({ draft: workingDraft, onDraftChange: updateDraft });

  // If the working poll has no thumbnails but the latest assistant poll in history does,
  // backfill thumbnails so the poll preview shows images returned by the model.
  const latestAssistantPollThumbs = React.useMemo(() => {
    const entry = [...conversationHistory]
      .reverse()
      .find(
        (item) =>
          item?.role === "assistant" &&
          item.poll &&
          Array.isArray(item.poll.thumbnails) &&
          item.poll.thumbnails.some((thumb) => typeof thumb === "string" && thumb.trim().length),
      );
    if (!entry?.poll) return null;
    return {
      options: Array.isArray(entry.poll.options) ? entry.poll.options.map((opt) => `${opt}`.trim()) : [],
      thumbnails: entry.poll.thumbnails ?? [],
    };
  }, [conversationHistory]);

  React.useEffect(() => {
    if (!pollStructure) return;
    const hasThumbs =
      Array.isArray(pollStructure.thumbnails) &&
      pollStructure.thumbnails.some((thumb) => typeof thumb === "string" && thumb.trim().length);
    if (hasThumbs) return;
    if (!latestAssistantPollThumbs) return;
    const normalizedThumbs = pollStructure.options.map((_, index) => {
      const raw = latestAssistantPollThumbs.thumbnails[index];
      if (typeof raw === "string") {
        const trimmed = raw.trim();
        if (trimmed.length) return trimmed;
      }
      return null;
    });
    const hasRecovered = normalizedThumbs.some(Boolean);
    if (!hasRecovered) return;
    updateDraft({
      poll: {
        question: pollStructure.question,
        options: [...pollStructure.options],
        thumbnails: normalizedThumbs,
      },
    });
  }, [latestAssistantPollThumbs, pollStructure, updateDraft]);

  const {
    fileInputRef,
    handleAttachClick,
    handleAttachmentSelect,
    handleAttachmentFile,
    attachRemoteAttachment,
    attachmentUploading,
    readyAttachment,
    displayAttachment,
    attachmentKind,
    attachmentStatusLabel,
    attachmentPreviewUrl,
    attachmentDisplayUrl,
    attachmentFullUrl,
    attachmentProgressPct,
    attachmentCaption,
    attachmentMemoryPrompt,
    removeAttachment: handleRemoveAttachment,
    vibeSuggestions,
    cloudflareEnabled,
    memoryPicker: attachmentMemoryPicker,
  } = useAttachmentRail({
    draft: workingDraft,
    onDraftChange: updateDraft,
    capsuleId: activeCapsuleId ?? null,
    assistantCaption: message ?? null,
  });

  const {
    open: memoryPickerOpen,
    tab: memoryPickerTab,
    uploads: uploadMemories,
    uploadsLoading,
    uploadsError,
    assets: assetMemories,
    assetsLoading,
    assetsError,
    openPicker: openAttachmentPicker,
    closePicker: closeAttachmentPicker,
    onTabChange: onAttachmentTabChange,
  } = attachmentMemoryPicker;

  const { user: currentUser } = useCurrentUser();
  const canRemember = Boolean(currentUser);
  const columnsRef = React.useRef<HTMLDivElement | null>(null);
  const mainRef = React.useRef<HTMLDivElement | null>(null);
  const [activeSidebarTab, setActiveSidebarTab] = React.useState<SidebarTabKey>("recent");
  const {
    saveDialogOpen,
    setSaveDialogOpen,
    saveDialogTarget,
    setSaveDialogTarget,
    saveTitle,
    setSaveTitle,
    saveDescription,
    setSaveDescription,
    saveError,
    setSaveError,
  } = useComposerSaveDialog(saveStatus);
  const {
    isMobileLayout,
    mobileMenuCloseRef,
    mobilePreviewCloseRef,
  } = useComposerMobileLayout({
    actions,
    mobileRailOpen,
    previewOpen,
    closeMobileRail: () => actions.setMobileRailOpen(false),
  });


  const handlePromptPaste = React.useCallback(
    (event: React.ClipboardEvent<HTMLInputElement>) => {
      const file = extractFileFromDataTransfer(event.clipboardData);
      if (!file) return;
      event.preventDefault();
      void handleAttachmentFile(file);
    },
    [handleAttachmentFile],
  );
  const openViewer = React.useCallback(() => actions.viewer.open(), [actions]);
  const closeViewer = React.useCallback(() => actions.viewer.close(), [actions]);


  useComposerLayout({ layout, layoutActions: actions.layout, mainRef });

  useAttachmentViewer({ open: viewerOpen, onClose: closeViewer });
  const closeMobileRail = React.useCallback(() => actions.setMobileRailOpen(false), [actions]);
  useResponsiveRail({ open: mobileRailOpen, onClose: closeMobileRail });

  const activeKind = React.useMemo(() => {
    const normalized = normalizeComposerKind(workingDraft.kind);
    if ((normalized === "text" || !normalized) && attachmentKind) {
      return attachmentKind;
    }
    return normalized;
  }, [attachmentKind, workingDraft.kind]);

  const promptPlaceholder = React.useMemo(() => getPromptPlaceholder(activeKind), [activeKind]);
  const currentPromptPlaceholder = promptPlaceholder;
  const footerHint = React.useMemo(() => getFooterHint(activeKind), [activeKind]);
  const activeKindLabel = React.useMemo(() => resolveKindLabel(activeKind), [activeKind]);

  const {
    promptInputRef,
    promptValue,
    setPromptValue,
    quickPromptOptions,
    quickPromptBubbleOptions,
    handleSuggestionSelect,
    handlePromptSubmit,
    handlePromptRun,
    voiceControls,
  } = usePromptSurface({
    prompt,
    conversationHistory,
    summaryEntries,
    activeKind,
    onPrompt,
    readyAttachment,
    loading,
    attachmentUploading,
    voiceState,
    voiceActions: actions.voice,
    vibeSuggestions,
  });

  const handleSearchSelection = React.useCallback(
    (selection: SearchSelectionPayload) => {
      const normalizedPrompt = (selection.promptText ?? "").trim();
      if (normalizedPrompt.length) {
        setPromptValue((previous) => {
          const existing = (previous ?? "").trim();
          if (!existing.length) return normalizedPrompt;
          return `${existing} ${normalizedPrompt}`;
        });
      }

      if (selection.attachment?.url && !attachmentUploading) {
        attachRemoteAttachment({
          url: selection.attachment.url,
          name: selection.attachment.title ?? selection.title ?? null,
          mimeType: selection.attachment.mimeType ?? null,
          thumbUrl: selection.attachment.thumbUrl ?? null,
        });
      }

      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          promptInputRef.current?.focus();
        });
      }
    },
    [attachmentUploading, attachRemoteAttachment, promptInputRef, setPromptValue],
  );

  const summarySidebar = useSummarySidebar({
    summaryEntries,
    cloudflareEnabled,
    currentUser,
    canRemember,
    handleSuggestionSelect,
    handlePromptRun,
  });
  const {
    summaryPanelOpen,
    setSummaryPanelOpen,
    summaryPreviewEntry,
    setSummaryPreviewEntry,
    summaryPreviewContent,
    handleSummaryAsk: baseHandleSummaryAsk,
    handleSummaryView,
    handleSummaryComment,
  } = summarySidebar;

  React.useEffect(() => {
    if (
      summaryResult &&
      hasUserMessages &&
      !summaryCollapsed &&
      !summaryAutoCollapseRef.current
    ) {
      summaryAutoCollapseRef.current = true;
      setSummaryCollapsed(true);
      setSummaryPanelOpen(false);
    }
  }, [
    hasUserMessages,
    setSummaryPanelOpen,
    summaryCollapsed,
    summaryResult,
  ]);

  const handleSummaryAsk = React.useCallback(
    (entry: SummaryConversationEntry) => {
      baseHandleSummaryAsk(entry);
      summaryAutoCollapseRef.current = true;
      setSummaryCollapsed(true);
      setSummaryPanelOpen(false);
    },
    [baseHandleSummaryAsk, setSummaryCollapsed, setSummaryPanelOpen],
  );

  const handleSummaryReset = React.useCallback(() => {
    summaryAutoCollapseRef.current = true;
    setSummaryCollapsed(false);
    setSummaryPanelOpen(false);
  }, [setSummaryCollapsed, setSummaryPanelOpen]);

  const toggleSummaryPanel = React.useCallback(() => {
    setSummaryPanelOpen((open) => !open);
  }, [setSummaryPanelOpen]);

  const summaryControls = React.useMemo(
    () => ({
      entries: summaryEntries,
      collapsed: summaryCollapsed,
      panelOpen: summaryPanelOpen,
      onPanelToggle: toggleSummaryPanel,
      onReset: handleSummaryReset,
      result: summaryResult,
      options: summaryOptions,
      previewEntry: summaryPreviewEntry,
      onSelectPreviewEntry: setSummaryPreviewEntry,
      onAsk: handleSummaryAsk,
      onComment: handleSummaryComment,
      onView: handleSummaryView,
    }),
    [
      summaryEntries,
      summaryCollapsed,
      summaryPanelOpen,
      toggleSummaryPanel,
      handleSummaryReset,
      summaryResult,
      summaryOptions,
      summaryPreviewEntry,
      setSummaryPreviewEntry,
      handleSummaryAsk,
      handleSummaryComment,
      handleSummaryView,
    ],
  );

  const pollPreviewCard = React.useMemo(
    () => (
      <PollBuilderCard
        pollBodyValue={pollBodyValue}
        pollQuestionValue={pollQuestionValue}
        pollStructure={pollStructure}
        pollQuestionRef={pollQuestionRef}
        registerPollOptionRef={registerPollOptionRef}
        onPollBodyChange={handlePollBodyInput}
        onPollQuestionChange={handlePollQuestionInput}
        onPollOptionChange={handlePollOptionInput}
        onAddPollOption={handleAddPollOption}
        onRemovePollOption={handleRemovePollOption}
      />
    ),
    [
      handleAddPollOption,
      handlePollBodyInput,
      handlePollOptionInput,
      handlePollQuestionInput,
      handleRemovePollOption,
      pollBodyValue,
      pollQuestionRef,
      pollQuestionValue,
      pollStructure,
      registerPollOptionRef,
    ],
  );

  const handleMemoryPickerClose = React.useCallback(() => {
    closeAttachmentPicker();
  }, [closeAttachmentPicker]);

  const handleMemoryPickerOpen = React.useCallback(
    (tab: MemoryPickerTab = "uploads") => {
      openAttachmentPicker(tab);
      closeMobileRail();
    },
    [closeMobileRail, openAttachmentPicker],
  );

  const handleMemoryAttach = React.useCallback(
    (memory: AttachmentMemoryItem) => {
      const primaryUrl =
        memory.fullUrl?.trim() ||
        memory.media_url?.trim() ||
        memory.displayUrl?.trim() ||
        "";
      if (!primaryUrl) return;
      const displayName = memory.title?.trim() || memory.description?.trim() || "Memory asset";
      attachRemoteAttachment({
        url: primaryUrl,
        name: displayName,
        mimeType: memory.media_type ?? null,
        thumbUrl: memory.displayUrl ?? null,
      });
      closeAttachmentPicker();
      closeMobileRail();
      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          promptInputRef.current?.focus();
        });
      }
    },
    [attachRemoteAttachment, closeAttachmentPicker, closeMobileRail, promptInputRef],
  );

  const handleAddAttachmentToPreview = React.useCallback(
    (attachment: ComposerChatAttachment) => {
      const url = (attachment.url ?? "").trim();
      if (!url) return;
      attachRemoteAttachment({
        url,
        name: attachment.name ?? "Generated visual",
        mimeType: attachment.mimeType ?? "image/*",
        thumbUrl: attachment.thumbnailUrl ?? null,
        size: typeof attachment.size === "number" ? attachment.size : null,
      });
      actions.setPreviewOpen(true);
      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          promptInputRef.current?.focus();
        });
      }
    },
    [actions, attachRemoteAttachment, promptInputRef],
  );

  const handleAddPollToPreview = React.useCallback(
    (poll: { question: string; options: string[]; thumbnails?: (string | null)[] | null }) => {
      if (!poll) return;
      const question = typeof poll.question === "string" ? poll.question.trim() : "";
      const optionsRaw = Array.isArray(poll.options) ? poll.options : [];
      const cleanedOptions = optionsRaw
        .map((option) => {
          if (typeof option === "string") return option.trim();
          if (option == null) return "";
          return String(option).trim();
        })
        .filter((option) => option.length);
      const normalizedOptions =
        cleanedOptions.length >= 2
          ? cleanedOptions.slice(0, 6)
          : [...cleanedOptions, "Option 1", "Option 2"].slice(
              0,
              Math.max(2, cleanedOptions.length + 2),
            );
      const thumbnailsRaw = Array.isArray(poll.thumbnails) ? poll.thumbnails : [];
      const normalizedThumbnails = normalizedOptions.map((_, index) => {
        const rawThumb = thumbnailsRaw[index];
        if (typeof rawThumb === "string") {
          const trimmed = rawThumb.trim();
          return trimmed.length ? trimmed : null;
        }
        return null;
      });
      const hasThumbnails = normalizedThumbnails.some(Boolean);
      const nextKind =
        normalizeComposerKind(workingDraft.kind) === "text" ? "poll" : workingDraft.kind;
      updateDraft({
        kind: nextKind,
        poll: {
          question,
          options: normalizedOptions,
          ...(hasThumbnails ? { thumbnails: normalizedThumbnails } : {}),
        },
      });
      actions.setPreviewOpen(true);
      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          pollQuestionRef.current?.focus();
        });
      }
    },
    [actions, pollQuestionRef, updateDraft, workingDraft.kind],
  );

  const handleMemoryTabChange = React.useCallback(
    (tab: MemoryPickerTab) => {
      onAttachmentTabChange(tab);
    },
    [onAttachmentTabChange],
  );

  const handleSidebarTabChange = React.useCallback(
    (tabKey: SidebarTabKey) => {
      setActiveSidebarTab(tabKey);
      actions.layout.setLeftCollapsed(false);
    },
    [actions.layout, setActiveSidebarTab],
  );

  const {
    recentSidebarItems,
    sidebarContent,
    mobileSections,
    mobileMemoriesSection,
    recentModalOpen,
    closeRecentModal,
  } = useComposerSidebar({
    activeSidebarTab,
    sidebar,
    onSelectRecentChat,
    onSelectDraft,
    onSelectProject,
    onCreateProject,
    onForceChoice,
    onMemoryPickerOpen: handleMemoryPickerOpen,
    SidebarSectionComponent: SidebarSection,
  });

  const {
    previewState,
  } = useFeedPreview({
    activeKind,
    activeKindLabel,
    workingDraft,
    displayAttachment,
    attachmentDisplayUrl,
    attachmentFullUrl,
    pollHasStructure,
    pollHelperText,
    pollPreviewCard,
    autoCaption: message ?? null,
    onPostContentChange: handlePostContentChange,
  });


  const handlePreviewToggle = React.useCallback(() => {
    actions.setPreviewOpen(!previewOpen);
  }, [actions, previewOpen]);

  const showVibePrompt = React.useMemo(() => {
    const kind = normalizeComposerKind(workingDraft.kind);
    const hasPollDraft = pollHasStructure && kind === "poll";
    return Boolean(
      displayAttachment &&
        displayAttachment.status === "ready" &&
        !attachmentUploading &&
        !loading &&
        !message &&
        !hasPollDraft,
    );
  }, [attachmentUploading, displayAttachment, loading, message, pollHasStructure, workingDraft.kind]);

  const showQuickPromptBubble = React.useMemo(
    () =>
      !loading &&
      renderedHistory.length === 0 &&
      !message &&
      quickPromptBubbleOptions.length > 0,
    [loading, message, quickPromptBubbleOptions.length, renderedHistory.length],
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
    if (displayAttachment && displayAttachment.status === "uploading" && workingDraft.mediaUrl) {
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
  }, [displayAttachment, updateDraft, workingDraft.kind, workingDraft.mediaUrl]);

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
  }, [savingCreation, setSaveDialogOpen, setSaveDialogTarget, setSaveError]);

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
    setSaveDialogOpen,
    setSaveDialogTarget,
    setSaveDescription,
    setSaveError,
    setSaveTitle,
  ]);

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
    setSaveError,
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

  const handleToggleLeftRail = React.useCallback(() => {
    actions.layout.setLeftCollapsed(!layout.leftCollapsed);
  }, [actions.layout, layout.leftCollapsed]);

  const mobileSettingsSection = (
    <ComposerMobileSettings
      canSave={canSave}
      saving={savingCreation}
      onSave={() => {
        handleSaveClick();
        closeMobileRail();
      }}
    />
  );


  // Intent chips are disabled inside Composer Studio.
  const showPromptPresetsInComposer = false;

  const promptSurfaceProps: PromptPaneSurfaceProps = {
    loading,
    attachmentUploading,
    onAttachClick: handleAttachClick,
    onAttachmentSelect: handleAttachmentSelect,
    fileInputRef,
    promptInputRef,
    promptValue,
    placeholder: currentPromptPlaceholder,
    onPromptChange: setPromptValue,
    onPromptPaste: handlePromptPaste,
    onPromptSubmit: handlePromptSubmit,
    quickPromptOptions,
    onQuickPromptSelect: handleSuggestionSelect,
    showQuickPrompts: showPromptPresetsInComposer && !summaryResult,
    voiceControls,
  };

  const leftRail = (
    <SidebarRail
      collapsed={layout.leftCollapsed}
      activeTab={activeSidebarTab}
      onTabChange={handleSidebarTabChange}
      onToggleCollapse={handleToggleLeftRail}
      content={sidebarContent}
      {...(recentModalOpen
        ? {
            recentModal: {
              open: true,
              items: recentSidebarItems,
              onClose: closeRecentModal,
            },
          }
        : {})}
    />
  );
  const effectiveDisplayAttachment = React.useMemo(() => {
    if (!displayAttachment) return null;
    if ((displayAttachment.source ?? "").toLowerCase() !== "ai") return displayAttachment;
    const displayUrl = (displayAttachment.url ?? "").trim();
    if (!displayUrl) return displayAttachment;
    const hasGeneratedMatch = renderedHistory.some((entry) =>
      Array.isArray(entry.attachments)
        ? entry.attachments.some((attachment) => {
            const role = (attachment.role ?? "").toLowerCase();
            const source = (attachment.source ?? "").toLowerCase();
            const isGenerated = role === "output" || source === "ai";
            if (!isGenerated) return false;
            const url = (attachment.url ?? "").trim();
            const thumb = (attachment.thumbnailUrl ?? "").trim();
            return url === displayUrl || (thumb && thumb === displayUrl);
          })
        : false,
    );
    return hasGeneratedMatch ? null : displayAttachment;
  }, [displayAttachment, renderedHistory]);

  const mainContent = (
    <PromptPane
      summaryControls={summaryControls}
      history={renderedHistory}
      showWelcomeMessage={showWelcomeMessage}
      welcomeMessage={PANEL_WELCOME}
      prompt={prompt}
      message={message}
      loading={loading}
      loadingKind={loadingKind}
      displayAttachment={effectiveDisplayAttachment}
      attachmentKind={attachmentKind}
      attachmentStatusLabel={attachmentStatusLabel ?? null}
      attachmentDisplayUrl={attachmentDisplayUrl ?? null}
      attachmentProgressPct={attachmentProgressPct}
      attachmentUploading={attachmentUploading}
      onRemoveAttachment={handleRemoveAttachment}
      onOpenAttachmentViewer={openViewer}
      videoStatus={videoStatus}
      onRetryVideo={onRetryVideo}
      showVibePrompt={showVibePrompt}
      vibeSuggestions={vibeSuggestions}
      onSuggestionSelect={handleSuggestionSelect}
       showQuickPromptBubble={showQuickPromptBubble}
       quickPromptBubbleOptions={quickPromptBubbleOptions}
       promptSurfaceProps={promptSurfaceProps}
       onAddAttachmentToPreview={handleAddAttachmentToPreview}
       onAddPollToPreview={handleAddPollToPreview}
       canRetryLastPrompt={canRetryLastPrompt}
       onRetryLastPrompt={onRetryLastPrompt}
       smartContextEnabled={smartContextEnabled}
       onEnableContext={() => onSmartContextChange(true)}
       onCancelRun={onCancelRun}
    />
  );

  const previewContent = (
    <PreviewPane
      summaryPreviewContent={summaryPreviewContent}
      previewState={previewState}
    />
  );

  const mobileMenu =
    !isMobileLayout || !mobileRailOpen
      ? null
      : (
          <MobileSidebarMenu
            open={mobileRailOpen}
            onClose={closeMobileRail}
            closeButtonRef={mobileMenuCloseRef}
            onItemSelect={closeMobileRail}
            sections={mobileSections}
            {...(mobileMemoriesSection ? { memoriesSection: mobileMemoriesSection } : {})}
            extraSections={mobileSettingsSection}
          />
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

  return (
    <div className={styles.overlay}>
      <div className={styles.backdrop} />
      <aside className={styles.panel} role="dialog" aria-label="AI Composer">
        <ComposerToolbar
          disabled={loading}
          onSearchSelect={handleSearchSelection}
          onClose={onClose}
        />

        <div className={styles.panelBody}>
          {themePreview ? (
            <ThemePreviewBanner
              summary={themePreview.summary}
              details={themePreview.details ?? null}
              onApply={onApplyThemePreview}
              onCancel={onCancelThemePreview}
            />
          ) : null}
          <ComposerLayout
            columnsRef={columnsRef}
            mainRef={mainRef}
            layout={layout}
            previewOpen={isMobileLayout ? false : previewOpen}
            leftCollapsed={layout.leftCollapsed}
            leftRail={leftRail}
            mainContent={mainContent}
            previewContent={isMobileLayout ? null : previewContent}
            mobileRailOpen={mobileRailOpen}
            onToggleMobileRail={() => actions.setMobileRailOpen(!mobileRailOpen)}
            mobileMenu={mobileMenu}
            onLeftResizeStart={startLeftResize}
            onRightResizeStart={startRightResize}
          />

          <ComposerMobilePreview
            open={isMobileLayout && previewOpen}
            onClose={() => actions.setPreviewOpen(false)}
            closeButtonRef={mobilePreviewCloseRef}
            content={previewContent}
          />
        </div>

        <ComposerFooter
          footerHint={footerHint}
          loading={loading}
          attachmentUploading={attachmentUploading}
          onSave={handleSaveClick}
          onPreviewToggle={handlePreviewToggle}
          previewOpen={previewOpen}
          onPost={onPost}
          canSave={canSave}
          canPost={canPost}
          saving={savingCreation}
          smartContextEnabled={smartContextEnabled}
          contextActive={smartContextEnabled && hasContextSnippets}
          onToggleContext={() => onSmartContextChange(!smartContextEnabled)}
          imageQuality={imageSettings.quality}
          onQualityChange={(quality) => updateImageSettings({ quality })}
        />

        <ComposerSaveDialog
          open={saveDialogOpen}
          saving={savingCreation}
          title={saveTitle}
          description={saveDescription}
          error={saveError ?? saveFailureMessage}
          onTitleChange={setSaveTitle}
          onDescriptionChange={setSaveDescription}
          onClose={handleSaveDialogClose}
          onConfirm={handleSaveConfirm}
        />

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
          attachmentCaption={attachmentCaption}
          attachmentMemoryPrompt={attachmentMemoryPrompt}
          onClose={closeViewer}
          onRemoveAttachment={handleRemoveAttachment}
          onSelectSuggestion={handleSuggestionSelect}
          vibeSuggestions={vibeSuggestions}
        />
      </aside>
    </div>
  );
}
