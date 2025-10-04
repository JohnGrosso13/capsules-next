"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import styles from "./ai-composer.module.css";
import { ComposerWorkspace } from "@/components/composer/workspace";
import type { ComposerDraft } from "@/lib/composer/draft";
import { ensurePollStructure } from "@/lib/composer/draft";
import { safeRandomUUID } from "@/lib/random";
import type { Artifact, ArtifactBlock } from "@/shared/types/artifacts";
import type { WorkspaceListItem } from "@/components/composer/workspace";
import { usePortalHost } from "@/hooks/usePortalHost";

export type { ComposerDraft } from "@/lib/composer/draft";

type AiComposerDrawerProps = {
  open: boolean;
  draft: ComposerDraft | null;
  prompt: string;
  onClose(): void;
  onSendMessage?(value: string): Promise<void> | void;
};

function buildArtifactFromDraft(draft: ComposerDraft | null, prompt: string): Artifact | null {
  if (!draft) return null;
  const now = new Date().toISOString();
  const blocks: ArtifactBlock[] = [];

  const title = draft.title?.trim() || "Untitled artifact";
  const baseState = { mode: "active" as const };

  if (draft.content && draft.content.trim().length > 0) {
    blocks.push({
      id: safeRandomUUID(),
      type: "text.rich",
      label: "Body",
      state: baseState,
      slots: {
        body: {
          id: "body",
          kind: "text",
          status: "ready",
          value: {
            kind: "text",
            content: draft.content,
            format: "markdown",
          },
        },
      },
    });
  }

  if (draft.mediaUrl) {
    blocks.push({
      id: safeRandomUUID(),
      type: "media.hero",
      label: "Primary media",
      state: baseState,
      slots: {
        media: {
          id: "media",
          kind: "media",
          status: "ready",
          value: {
            kind: "media",
            url: draft.mediaUrl,
            altText: draft.mediaPrompt ?? null,
            descriptors: draft.mediaPrompt ? { prompt: draft.mediaPrompt } : null,
          },
        },
      },
    });
  }

  if (draft.poll) {
    const poll = ensurePollStructure(draft);
    blocks.push({
      id: safeRandomUUID(),
      type: "poll.multi",
      label: "Poll",
      state: baseState,
      slots: {
        config: {
          id: "config",
          kind: "poll",
          status: "ready",
          value: {
            kind: "poll",
            prompt: poll.question,
            options: poll.options.map((option, index) => ({
              id: `option-${index}`,
              label: option,
            })),
          },
        },
      },
    });
  }

  if (!blocks.length) {
    blocks.push({
      id: safeRandomUUID(),
      type: "text.rich",
      label: "Body",
      state: baseState,
      slots: {
        body: {
          id: "body",
          kind: "text",
          status: "ready",
          value: { kind: "text", content: "", format: "markdown" },
        },
      },
    });
  }

  return {
    id: safeRandomUUID(),
    ownerUserId: "composer-local",
    artifactType: "custom",
    status: "draft",
    title,
    description: null,
    version: 1,
    metadata: { source: "legacy-draft", prompt },
    blocks,
    context: prompt
      ? { summary: prompt, tags: draft.kind ? [draft.kind] : undefined }
      : undefined,
    createdAt: now,
    updatedAt: now,
    committedAt: null,
  };
}

export function AiComposerDrawer(props: AiComposerDrawerProps) {
  const { open, draft, prompt, onClose, onSendMessage } = props;
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

  const artifact = React.useMemo(() => buildArtifactFromDraft(draft, prompt), [draft, prompt]);
  const suggestions = React.useMemo(() => draft?.suggestions ?? [], [draft?.suggestions]);
  const references = React.useMemo<WorkspaceListItem[]>(() => {
    if (!draft?.mediaUrl) return [];
    const meta = draft.kind ? draft.kind.toUpperCase() : "MEDIA";
    return [{ id: draft.mediaUrl, title: "Primary media", meta }];
  }, [draft?.mediaUrl, draft?.kind]);

  const handleSend = React.useCallback(async (value: string) => {
    if (!onSendMessage) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    await onSendMessage(trimmed);
  }, [onSendMessage]);

  if (!open || !ready || !host) {
    return null;
  }

  return createPortal(
    <ComposerWorkspace
      artifact={artifact}
      suggestions={suggestions}
      references={references}
      recents={[]}
      onSendMessage={handleSend}
      onClose={onClose}
    />,
    host,
  );
}
