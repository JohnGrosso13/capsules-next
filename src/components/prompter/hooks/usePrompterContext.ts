"use client";

import * as React from "react";

import { useComposer } from "@/components/composer/ComposerProvider";
import { useCurrentUser } from "@/services/auth/client";
import { buildMemoryEnvelope } from "@/lib/memory/envelope";
import {
  COMPACT_PROMPTER_PLACEHOLDER,
  COMPACT_VIEWPORT_QUERY,
  DEFAULT_PROMPTER_PLACEHOLDER,
} from "@/lib/prompter/actions";
import {
  SUMMARIZE_FEED_STATUS_EVENT,
  type SummarizeFeedStatusDetail,
} from "@/lib/events";
import type { PromptIntent } from "@/lib/ai/intent";

export type PrompterVariant = "default" | "bannerCustomizer";

export type PrompterVariantConfig = {
  allowAttachments: boolean;
  allowVoice: boolean;
  allowIntentMenu: boolean;
  allowIntentHints: boolean;
  allowTools: boolean;
  allowNavigation: boolean;
  enableDragAndDrop: boolean;
  multilineInput: boolean;
  forceIntent: PromptIntent | null;
  forceButtonLabel: string | null;
};

function buildVariantConfig(variant: PrompterVariant): PrompterVariantConfig {
  if (variant === "bannerCustomizer") {
    return {
      allowAttachments: true,
      allowVoice: true,
      allowIntentMenu: false,
      allowIntentHints: false,
      allowTools: false,
      allowNavigation: false,
      enableDragAndDrop: true,
      multilineInput: false,
      forceIntent: "generate",
      forceButtonLabel: "Generate",
    };
  }
  return {
    allowAttachments: true,
    allowVoice: true,
    allowIntentMenu: true,
    allowIntentHints: true,
    allowTools: true,
    allowNavigation: true,
    enableDragAndDrop: true,
    multilineInput: false,
    forceIntent: null,
    forceButtonLabel: null,
  };
}

export function usePrompterContext(placeholder: string, variant: PrompterVariant) {
  const composerContext = useComposer();
  const activeCapsuleId = composerContext.activeCapsuleId;

  const { user: authUser } = useCurrentUser();
  const userEnvelope = React.useMemo(() => buildMemoryEnvelope(authUser), [authUser]);

  const variantConfig = React.useMemo<PrompterVariantConfig>(
    () => buildVariantConfig(variant),
    [variant],
  );

  const [isCompactViewport, setIsCompactViewport] = React.useState(false);
  const [localStatus, setLocalStatus] = React.useState<string | null>(null);
  const localStatusTimerRef = React.useRef<number | null>(null);

  const clearLocalStatusTimer = React.useCallback(() => {
    if (localStatusTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(localStatusTimerRef.current);
      localStatusTimerRef.current = null;
    }
  }, []);

  const showLocalStatus = React.useCallback(
    (message: string | null, ttl?: number | null) => {
      clearLocalStatusTimer();
      setLocalStatus(message);
      if (message && typeof ttl === "number" && ttl > 0 && typeof window !== "undefined") {
        localStatusTimerRef.current = window.setTimeout(() => {
          setLocalStatus(null);
          localStatusTimerRef.current = null;
        }, ttl);
      }
    },
    [clearLocalStatusTimer],
  );

  React.useEffect(
    () => () => {
      clearLocalStatusTimer();
    },
    [clearLocalStatusTimer],
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia(COMPACT_VIEWPORT_QUERY);

    const updateViewportMatch = () => setIsCompactViewport(media.matches);
    updateViewportMatch();

    const handleChange = (event: MediaQueryListEvent) => setIsCompactViewport(event.matches);

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handleChange);
      return () => media.removeEventListener("change", handleChange);
    }

    if (typeof media.addListener === "function") {
      media.addListener(handleChange);
      return () => media.removeListener(handleChange);
    }

    return undefined;
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleStatus = (event: Event) => {
      const detail = (event as CustomEvent<SummarizeFeedStatusDetail> | null)?.detail ?? null;
      if (!detail) return;
      switch (detail.status) {
        case "started":
          showLocalStatus("Summarizing your feed...");
          break;
        case "busy":
          showLocalStatus("Already working on a feed summary...");
          break;
        case "empty":
          showLocalStatus("No feed posts to summarize yet.", 2600);
          break;
        case "success":
          showLocalStatus("Feed summary ready in Composer.", 3800);
          break;
        case "error":
          showLocalStatus("Couldn't summarize the feed. Try again.", 3600);
          break;
        default:
          break;
      }
    };
    window.addEventListener(SUMMARIZE_FEED_STATUS_EVENT, handleStatus);
    return () => {
      window.removeEventListener(SUMMARIZE_FEED_STATUS_EVENT, handleStatus);
    };
  }, [showLocalStatus]);

  const resolvedPlaceholder =
    placeholder === DEFAULT_PROMPTER_PLACEHOLDER && isCompactViewport
      ? COMPACT_PROMPTER_PLACEHOLDER
      : placeholder;

  return {
    composerContext,
    activeCapsuleId,
    userEnvelope,
    variantConfig,
    resolvedPlaceholder,
    localStatus,
    showLocalStatus,
  };
}
