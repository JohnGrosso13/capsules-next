"use client";

import * as React from "react";

import {
  detectIntentHeuristically,
  normalizeIntent,
  type IntentResolution,
  type PromptIntent,
} from "@/lib/ai/intent";
import { resolveNavigationTarget } from "@/lib/ai/nav";
import { intentResponseSchema } from "@/shared/schemas/ai";
import { resolvePrompterPostPlan, type PrompterPostPlan } from "@/lib/prompter/actions";

type UsePrompterIntentOptions = {
  text: string;
  allowNavigation: boolean;
  forceIntent: PromptIntent | null;
  hasAttachment: boolean;
};

export function usePrompterIntent({
  text,
  allowNavigation,
  forceIntent,
  hasAttachment,
}: UsePrompterIntentOptions) {
  const [autoIntent, setAutoIntent] = React.useState<IntentResolution>(() =>
    detectIntentHeuristically(""),
  );
  const [manualIntent, setManualIntent] = React.useState<PromptIntent | null>(null);
  const [isResolving, setIsResolving] = React.useState(false);
  const requestRef = React.useRef(0);

  const trimmed = text.trim();
  const navTarget = React.useMemo(
    () => (allowNavigation ? resolveNavigationTarget(trimmed) : null),
    [allowNavigation, trimmed],
  );
  const postPlan = React.useMemo<PrompterPostPlan>(
    () => resolvePrompterPostPlan(trimmed),
    [trimmed],
  );

  React.useEffect(() => {
    if (forceIntent) {
      const heuristic = detectIntentHeuristically(trimmed);
      setAutoIntent(heuristic);
      setIsResolving(false);
      return;
    }

    const currentText = trimmed;
    if (!currentText) {
      setAutoIntent(detectIntentHeuristically(""));
      setIsResolving(false);
      return;
    }

    const heuristic = detectIntentHeuristically(currentText);
    setAutoIntent(heuristic);

    const controller = new AbortController();
    const requestId = ++requestRef.current;

    setIsResolving(true);

    const timeout = setTimeout(() => {
      fetch("/api/ai/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: currentText }),
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) return null;
          const raw = await res.json().catch(() => null);
          const parsed = intentResponseSchema.safeParse(raw);
          return parsed.success ? parsed.data : null;
        })
        .then((data) => {
          if (!data || requestRef.current !== requestId) return;
          const intent = normalizeIntent(data.intent);
          const postMode =
            data?.postMode === "ai" || data?.postMode === "manual" ? data.postMode : undefined;
          const resolvedConfidence =
            typeof data?.confidence === "number"
              ? Math.max(0, Math.min(1, data.confidence))
              : heuristic.confidence;
          const resolvedReason =
            typeof data?.reason === "string" && data.reason.length ? data.reason : heuristic.reason;
          setAutoIntent({
            intent,
            confidence: resolvedConfidence,
            ...(postMode ? { postMode } : {}),
            ...(resolvedReason ? { reason: resolvedReason } : {}),
            source: data?.source === "ai" ? "ai" : heuristic.source,
          });
        })
        .catch((error) => {
          if ((error as Error)?.name !== "AbortError") {
            console.error("Intent detection error", error);
          }
        })
        .finally(() => {
          if (requestRef.current === requestId) {
            setIsResolving(false);
          }
        });
    }, 150);

    return () => {
      controller.abort();
      clearTimeout(timeout);
      setIsResolving(false);
    };
  }, [forceIntent, trimmed]);

  const baseIntent = hasAttachment && trimmed.length === 0 ? "post" : autoIntent.intent;
  const computedIntent: PromptIntent =
    manualIntent ?? (navTarget ? "navigate" : postPlan.mode !== "none" ? "post" : baseIntent);
  const effectiveIntent: PromptIntent = forceIntent ?? computedIntent;
  const buttonBusy = isResolving && manualIntent === null;

  return {
    autoIntent,
    manualIntent,
    setManualIntent,
    isResolving,
    navTarget,
    postPlan,
    computedIntent,
    effectiveIntent,
    buttonBusy,
  };
}
