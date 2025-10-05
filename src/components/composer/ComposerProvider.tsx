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
import { ensurePollStructure, type ComposerDraft } from "@/lib/composer/draft";
import type { ComposerMode } from "@/lib/ai/nav";
import {
  draftPostResponseSchema,
  stylerResponseSchema,
  type DraftPostResponse,
  type StylerResponse,
} from "@/shared/schemas/ai";

function sanitizePollFromDraft(
  draft: ComposerDraft,
): { question: string; options: string[] } | null {
  if (!draft.poll) return null;
  const structured = ensurePollStructure(draft);
  const question = structured.question.trim();
  const options = structured.options
    .map((option) => option.trim())
    .filter((option) => option.length > 0);
  if (!question && !options.length) return null;
  return {
    question,
    options: options.length ? options : ["Yes", "No"],
  };
}

function normalizeDraftFromPost(post: Record<string, unknown>): ComposerDraft {
  const kind = typeof post.kind === "string" ? post.kind.toLowerCase() : "text";
  const content = typeof post.content === "string" ? post.content : "";
  const mediaUrl =
    typeof post.mediaUrl === "string"
      ? post.mediaUrl
      : typeof post.media_url === "string"
        ? String(post.media_url)
        : null;
  const mediaPrompt =
    typeof post.mediaPrompt === "string"
      ? post.mediaPrompt
      : typeof post.media_prompt === "string"
        ? String(post.media_prompt)
        : null;
  let poll: { question: string; options: string[] } | null = null;
  const pollValue = post.poll;
  if (pollValue && typeof pollValue === "object") {
    const pollRecord = pollValue as Record<string, unknown>;
    const question = typeof pollRecord.question === "string" ? pollRecord.question : "";
    const optionsRaw = Array.isArray(pollRecord.options) ? pollRecord.options : [];
    const options = optionsRaw.map((option: unknown) => String(option ?? ""));
    poll = { question, options: options.length ? options : ["", ""] };
  }
  const suggestionsValue = post.suggestions;
  const suggestions = Array.isArray(suggestionsValue)
    ? suggestionsValue
        .map((suggestion: unknown) => {
          if (typeof suggestion === "string") return suggestion.trim();
          if (suggestion == null) return "";
          return String(suggestion).trim();
        })
        .filter((value) => value.length > 0)
    : undefined;
  const draft: ComposerDraft = {
    kind,
    title: typeof post.title === "string" ? post.title : null,
    content,
    mediaUrl,
    mediaPrompt,
    poll,
  };
  if (suggestions && suggestions.length) {
    draft.suggestions = suggestions;
  }
  return draft;
}

function buildPostPayload(
  draft: ComposerDraft,
  rawPost: Record<string, unknown> | null,
  author?: { name: string | null; avatar: string | null },
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    client_id: typeof rawPost?.client_id === "string" ? rawPost.client_id : safeRandomUUID(),
    kind: (draft.kind ?? "text").toLowerCase(),
    content: draft.content ?? "",
    source: rawPost?.source ?? "ai-prompter",
  };
  if (author?.name) {
    payload.userName = author.name;
    payload.user_name = author.name;
  }
  if (author?.avatar) {
    payload.userAvatar = author.avatar;
    payload.user_avatar = author.avatar;
  }
  if (draft.title && draft.title.trim()) payload.title = draft.title.trim();
  if (draft.mediaUrl && draft.mediaUrl.trim()) {
    const media = draft.mediaUrl.trim();
    payload.mediaUrl = media;
  }
  if (draft.mediaPrompt && draft.mediaPrompt.trim()) {
    const prompt = draft.mediaPrompt.trim();
    payload.mediaPrompt = prompt;
    payload.media_prompt = prompt;
  }
  if (draft.kind?.toLowerCase() === "poll") {
    const sanitized = sanitizePollFromDraft(draft);
    if (sanitized) payload.poll = sanitized;
  }
  if (rawPost?.capsule_id) payload.capsule_id = rawPost.capsule_id;
  if (rawPost?.capsuleId) payload.capsuleId = rawPost.capsuleId;
  return payload;
}

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

  const handleAiResponse = React.useCallback((prompt: string, payload: DraftPostResponse) => {
    const draft = normalizeDraftFromPost(payload.post);
    setState(() => ({
      open: true,
      loading: false,
      prompt,
      draft,
      rawPost: payload.post,
      message: payload.message ?? null,
      choices: payload.choices ?? null,
    }));
  }, []);

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
          await persistPost(postPayload, envelopePayload);
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
          applyThemeVars(heuristicPlan.vars);
          return;
        }
        try {
          const response = await callStyler(action.prompt, envelopePayload);
          applyThemeVars(response.vars);
        } catch (error) {
          console.error("Styler action failed", error);
        }
        return;
      }

      if (action.kind === "tool_poll") {
        const prompt = action.prompt;
        setState((prev) => ({ ...prev, open: true, loading: true, prompt, message: null, choices: null }));
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
        setState((prev) => ({ ...prev, open: true, loading: true, prompt, message: null, choices: null }));
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
            rawPost: { kind: "image", mediaUrl: json.url, media_prompt: prompt, source: "ai-prompter" },
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
        setState((prev) => ({ ...prev, open: true, loading: true, prompt, message: null, choices: null }));
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
            rawPost: { kind: "image", mediaUrl: json.url, media_prompt: prompt, source: "ai-prompter" },
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
    [envelopePayload, handleAiResponse],
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
      await persistPost(postPayload, envelopePayload);
      setState(initialState);
      window.dispatchEvent(new CustomEvent("posts:refresh", { detail: { reason: "composer" } }));
    } catch (error) {
      console.error("Composer post failed", error);
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, [state.draft, state.rawPost, author.name, author.avatar, envelopePayload]);

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
      updateDraft,
    };
    if (forceChoice) {
      base.forceChoice = forceChoice;
    }
    return base;
  }, [state, handlePrompterAction, close, post, forceChoice, updateDraft]);

  return <ComposerContext.Provider value={contextValue}>{children}</ComposerContext.Provider>;
}

export function AiComposerRoot() {
  const { state, close, updateDraft, post, forceChoice } = useComposer();

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
      {...forceHandlers}
    />
  );
}
