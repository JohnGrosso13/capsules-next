"use client";

import * as React from "react";

import type { PrompterAttachment } from "@/components/ai-prompter-stage";
import type { ComposerChatMessage } from "@/lib/composer/chat-types";
import type { SummaryConversationEntry } from "@/lib/composer/summary-context";
import type { LocalAttachment } from "@/hooks/useAttachmentUpload";

import { useComposerVoice, type ComposerVoiceResult } from "../../hooks/useComposerVoice";
import type { ComposerFormActions, ComposerVoiceState } from "../../hooks/useComposerFormReducer";
import { truncateText } from "../../utils/text";

export type QuickPromptOption = { label: string; prompt: string };

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

type UsePromptSurfaceParams = {
  prompt: string;
  conversationHistory: ComposerChatMessage[];
  summaryEntries: SummaryConversationEntry[];
  activeKind: string;
  onPrompt?: ((prompt: string, attachments?: PrompterAttachment[] | null) => Promise<void> | void) | undefined;
  readyAttachment: LocalAttachment | null;
  loading: boolean;
  attachmentUploading: boolean;
  voiceState: ComposerVoiceState;
  voiceActions: ComposerFormActions["voice"];
  vibeSuggestions: QuickPromptOption[];
};

export type PromptSurfaceController = {
  promptInputRef: React.RefObject<HTMLInputElement | null>;
  promptValue: string;
  setPromptValue: React.Dispatch<React.SetStateAction<string>>;
  quickPromptOptions: QuickPromptOption[];
  quickPromptBubbleOptions: QuickPromptOption[];
  handleSuggestionSelect(nextPrompt: string): void;
  handlePromptSubmit(): void;
  voiceControls: ComposerVoiceResult;
};

export function usePromptSurface({
  prompt,
  conversationHistory,
  summaryEntries,
  activeKind,
  onPrompt,
  readyAttachment,
  loading,
  attachmentUploading,
  voiceState,
  voiceActions,
  vibeSuggestions,
}: UsePromptSurfaceParams): PromptSurfaceController {
  const promptInputRef = React.useRef<HTMLInputElement | null>(null);
  const [promptValue, setPromptValue] = React.useState<string>(() =>
    conversationHistory.length > 0 ? "" : prompt ?? "",
  );
  const lastSubmittedPromptRef = React.useRef<string | null>(null);
  const previousHistoryCountRef = React.useRef(conversationHistory.length);

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

  const handleSuggestionSelect = React.useCallback((nextPrompt: string) => {
    setPromptValue(nextPrompt);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        promptInputRef.current?.focus();
      });
    }
  }, []);

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

  const quickPromptBubbleOptions = React.useMemo(
    () => quickPromptOptions.slice(0, 4),
    [quickPromptOptions],
  );

  const voiceControls = useComposerVoice({
    voiceState,
    voiceActions,
    promptValue,
    setPromptValue,
    promptInputRef,
    loading,
    attachmentUploading,
  });

  return {
    promptInputRef,
    promptValue,
    setPromptValue,
    quickPromptOptions,
    quickPromptBubbleOptions,
    handleSuggestionSelect,
    handlePromptSubmit,
    voiceControls,
  };
}
