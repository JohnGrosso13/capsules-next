"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";

import styles from "./composer/styles";
import type { ComposerChoice } from "./composer/ComposerForm";
import type { ComposerContextSnapshot } from "./composer/ComposerProvider";
import type {
  ComposerVideoStatus,
  ComposerSaveStatus,
  ComposerSaveRequest,
} from "./composer/types";
import type { ComposerDraft } from "@/lib/composer/draft";
import type { ComposerSidebarData } from "@/lib/composer/sidebar-types";
import { usePortalHost } from "@/hooks/usePortalHost";
import type { PrompterAttachment } from "@/components/ai-prompter-stage";
import type { SummaryConversationContext, SummaryPresentationOptions } from "@/lib/composer/summary-context";
import type { SummaryResult } from "@/types/summary";
import type { ComposerChatMessage } from "@/lib/composer/chat-types";
import type { PromptSubmitOptions } from "./composer/types";

export type { ComposerDraft } from "@/lib/composer/draft";

const ComposerForm = dynamic(
  () => import("./composer/ComposerForm").then((mod) => mod.ComposerForm),
  { ssr: false, loading: () => null },
);

type AiComposerDrawerProps = {
  open: boolean;
  loading: boolean;
  draft: ComposerDraft | null;
  prompt: string;
  message?: string | null;
  choices?: ComposerChoice[] | null;
  history?: ComposerChatMessage[] | null;
  summaryContext?: SummaryConversationContext | null;
  summaryResult?: SummaryResult | null;
  summaryOptions?: SummaryPresentationOptions | null;
  summaryMessageId?: string | null;
  sidebar: ComposerSidebarData;
  videoStatus: ComposerVideoStatus;
  saveStatus: ComposerSaveStatus;
  smartContextEnabled: boolean;
  contextSnapshot: ComposerContextSnapshot | null;
  themePreview?: {
    summary: string;
    details?: string | null;
    source: "heuristic" | "ai";
  } | null;
  onSmartContextChange(enabled: boolean): void;
  onChange(draft: ComposerDraft): void;
  onClose(): void;
  onPost(): void;
  onSave?(projectId?: string | null): void;
  onPrompt(
    prompt: string,
    attachments?: PrompterAttachment[] | null,
    options?: PromptSubmitOptions,
  ): Promise<void> | void;
  onApplyThemePreview(): void;
  onCancelThemePreview(): void;
  onForceChoice?(key: string): void;
  onSelectRecentChat(id: string): void;
  onSelectDraft(id: string): void;
  onCreateProject(name: string): void;
  onSelectProject(id: string | null): void;
  onRetryVideo(): void;
  onSaveCreation(request: ComposerSaveRequest): Promise<string | null> | Promise<void> | void;
};

export function AiComposerDrawer(props: AiComposerDrawerProps) {
  const {
    open,
    loading,
    draft,
    prompt,
    message,
    choices,
    history,
    summaryContext,
    summaryResult,
    summaryOptions,
    summaryMessageId,
    sidebar,
    videoStatus,
    saveStatus,
    smartContextEnabled,
    contextSnapshot,
    themePreview,
    onSmartContextChange,
    onChange,
    onClose,
    onPost,
    onSave,
    onPrompt,
    onApplyThemePreview,
    onCancelThemePreview,
    onForceChoice,
    onSelectRecentChat,
    onSelectDraft,
    onCreateProject,
    onSelectProject,
    onRetryVideo,
    onSaveCreation,
  } = props;
  const portalClassName = styles.portalHost ?? "ai-composer-portal-host";
  const { host, ready } = usePortalHost(portalClassName, open);

  React.useEffect(() => {
    if (!open || !ready) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, ready, onClose]);

  React.useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open || !ready || !host) {
    return null;
  }

  return createPortal(
    <ComposerForm
      loading={loading}
      draft={draft}
      prompt={prompt}
      message={message ?? null}
      history={history ?? []}
      choices={choices ?? null}
      summaryContext={summaryContext ?? null}
      summaryResult={summaryResult ?? null}
      summaryOptions={summaryOptions ?? null}
      summaryMessageId={summaryMessageId ?? null}
      sidebar={sidebar}
      videoStatus={videoStatus}
      saveStatus={saveStatus}
      smartContextEnabled={smartContextEnabled}
      contextSnapshot={contextSnapshot}
      themePreview={themePreview ?? null}
      onSmartContextChange={onSmartContextChange}
      onChange={onChange}
      onClose={onClose}
      onPost={onPost}
      onSave={
        onSave ??
        ((projectId?: string | null) => {
          void projectId;
          onPost();
        })
      }
      onPrompt={onPrompt}
      onSelectRecentChat={onSelectRecentChat}
      onSelectDraft={onSelectDraft}
      onCreateProject={onCreateProject}
      onSelectProject={onSelectProject}
      onApplyThemePreview={onApplyThemePreview}
      onCancelThemePreview={onCancelThemePreview}
      {...(onForceChoice ? { onForceChoice } : {})}
      onRetryVideo={onRetryVideo}
      onSaveCreation={onSaveCreation}
    />,
    host,
  );
}
