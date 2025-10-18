"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import styles from "./ai-composer.module.css";
import { ComposerForm, type ComposerChoice } from "./composer/ComposerForm";
import type { ComposerDraft } from "@/lib/composer/draft";
import type { ComposerSidebarData } from "@/lib/composer/sidebar-types";
import { usePortalHost } from "@/hooks/usePortalHost";
import type { PrompterAttachment } from "@/components/ai-prompter-stage";

export type { ComposerDraft } from "@/lib/composer/draft";

type AiComposerDrawerProps = {
  open: boolean;
  loading: boolean;
  draft: ComposerDraft | null;
  prompt: string;
  message?: string | null;
  choices?: ComposerChoice[] | null;
  sidebar: ComposerSidebarData;
  onChange(draft: ComposerDraft): void;
  onClose(): void;
  onPost(): void;
  onSave?(projectId?: string | null): void;
  onPrompt(prompt: string, attachments?: PrompterAttachment[] | null): Promise<void> | void;
  onForceChoice?(key: string): void;
  onSelectRecentChat(id: string): void;
  onSelectDraft(id: string): void;
  onCreateProject(name: string): void;
  onSelectProject(id: string | null): void;
};

export function AiComposerDrawer(props: AiComposerDrawerProps) {
  const {
    open,
    loading,
    draft,
    prompt,
    message,
    choices,
    sidebar,
    onChange,
    onClose,
    onPost,
    onSave,
    onPrompt,
    onForceChoice,
    onSelectRecentChat,
    onSelectDraft,
    onCreateProject,
    onSelectProject,
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
      choices={choices ?? null}
      sidebar={sidebar}
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
      {...(onForceChoice ? { onForceChoice } : {})}
    />,
    host,
  );
}
