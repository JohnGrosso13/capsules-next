"use client";

import * as React from "react";
import type { AuthClientUser } from "@/ports/auth-client";
import { useCurrentUser } from "@/services/auth/client";

import { AiComposerDrawer } from "@/components/ai-composer";
import type { ComposerChoice } from "@/components/composer/ComposerForm";
import type { PrompterAction, PrompterAttachment } from "@/components/ai-prompter-stage";
import { applyThemeVars } from "@/lib/theme";
import { resolveStylerHeuristicPlan } from "@/lib/theme/styler-heuristics";
import { safeRandomUUID } from "@/lib/random";
import type { ComposerDraft } from "@/lib/composer/draft";
import { normalizeDraftFromPost } from "@/lib/composer/normalizers";
import { buildPostPayload } from "@/lib/composer/payload";
import type { ComposerMode } from "@/lib/ai/nav";
import {
  draftPostResponseSchema,
  stylerResponseSchema,
  type DraftPostResponse,
  type StylerResponse,
} from "@/shared/schemas/ai";

async function callAiPrompt(
  message: string,
  options?: Record<string, unknown>,
  post?: Record<string, unknown>,
  attachments?: PrompterAttachment[],
): Promise<DraftPostResponse> {
  const body: Record<string, unknown> = { message };
  if (options && Object.keys(options).length) body.options = options;
  if (post) body.post = post;
  if (attachments && attachments.length) {
    body.attachments = attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
      url: attachment.url,
      thumbnailUrl: attachment.thumbnailUrl ?? null,
    }));
  }

  const response = await fetch("/api/ai/prompt", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json) {
    throw new Error(`Prompt request failed (${response.status})`);
  }
  return draftPostResponseSchema.parse(json);
}

async function callStyler(
  prompt: string,
  envelope?: Record<string, unknown> | null,
): Promise<StylerResponse> {
  const body: Record<string, unknown> = { prompt };
  if (envelope && Object.keys(envelope).length) {
    body.user = envelope;
  }
  const response = await fetch("/api/ai/styler", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json) {
    throw new Error(`Styler request failed (${response.status})`);
  }
  return stylerResponseSchema.parse(json);
}

async function persistPost(
  post: Record<string, unknown>,
  userEnvelope?: Record<string, unknown> | null,
) {
  const body: Record<string, unknown> = { post };
  if (userEnvelope && Object.keys(userEnvelope).length) {
    body.user = userEnvelope;
  }
  const response = await fetch("/api/posts", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Post request failed (${response.status})`);
  }
  return response.json().catch(() => null) as Promise<Record<string, unknown> | null>;
}

type ComposerState = {
  open: boolean;
  loading: boolean;
  prompt: string;
  draft: ComposerDraft | null;
  rawPost: Record<string, unknown> | null;
  message: string | null;
  choices: ComposerChoice[] | null;
};

type ComposerContextValue = {
  state: ComposerState;
  handlePrompterAction(action: PrompterAction): void;
  close(): void;
  post(): Promise<void>;
  submitPrompt(prompt: string, attachments?: PrompterAttachment[] | null): Promise<void>;
  forceChoice?(key: string): Promise<void>;
  updateDraft(draft: ComposerDraft): void;
};

const initialState: ComposerState = {
  open: false,
  loading: false,
  prompt: "",
  draft: null,
  rawPost: null,
  message: null,
  choices: null,
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeCapsuleId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return UUID_PATTERN.test(trimmed) ? trimmed : null;
}

function appendCapsuleContext(
  post: Record<string, unknown>,
  capsuleId: string | null,
): Record<string, unknown> {
  if (!capsuleId) return post;
  const hasCapsule =
    (typeof (post as { capsuleId?: unknown }).capsuleId === "string" &&
      ((post as { capsuleId?: string }).capsuleId ?? "").trim().length > 0) ||
    (typeof (post as { capsule_id?: unknown }).capsule_id === "string" &&
      ((post as { capsule_id?: string }).capsule_id ?? "").trim().length > 0);
  if (hasCapsule) return post;
  return {
    ...post,
    capsuleId,
    capsule_id: capsuleId,
  };
}

type FeedTarget = { scope: "home" } | { scope: "capsule"; capsuleId: string | null };
type FeedTargetDetail = { scope?: string | null; capsuleId?: string | null };

const ComposerContext = React.createContext<ComposerContextValue | null>(null);

export function useComposer() {
  const ctx = React.useContext(ComposerContext);
  if (!ctx) throw new Error("useComposer must be used within ComposerProvider");
  return ctx;
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

export function ComposerProvider({ children }: { children: React.ReactNode }) {
  const { user } = useCurrentUser();
  const [state, setState] = React.useState<ComposerState>(initialState);
  const [feedTarget, setFeedTarget] = React.useState<FeedTarget>({ scope: "home" });

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

  const handleAiResponse = React.useCallback(
    (prompt: string, payload: DraftPostResponse) => {
      const rawSource = (payload.post ?? {}) as Record<string, unknown>;
      const rawPost = appendCapsuleContext({ ...rawSource }, activeCapsuleId);
      const draft = normalizeDraftFromPost(rawPost);
      setState(() => ({
        open: true,
        loading: false,
        prompt,
        draft,
        rawPost,
        message: payload.message ?? null,
        choices: payload.choices ?? null,
      }));
    },
    [activeCapsuleId],
  );

  const handlePrompterAction = React.useCallback(
    async (action: PrompterAction) => {
      if (action.kind === "post_manual") {
        const content = action.content.trim();
        if (!content && (!action.attachments || !action.attachments.length)) {
          return;
        }
        setState((prev) => ({ ...prev, loading: true }));
        try {
          const postPayload: Record<string, unknown> = {
            client_id: safeRandomUUID(),
            kind: "text",
            content,
            source: "ai-prompter",
          };
          if (action.attachments?.length) {
            postPayload.attachments = action.attachments;
            const primary = action.attachments[0];
            if (primary?.url) {
              postPayload.mediaUrl = primary.url;
              const primaryMime = primary.mimeType ?? null;
              if (primaryMime) {
                const normalizedKind = primaryMime.startsWith("video/") ? "video" : "image";
                postPayload.kind = normalizedKind;
              } else if (postPayload.kind === "text") {
                postPayload.kind = "image";
              }
            }
          }
          const manualPayload = appendCapsuleContext(postPayload, activeCapsuleId);
          await persistPost(manualPayload, envelopePayload);
          setState(initialState);
          window.dispatchEvent(new CustomEvent("posts:refresh", { detail: { reason: "manual" } }));
        } catch (error) {
          console.error("Manual post failed", error);
          setState((prev) => ({ ...prev, loading: false }));
        }
        return;
      }
      if (action.kind === "style") {
        const heuristicPlan = resolveStylerHeuristicPlan(action.prompt);
        if (heuristicPlan) {
          applyThemeVars(heuristicPlan.variants);
          return;
        }
        try {
          const response = await callStyler(action.prompt, envelopePayload);
          applyThemeVars(response.variants);
        } catch (error) {
          console.error("Styler action failed", error);
        }
        return;
      }

      if (action.kind === "tool_poll") {
        const prompt = action.prompt;
        setState((prev) => ({
          ...prev,
          open: true,
          loading: true,
          prompt,
          message: null,
          choices: null,
        }));
        try {
          const payload = await callAiPrompt(prompt, { prefer: "poll" });
          handleAiResponse(prompt, payload);
        } catch (error) {
          console.error("Poll tool failed", error);
          setState(initialState);
        }
        return;
      }
      // Tool: Logo (generate an image from prompt then open composer)
      if (action.kind === "tool_logo") {
        const prompt = action.prompt;
        setState((prev) => ({
          ...prev,
          open: true,
          loading: true,
          prompt,
          message: null,
          choices: null,
        }));
        try {
          const res = await fetch("/api/ai/image/generate", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt }),
          });
          const json = (await res.json().catch(() => null)) as { url?: string } | null;
          if (!res.ok || !json?.url) throw new Error(`Image generate failed (${res.status})`);
          const draft: ComposerDraft = {
            kind: "image",
            title: null,
            content: "",
            mediaUrl: json.url,
            mediaPrompt: prompt,
            poll: null,
          };
          setState(() => ({
            open: true,
            loading: false,
            prompt,
            draft,
            rawPost: appendCapsuleContext(
              { kind: "image", mediaUrl: json.url, media_prompt: prompt, source: "ai-prompter" },
              activeCapsuleId,
            ),
            message: "Generated a logo concept from your prompt.",
            choices: null,
          }));
        } catch (error) {
          console.error("Logo tool failed", error);
          setState(initialState);
        }
        return;
      }
      // Tool: Image edit/vibe (requires attachment image)
      if (action.kind === "tool_image_edit") {
        const prompt = action.prompt;
        const attachment = action.attachments?.[0] ?? null;
        if (!attachment?.url) return;
        setState((prev) => ({
          ...prev,
          open: true,
          loading: true,
          prompt,
          message: null,
          choices: null,
        }));
        try {
          const res = await fetch("/api/ai/image/edit", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageUrl: attachment.url, instruction: prompt }),
          });
          const json = (await res.json().catch(() => null)) as { url?: string } | null;
          if (!res.ok || !json?.url) throw new Error(`Image edit failed (${res.status})`);
          const draft: ComposerDraft = {
            kind: "image",
            title: null,
            content: "",
            mediaUrl: json.url,
            mediaPrompt: prompt,
            poll: null,
          };
          setState(() => ({
            open: true,
            loading: false,
            prompt,
            draft,
            rawPost: appendCapsuleContext(
              { kind: "image", mediaUrl: json.url, media_prompt: prompt, source: "ai-prompter" },
              activeCapsuleId,
            ),
            message: "Updated your image with those vibes.",
            choices: null,
          }));
        } catch (error) {
          console.error("Image edit tool failed", error);
          setState(initialState);
        }
        return;
      }
      const prompt = action.kind === "post_ai" ? action.prompt : action.text;
      const composeOptions: Record<string, unknown> | undefined =
        action.kind === "post_ai" ? { compose: action.mode as ComposerMode } : undefined;
      setState((prev) => ({
        ...prev,
        open: true,
        loading: true,
        prompt,
        message: null,
        choices: null,
      }));
      try {
        const payload = await callAiPrompt(prompt, composeOptions, undefined, action.attachments);
        handleAiResponse(prompt, payload);
      } catch (error) {
        console.error("AI prompt failed", error);
        setState(initialState);
      }
    },
    [activeCapsuleId, envelopePayload, handleAiResponse],
  );

  const close = React.useCallback(() => setState(initialState), []);

  const post = React.useCallback(async () => {
    if (!state.draft) return;
    setState((prev) => ({ ...prev, loading: true }));
    try {
      const postPayload = buildPostPayload(state.draft, state.rawPost, {
        name: author.name,
        avatar: author.avatar,
      });
      const payloadWithContext = appendCapsuleContext(postPayload, activeCapsuleId);
      await persistPost(payloadWithContext, envelopePayload);
      setState(initialState);
      window.dispatchEvent(new CustomEvent("posts:refresh", { detail: { reason: "composer" } }));
    } catch (error) {
      console.error("Composer post failed", error);
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, [state.draft, state.rawPost, author.name, author.avatar, activeCapsuleId, envelopePayload]);

  const submitPrompt = React.useCallback(
    async (promptText: string, attachments?: PrompterAttachment[] | null) => {
      const trimmed = promptText.trim();
      if (!trimmed) return;
      setState((prev) => ({
        ...prev,
        loading: true,
        prompt: trimmed,
        message: null,
        choices: null,
      }));
      try {
        const payload = await callAiPrompt(
          trimmed,
          undefined,
          state.rawPost ?? undefined,
          attachments && attachments.length ? attachments : undefined,
        );
        handleAiResponse(trimmed, payload);
      } catch (error) {
        console.error("Composer prompt submit failed", error);
        setState((prev) => ({ ...prev, loading: false }));
      }
    },
    [handleAiResponse, state.rawPost],
  );

  const forceChoiceInternal = React.useCallback(
    async (key: string) => {
      if (!state.prompt) return;
      setState((prev) => ({ ...prev, loading: true }));
      try {
        const payload = await callAiPrompt(
          state.prompt,
          { force: key },
          state.rawPost ?? undefined,
        );
        handleAiResponse(state.prompt, payload);
      } catch (error) {
        console.error("Composer force choice failed", error);
        setState((prev) => ({ ...prev, loading: false }));
      }
    },
    [state.prompt, state.rawPost, handleAiResponse],
  );

  const updateDraft = React.useCallback((draft: ComposerDraft) => {
    setState((prev) => ({ ...prev, draft }));
  }, []);

  const forceChoice = state.choices ? forceChoiceInternal : undefined;

  const contextValue = React.useMemo<ComposerContextValue>(() => {
    const base: ComposerContextValue = {
      state,
      handlePrompterAction,
      close,
      post,
      submitPrompt,
      updateDraft,
    };
    if (forceChoice) {
      base.forceChoice = forceChoice;
    }
    return base;
  }, [state, handlePrompterAction, close, post, submitPrompt, forceChoice, updateDraft]);

  return <ComposerContext.Provider value={contextValue}>{children}</ComposerContext.Provider>;
}

export function AiComposerRoot() {
  const { state, close, updateDraft, post, submitPrompt, forceChoice } = useComposer();

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
      draft={state.draft}
      prompt={state.prompt}
      message={state.message}
      choices={state.choices}
      onChange={updateDraft}
      onClose={close}
      onPost={post}
      onPrompt={submitPrompt}
      {...forceHandlers}
    />
  );
}
