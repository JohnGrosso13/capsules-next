"use client";

import * as React from "react";

import { safeRandomUUID } from "@/lib/random";
import type { PrompterAttachment } from "@/components/ai-prompter-stage";
import type { ComposerState } from "../ComposerProvider";
import type { ComposerDraft } from "@/lib/composer/draft";
import type { ComposerChatMessage } from "@/lib/composer/chat-types";

export type ComposerCoreActions = {
  setDraft(draft: ComposerDraft | null): void;
  setLoading(loading: boolean): void;
  setHistory(updater: (prev: ComposerChatMessage[]) => ComposerChatMessage[]): void;
  enqueueUserMessage(content: string, attachments?: PrompterAttachment[] | null): {
    message: ComposerChatMessage;
    threadId: string;
  };
  reset(overrides?: Partial<ComposerState>): void;
};

type ComposerCoreApi = {
  state: ComposerState;
  setState: React.Dispatch<React.SetStateAction<ComposerState>>;
  actions: ComposerCoreActions;
};

export function useComposerCore(initial: ComposerState): ComposerCoreApi {
  const [state, setState] = React.useState<ComposerState>(initial);

  const actions = React.useMemo<ComposerCoreActions>(
    () => ({
      setDraft(draft) {
        setState((prev) => ({ ...prev, draft }));
      },
      setLoading(loading) {
        setState((prev) => ({ ...prev, loading }));
      },
      setHistory(updater) {
        setState((prev) => ({ ...prev, history: updater(prev.history ?? []) }));
      },
      enqueueUserMessage(content, attachments) {
        const message: ComposerChatMessage = {
          id: safeRandomUUID(),
          role: "user",
          content,
          createdAt: new Date().toISOString(),
          attachments:
            attachments?.map((attachment) => ({
              id: attachment.id,
              role: attachment.role ?? "reference",
              name: attachment.name,
              mimeType: attachment.mimeType,
              size: attachment.size,
              url: attachment.url,
              thumbnailUrl: attachment.thumbnailUrl ?? null,
              storageKey: attachment.storageKey ?? null,
              sessionId: attachment.sessionId ?? null,
              source: attachment.source ?? "user",
            })) ?? null,
        };
        let nextThreadId = safeRandomUUID();
        setState((prev) => {
          const resolvedThreadId = prev.threadId ?? nextThreadId;
          nextThreadId = resolvedThreadId;
          return {
            ...prev,
            history: [...(prev.history ?? []), message],
            threadId: resolvedThreadId,
          };
        });
        return { message, threadId: nextThreadId };
      },
      reset(overrides) {
        setState(() => ({
          ...initial,
          ...overrides,
        }));
      },
    }),
    [initial, setState],
  );

  return { state, setState, actions };
}
