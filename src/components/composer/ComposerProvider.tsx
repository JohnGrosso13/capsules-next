"use client";

import * as React from "react";
import type { AuthClientUser } from "@/ports/auth-client";
import { useCurrentUser } from "@/services/auth/client";

import { AiComposerDrawer } from "@/components/ai-composer";
import type { PrompterAction, PrompterAttachment } from "@/components/ai-prompter-stage";
import type { PrompterHandoff } from "@/components/composer/prompter-handoff";
import { safeRandomUUID } from "@/lib/random";
import type { ComposerDraft } from "@/lib/composer/draft";
import { appendCapsuleContext } from "@/components/composer/state/ai-shared";
import { ComposerSidebarProvider, useComposerSidebarStore } from "./context/SidebarProvider";
import { ComposerSmartContextProvider, useComposerSmartContext } from "./context/SmartContextProvider";
import { ComposerThemeProvider, useComposerTheme, type ThemePreviewState } from "./context/ThemePreviewProvider";
import { useComposerImageSettings } from "@/components/composer/state/useComposerImageSettings";
import { useComposerAi } from "@/components/composer/state/useComposerAi";
import { useComposerRequestRegistry } from "@/components/composer/state/useComposerRequestRegistry";
import { useComposerSidebarActions } from "@/components/composer/state/useComposerSidebarActions";
import { useComposerPromptActions } from "@/components/composer/state/useComposerPromptActions";
import {
  createSelectorStore,
  useSelectorStore,
  type SelectorStore,
} from "@/components/composer/state/composerStore";
import type { ComposerChatMessage } from "@/lib/composer/chat-types";
import { truncateLabel, type ComposerSidebarData, type SidebarDraftListItem } from "@/lib/composer/sidebar-types";
import { buildPostPayload } from "@/lib/composer/payload";
import { persistPost } from "@/services/composer/posts";
import { saveComposerItem } from "@/services/composer/memories";
import type { SummaryResult } from "@/types/summary";
import type { SummaryConversationContext, SummaryPresentationOptions } from "@/lib/composer/summary-context";
import type {
  PromptSubmitOptions,
  ComposerSaveRequest,
  ComposerState,
} from "./types";
import {
  BACKGROUND_REMINDER_KEY,
  shouldPreservePollOptions,
  normalizeCapsuleId,
  createIdleVideoStatus,
  createIdleSaveStatus,
  resetStateWithPreference,
  formatSummaryMessage,
  describeRecentTitle,
  describeDraftTitle,
  describeDraftCaption,
  describeRecentCaption,
  describeRecentSnippet,
  describeProjectCaption,
  mapPrompterAttachmentToChat,
  initialComposerState,
} from "./state/composerState";

type ComposerImageSettings = ReturnType<typeof useComposerImageSettings>["settings"];

type SummaryConversationExtras = {
  context?: SummaryConversationContext | null;
  attachments?: PrompterAttachment[] | null;
};

type ComposerRuntimeValue = {
  feedTarget: FeedTarget;
  activeCapsuleId: string | null;
  smartContextEnabled: boolean;
  setSmartContextEnabled(enabled: boolean): void;
  imageSettings: ComposerImageSettings;
  updateImageSettings(patch: Partial<ComposerImageSettings>): void;
};

type ComposerActionsValue = {
  handlePrompterAction(action: PrompterAction): void;
  handlePrompterHandoff(handoff: PrompterHandoff): void;
  close(): void;
  post(): Promise<void>;
  submitPrompt(
    prompt: string,
    attachments?: PrompterAttachment[] | null,
    options?: PromptSubmitOptions,
  ): Promise<void>;
  showSummary(
    result: SummaryResult,
    options: SummaryPresentationOptions,
    extras?: SummaryConversationExtras,
  ): void;
  forceChoice?: ((key: string) => Promise<void>) | undefined;
  updateDraft(draft: ComposerDraft): void;
  selectRecentChat(id: string): void;
  selectDraft(id: string): void;
  createProject(name: string): void;
  selectProject(id: string | null): void;
  saveDraft(projectId?: string | null): void;
  retryVideo(): void;
  saveCreation(request: ComposerSaveRequest): Promise<string | null>;
  retryLastPrompt(): void;
  cancelActiveRequest(): void;
  resumeFromBackground(): void;
  dismissBackgroundReminder(dontShowAgain?: boolean): void;
};

type ComposerProviderValue = {
  store: SelectorStore<ComposerState>;
  runtime: ComposerRuntimeValue;
  actions: ComposerActionsValue;
};

export type ComposerContextValue = ComposerActionsValue &
  ComposerRuntimeValue & {
    state: ComposerState;
    sidebar: ComposerSidebarData;
    themePreview: ThemePreviewState | null;
    applyThemePreview(): void;
    cancelThemePreview(): void;
  };

type FeedTarget = { scope: "home" } | { scope: "capsule"; capsuleId: string | null };
type FeedTargetDetail = { scope?: string | null; capsuleId?: string | null };

const ComposerContext = React.createContext<ComposerProviderValue | null>(null);

function useComposerContext(): ComposerProviderValue {
  const ctx = React.useContext(ComposerContext);
  if (!ctx) throw new Error("useComposer must be used within ComposerProvider");
  return ctx;
}

function useComposerRuntime(): ComposerRuntimeValue {
  const ctx = useComposerContext();
  return ctx.runtime;
}

export function useComposerActions(): ComposerActionsValue {
  const ctx = useComposerContext();
  return ctx.actions;
}

export function useComposerSelector<Slice>(
  selector: (state: ComposerState) => Slice,
  equality?: (a: Slice, b: Slice) => boolean,
): Slice {
  const ctx = useComposerContext();
  return useSelectorStore(ctx.store, selector, equality ?? Object.is);
}

export function useComposer(): ComposerContextValue {
  const state = useComposerSelector((value) => value);
  const runtime = useComposerRuntime();
  const actions = useComposerActions();
  const { sidebarStore } = useComposerSidebarStore();
  const { themePreview, applyThemePreview, cancelThemePreview } = useComposerTheme();

  const sidebar = React.useMemo<ComposerSidebarData>(() => {
    const recentChats = sidebarStore.recentChats.map((entry) => {
      const caption = describeRecentCaption(entry);
      const snippet = describeRecentSnippet(entry);
      const combined = snippet ? `${caption} - ${snippet}` : caption;
      return {
        id: entry.id,
        title: describeRecentTitle(entry),
        caption: truncateLabel(combined, 120),
      };
    });

    const savedDraftItems: SidebarDraftListItem[] = sidebarStore.drafts.map((entry) => ({
      kind: "draft",
      id: entry.id,
      title: describeDraftTitle(entry),
      caption: describeDraftCaption(entry.updatedAt),
      projectId: entry.projectId ?? null,
    }));

    const choiceItems: SidebarDraftListItem[] = (state.choices ?? []).map((choice) => ({
      kind: "choice",
      key: choice.key,
      title: truncateLabel(choice.label, 70),
      caption: "Blueprint suggestion",
    }));

    const projects = sidebarStore.projects.map((project) => ({
      id: project.id,
      name: truncateLabel(project.name, 60),
      caption: describeProjectCaption(project),
      draftCount: project.draftIds.length,
    }));

    return {
      recentChats,
      drafts: [...choiceItems, ...savedDraftItems],
      projects,
      selectedProjectId: sidebarStore.selectedProjectId,
    };
  }, [sidebarStore, state.choices]);

  const forceChoice = state.choices ? actions.forceChoice : undefined;

  return React.useMemo<ComposerContextValue>(
    () => ({
      state,
      sidebar,
      themePreview,
      applyThemePreview,
      cancelThemePreview,
      ...runtime,
      ...actions,
      forceChoice,
    }),
    [
      applyThemePreview,
      cancelThemePreview,
      forceChoice,
      actions,
      runtime,
      sidebar,
      state,
      themePreview,
    ],
  );
}

function formatAuthor(user: AuthClientUser | null, name: string | null, avatar: string | null) {
  return {
    name,
    avatar,
    toEnvelope(): Record<string, unknown> | null {
      if (!user) return null;
      const envelope: Record<string, unknown> = {
        clerk_id: user.provider === "clerk" ? user.id : null,
        email: user.email,
        full_name: name,
        avatar_url: avatar,
        provider: user.provider ?? "guest",
      };
      envelope.key = user.key ?? (user.provider === "clerk" ? `clerk:${user.id}` : user.id);
      return envelope;
    },
  };
}

type ComposerSessionProviderProps = {
  children: React.ReactNode;
  user: AuthClientUser | null;
};

function ComposerSessionProvider({ children, user }: ComposerSessionProviderProps) {
  const store = React.useMemo(() => createSelectorStore(initialComposerState), []);
  const setState = store.setState;
  const getState = store.getState;
  const [feedTarget, setFeedTarget] = React.useState<FeedTarget>({ scope: "home" });
  const { settings: imageSettings, updateSettings: updateImageSettings } = useComposerImageSettings();
  const { sidebarStore, updateSidebarStore } = useComposerSidebarStore();
  const { smartContextEnabled, setSmartContextEnabled: setSmartContextEnabledContext } =
    useComposerSmartContext();
  const { previewTheme, resetThemePreview } = useComposerTheme();
  const {
    beginRequestToken,
    isRequestActive,
    clearRequestToken,
    startRequestController,
    clearRequestController,
    cancelActiveController,
    requestAbortRef,
    requestTokenRef,
  } = useComposerRequestRegistry();
  const saveResetTimeout = React.useRef<number | null>(null);

  const setSmartContextEnabled = React.useCallback(
    (enabled: boolean) => {
      setSmartContextEnabledContext(enabled);
      if (!enabled) {
        setState((prev) => ({
          ...prev,
          contextSnapshot: null,
        }));
      }
    },
    [setSmartContextEnabledContext, setState],
  );

  const imageRequestOptions = React.useMemo(
    () => ({
      quality: imageSettings.quality,
    }),
    [imageSettings],
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(BACKGROUND_REMINDER_KEY);
    if (stored === "off") {
      setState((prev) => ({
        ...prev,
        backgroundPreference: { remindOnBackground: false },
      }));
    }
  }, [setState]);

  const persistBackgroundPreference = React.useCallback(
    (remindOnBackground: boolean) => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(BACKGROUND_REMINDER_KEY, remindOnBackground ? "on" : "off");
      }
      setState((prev) => ({
        ...prev,
        backgroundPreference: { remindOnBackground },
      }));
    },
    [setState],
  );

  const {
    recordRecentChat,
    selectProject,
    createProject,
    selectSavedDraft,
    selectRecentChat,
    saveDraft,
  } = useComposerSidebarActions({ sidebarStore, updateSidebarStore, setState, getState });

  const pushAssistantError = React.useCallback(
    (content: string, history: ComposerChatMessage[] = []) => {
      const assistantError: ComposerChatMessage = {
        id: safeRandomUUID(),
        role: "assistant",
        content,
        createdAt: new Date().toISOString(),
        attachments: null,
      };
      setState((prev) => ({
        ...prev,
        open: true,
        loading: false,
        loadingKind: null,
        message: content,
        history: history.length ? history.concat(assistantError) : (prev.history ?? []).concat(assistantError),
        backgrounded: false,
        backgroundReadyNotice: null,
        backgroundReminderVisible: false,
      }));
    },
    [setState],
  );

  React.useEffect(
    () => () => {
      if (typeof window !== "undefined" && saveResetTimeout.current) {
        window.clearTimeout(saveResetTimeout.current);
      }
      if (requestAbortRef.current) {
        requestAbortRef.current.abort("composer_unmounted");
      }
    },
    [requestAbortRef],
  );

  const currentUserName = React.useMemo(() => {
    if (!user) return null;
    return user.name ?? user.email ?? null;
  }, [user]);
  const currentUserAvatar = user?.avatarUrl ?? null;

  const author = React.useMemo(
    () => formatAuthor(user, currentUserName, currentUserAvatar),
    [user, currentUserName, currentUserAvatar],
  );
  const envelopePayload = React.useMemo(() => author.toEnvelope(), [author]);
  const activeCapsuleId = React.useMemo(
    () => normalizeCapsuleId(feedTarget.scope === "capsule" ? feedTarget.capsuleId : null),
    [feedTarget],
  );

  const saveCreation = React.useCallback(
    async (request: ComposerSaveRequest): Promise<string | null> => {
      setState((prev) => ({
        ...prev,
        saveStatus: { state: "saving", message: null },
      }));

      if (!envelopePayload) {
        const message = "Sign in to save Capsule creations.";
        setState((prev) => ({
          ...prev,
          saveStatus: { state: "failed", message },
        }));
        return null;
      }

      const payload = request.payload;
      if (!payload.mediaUrl || !payload.title.trim() || !payload.description.trim()) {
        const message = "Creation is missing required media or details.";
        setState((prev) => ({
          ...prev,
          saveStatus: { state: "failed", message },
        }));
        return null;
      }

      try {
        const result = await saveComposerItem({
          payload,
          capsuleId: activeCapsuleId,
          envelope: envelopePayload ?? undefined,
        });
        const memoryId = result.memoryId;

        setState((prev) => {
          let nextDraft = prev.draft;
          let nextVideoStatus = prev.videoStatus;
          if (request.target === "draft" && nextDraft && memoryId) {
            nextDraft = { ...nextDraft, memoryId };
            nextVideoStatus = { ...prev.videoStatus, memoryId };
          }
          return {
            ...prev,
            draft: nextDraft,
            videoStatus: nextVideoStatus,
            saveStatus: {
              state: "succeeded",
              message: result?.message ?? "Saved to Memory.",
            },
          };
        });

        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("memory:refresh", { detail: { reason: "composer-save" } }),
          );
          if (saveResetTimeout.current) {
            window.clearTimeout(saveResetTimeout.current);
          }
          saveResetTimeout.current = window.setTimeout(() => {
            setState((prev) =>
              prev.saveStatus.state === "succeeded"
                ? { ...prev, saveStatus: createIdleSaveStatus() }
                : prev,
            );
          }, 2600);
        }

        return memoryId;
      } catch (error) {
        const message =
          error instanceof Error && error.message ? error.message : "Failed to save creation.";
        setState((prev) => ({
          ...prev,
          saveStatus: { state: "failed", message },
        }));
        if (typeof window !== "undefined") {
          if (saveResetTimeout.current) {
            window.clearTimeout(saveResetTimeout.current);
          }
          saveResetTimeout.current = window.setTimeout(() => {
            setState((prev) =>
              prev.saveStatus.state === "failed"
                ? { ...prev, saveStatus: createIdleSaveStatus() }
                : prev,
            );
          }, 3000);
        }
        return null;
      }
    },
    [activeCapsuleId, envelopePayload, setState],
  );

  React.useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<FeedTargetDetail>).detail ?? {};
      if ((detail.scope ?? "").toLowerCase() === "capsule") {
        setFeedTarget({ scope: "capsule", capsuleId: detail.capsuleId ?? null });
      } else {
        setFeedTarget({ scope: "home" });
      }
    };
    window.addEventListener("composer:feed-target", handler as EventListener);
    return () => window.removeEventListener("composer:feed-target", handler as EventListener);
  }, []);

  const applyAiResponse = useComposerAi({
    activeCapsuleId,
    setState,
    shouldPreservePollOptions,
  });

  const resetComposerState = React.useCallback(
    (overrides?: Partial<ComposerState>) => {
      resetThemePreview();
      setState((prev) => resetStateWithPreference(prev, overrides ?? {}));
    },
    [resetThemePreview, setState],
  );

  const {
    handlePrompterAction,
    handlePrompterHandoff,
    submitPrompt,
    retryVideo,
    retryLastPrompt,
    forceChoice,
  } = useComposerPromptActions({
    activeCapsuleId,
    imageSettings,
    imageRequestOptions,
    smartContextEnabled,
    envelopePayload,
    setState,
    getState,
    applyAiResponse,
    recordRecentChat,
    beginRequestToken,
    isRequestActive,
    clearRequestToken,
    startRequestController,
    clearRequestController,
    pushAssistantError,
    previewTheme,
    resetComposerState,
  });

  const close = React.useCallback(
    () => {
      const snapshot = getState();
      const hasActiveRun = snapshot.loading || snapshot.videoStatus.state === "running";
      if (hasActiveRun) {
        setState((prev) => ({
          ...prev,
          open: false,
          backgrounded: true,
          backgroundReadyNotice: null,
          backgroundReminderVisible: prev.backgroundPreference.remindOnBackground,
        }));
        return;
      }
      cancelActiveController("composer_closed");
      clearRequestToken();
      clearRequestController(requestAbortRef.current);
      resetComposerState();
    },
    [
      cancelActiveController,
      clearRequestController,
      clearRequestToken,
      getState,
      requestAbortRef,
      resetComposerState,
      setState,
    ],
  );

  const cancelActiveRequest = React.useCallback(() => {
    const activeToken = requestTokenRef.current;
    cancelActiveController("composer_cancelled");
    clearRequestToken(activeToken ?? undefined);
    clearRequestController(requestAbortRef.current);
    setState((prev) => {
      const cancelled = prev.loading || prev.videoStatus.state === "running";
      const nextHistory = cancelled
        ? (prev.history ?? []).concat({
            id: safeRandomUUID(),
            role: "assistant",
            content: "Cancelled your request.",
            createdAt: new Date().toISOString(),
            attachments: null,
          })
        : prev.history ?? [];
      const nextMessage = cancelled ? "Cancelled your request." : prev.message;
      return {
        ...prev,
        history: nextHistory,
        message: nextMessage,
        loading: false,
        loadingKind: null,
        backgrounded: false,
        backgroundReadyNotice: null,
        backgroundReminderVisible: false,
        videoStatus: prev.videoStatus.state === "running" ? createIdleVideoStatus() : prev.videoStatus,
      };
    });
  }, [cancelActiveController, clearRequestController, clearRequestToken, requestAbortRef, requestTokenRef, setState]);

  const resumeFromBackground = React.useCallback(() => {
    setState((prev) => ({
      ...prev,
      open: true,
      backgrounded: false,
      backgroundReadyNotice: null,
      backgroundReminderVisible: false,
    }));
  }, [setState]);

  const dismissBackgroundReminder = React.useCallback(
    (dontShowAgain?: boolean) => {
      if (dontShowAgain) {
        persistBackgroundPreference(false);
      }
      setState((prev) => ({
        ...prev,
        backgroundReminderVisible: false,
        ...(dontShowAgain ? { backgroundPreference: { remindOnBackground: false } } : {}),
      }));
    },
    [persistBackgroundPreference, setState],
  );

  const post = React.useCallback(async () => {
    const current = getState();
    if (!current.draft) return;
    setState((prev) => ({
      ...prev,
      loading: true,
      backgrounded: false,
      backgroundReadyNotice: null,
      backgroundReminderVisible: false,
    }));
    try {
      const postPayload = buildPostPayload(current.draft, current.rawPost, {
        name: author.name,
        avatar: author.avatar,
      });
      const payloadWithContext = appendCapsuleContext(postPayload, activeCapsuleId);
      await persistPost(payloadWithContext, envelopePayload);
      resetComposerState();
      window.dispatchEvent(new CustomEvent("posts:refresh", { detail: { reason: "composer" } }));
    } catch (error) {
      console.error("Composer post failed", error);
      const errorMessage =
        error instanceof Error && error.message ? error.message : "Posting failed. Please try again.";
      const assistantError: ComposerChatMessage = {
        id: safeRandomUUID(),
        role: "assistant",
        content: errorMessage,
        createdAt: new Date().toISOString(),
        attachments: null,
      };
      setState((prev) => ({
        ...prev,
        loading: false,
        message: errorMessage,
        history: (prev.history ?? []).concat(assistantError),
        backgrounded: false,
        backgroundReadyNotice: null,
        backgroundReminderVisible: false,
      }));
    }
  }, [
    author.name,
    author.avatar,
    activeCapsuleId,
    envelopePayload,
    getState,
    resetComposerState,
    setState,
  ]);

  const showSummary = React.useCallback(
    (
      result: SummaryResult,
      options: SummaryPresentationOptions,
      extras?: SummaryConversationExtras,
    ) => {
      const attachmentsForChat =
        extras?.attachments?.map((attachment) => mapPrompterAttachmentToChat(attachment)) ?? null;
      const messageId = safeRandomUUID();
      const assistantMessage: ComposerChatMessage = {
        id: messageId,
        role: "assistant",
        content: formatSummaryMessage(result, options),
        createdAt: new Date().toISOString(),
        attachments: attachmentsForChat && attachmentsForChat.length ? attachmentsForChat : null,
      };
      setState((prev) => ({
        ...prev,
        open: true,
        loading: false,
        prompt: "",
        message: null,
        choices: null,
        history: [assistantMessage],
        threadId: safeRandomUUID(),
        summaryContext: extras?.context ?? null,
        summaryResult: result,
        summaryOptions: options,
        summaryMessageId: messageId,
        backgrounded: false,
        backgroundReadyNotice: null,
        backgroundReminderVisible: false,
      }));
    },
    [setState],
  );
  const updateDraft = React.useCallback((draft: ComposerDraft) => {
    setState((prev) => ({ ...prev, draft }));
  }, [setState]);

  const actions = React.useMemo<ComposerActionsValue>(
    () => ({
      handlePrompterAction,
      handlePrompterHandoff,
      close,
      post,
      submitPrompt,
      showSummary,
      forceChoice,
      updateDraft,
      selectRecentChat,
      selectDraft: selectSavedDraft,
      createProject,
      selectProject,
      saveDraft,
      retryVideo,
      saveCreation,
      retryLastPrompt,
      cancelActiveRequest,
      resumeFromBackground,
      dismissBackgroundReminder,
    }),
    [
      close,
      createProject,
      dismissBackgroundReminder,
      forceChoice,
      handlePrompterAction,
      handlePrompterHandoff,
      post,
      retryLastPrompt,
      retryVideo,
      cancelActiveRequest,
      resumeFromBackground,
      saveCreation,
      saveDraft,
      selectProject,
      selectRecentChat,
      selectSavedDraft,
      showSummary,
      submitPrompt,
      updateDraft,
    ],
  );

  const runtime = React.useMemo<ComposerRuntimeValue>(
    () => ({
      feedTarget,
      activeCapsuleId,
      smartContextEnabled,
      setSmartContextEnabled,
      imageSettings,
      updateImageSettings,
    }),
    [feedTarget, activeCapsuleId, smartContextEnabled, setSmartContextEnabled, imageSettings, updateImageSettings],
  );

  const providerValue = React.useMemo<ComposerProviderValue>(
    () => ({
      store,
      runtime,
      actions,
    }),
    [store, runtime, actions],
  );

  return <ComposerContext.Provider value={providerValue}>{children}</ComposerContext.Provider>;
}

export function ComposerProvider({ children }: { children: React.ReactNode }) {
  const { user } = useCurrentUser();
  return (
    <ComposerSidebarProvider userId={user?.id ?? null}>
      <ComposerSmartContextProvider>
        <ComposerThemeProvider>
          <ComposerSessionProvider user={user}>{children}</ComposerSessionProvider>
        </ComposerThemeProvider>
      </ComposerSmartContextProvider>
    </ComposerSidebarProvider>
  );
}

export function AiComposerRoot() {
  const {
    state,
    themePreview,
    smartContextEnabled,
    close,
    updateDraft,
    post,
    submitPrompt,
    forceChoice,
    sidebar,
    selectRecentChat,
    selectDraft,
    createProject,
    selectProject,
    saveDraft,
    retryVideo,
    saveCreation,
    setSmartContextEnabled,
    applyThemePreview,
    cancelThemePreview,
    retryLastPrompt,
    cancelActiveRequest,
  } = useComposer();

  const forceHandlers = forceChoice
    ? {
        onForceChoice: (key: string) => {
          void forceChoice(key);
        },
      }
    : {};

  return (
    <AiComposerDrawer
      open={state.open}
      loading={state.loading}
      loadingKind={state.loadingKind}
      draft={state.draft}
      prompt={state.prompt}
      message={state.message}
      choices={state.choices}
      history={state.history}
      summaryContext={state.summaryContext}
      summaryResult={state.summaryResult}
      summaryOptions={state.summaryOptions}
      summaryMessageId={state.summaryMessageId}
      videoStatus={state.videoStatus}
      saveStatus={state.saveStatus}
      smartContextEnabled={smartContextEnabled}
      contextSnapshot={state.contextSnapshot}
      themePreview={
        themePreview
          ? {
              summary: themePreview.summary,
              details: themePreview.details ?? null,
              source: themePreview.source,
            }
          : null
      }
      onSmartContextChange={setSmartContextEnabled}
      onChange={updateDraft}
      onClose={close}
      onPost={post}
      onPrompt={submitPrompt}
      sidebar={sidebar}
      onSelectRecentChat={selectRecentChat}
      onSelectDraft={selectDraft}
      onCreateProject={createProject}
      onSelectProject={selectProject}
      onApplyThemePreview={applyThemePreview}
      onCancelThemePreview={cancelThemePreview}
      onSave={saveDraft}
      onRetryVideo={retryVideo}
      onSaveCreation={saveCreation}
      onRetryLastPrompt={retryLastPrompt}
      canRetryLastPrompt={Boolean(state.lastPrompt) && !state.loading}
      onCancelRun={cancelActiveRequest}
      {...forceHandlers}
    />
  );
}
