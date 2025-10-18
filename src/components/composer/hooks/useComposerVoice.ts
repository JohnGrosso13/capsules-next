"use client";

import * as React from "react";

import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { describeVoiceError, truncateVoiceText } from "../voice-utils";
import type { ComposerDraft } from "@/lib/composer/draft";

import type { ComposerFormActions, ComposerVoiceState } from "./useComposerFormReducer";

type UseComposerVoiceParams = {
  voiceState: ComposerVoiceState;
  voiceActions: ComposerFormActions["voice"];
  workingDraft: ComposerDraft;
  updateDraft: (draft: Partial<ComposerDraft>) => void;
  promptInputRef: React.RefObject<HTMLInputElement | null>;
  loading: boolean;
  attachmentUploading: boolean;
};

export type ComposerVoiceResult = {
  supported: boolean;
  status: ReturnType<typeof useSpeechRecognition>["status"];
  isActive: boolean;
  buttonLabel: string;
  buttonDisabled: boolean;
  hint: string | null;
  hintState: "error" | "active" | "result" | null;
  errorMessage: string | null;
  truncatedInterim: string | null;
  truncatedResult: string | null;
  toggle: () => void;
  stop: () => void;
};

export function useComposerVoice({
  voiceState,
  voiceActions,
  workingDraft,
  updateDraft,
  promptInputRef,
  loading,
  attachmentUploading,
}: UseComposerVoiceParams): ComposerVoiceResult {
  const voiceSessionCounterRef = React.useRef(1);
  const activeVoiceSessionRef = React.useRef<number | null>(null);
  const processedVoiceSessionRef = React.useRef<number | null>(null);

  const { supported, status, start, stop } = useSpeechRecognition({
    onFinalResult: (fullTranscript) => {
      const sessionId = activeVoiceSessionRef.current;
      if (!sessionId) return;
      const normalized = fullTranscript.trim();
      if (!normalized) return;
      voiceActions.setDraft({ session: sessionId, text: normalized });
    },
    onInterimResult: (text) => {
      const normalized = text.trim();
      voiceActions.setInterim(normalized.length ? normalized : null);
    },
    onError: (message) => {
      voiceActions.setError(message);
    },
  });

  const stopVoiceRef = React.useRef(stop);
  React.useEffect(() => {
    stopVoiceRef.current = stop;
  }, [stop]);

  React.useEffect(
    () => () => {
      stopVoiceRef.current?.();
    },
    [],
  );

  const toggle = React.useCallback(() => {
    if (!supported) {
      voiceActions.setError("unsupported");
      return;
    }
    if (status === "stopping") return;
    if (status === "listening") {
      stop();
      return;
    }
    voiceActions.merge({ error: null, lastResult: null, interim: null });
    const started = start();
    if (started) {
      const sessionId = voiceSessionCounterRef.current;
      voiceSessionCounterRef.current += 1;
      activeVoiceSessionRef.current = sessionId;
      processedVoiceSessionRef.current = null;
      voiceActions.setDraft(null);
    }
  }, [voiceActions, start, status, stop, supported]);

  React.useEffect(() => {
    const draft = voiceState.draft;
    if (!draft) return;
    if (status !== "idle" && status !== "error" && status !== "unsupported") return;
    const { session, text } = draft;
    if (processedVoiceSessionRef.current === session) return;
    processedVoiceSessionRef.current = session;
    activeVoiceSessionRef.current = null;
    const normalized = text.trim();
    if (!normalized) {
      voiceActions.setDraft(null);
      return;
    }
    const existing = workingDraft.content ?? "";
    const needsSpace = existing.length > 0 && !/\s$/.test(existing);
    const nextContent = `${existing}${needsSpace ? " " : ""}${normalized}`;
    updateDraft({ content: nextContent });
    voiceActions.merge({
      lastResult: normalized,
      draft: null,
      interim: null,
      error: null,
    });
    window.requestAnimationFrame(() => {
      promptInputRef.current?.focus();
    });
  }, [promptInputRef, status, updateDraft, voiceActions, voiceState.draft, workingDraft.content]);

  React.useEffect(() => {
    if (status === "listening") return;
    if (voiceState.interim) {
      voiceActions.setInterim(null);
    }
  }, [status, voiceActions, voiceState.interim]);

  React.useEffect(() => {
    if (!voiceState.lastResult) return;
    const timeout = window.setTimeout(() => {
      voiceActions.setLastResult(null);
    }, 4000);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [voiceActions, voiceState.lastResult]);

  const isActive = status === "listening" || status === "stopping";
  const buttonLabel = supported
    ? isActive
      ? "Stop voice capture"
      : "Start voice capture"
    : "Voice input isn't supported in this browser.";
  const buttonDisabled = loading || attachmentUploading || status === "stopping" || !supported;

  const truncatedInterim = voiceState.interim ? truncateVoiceText(voiceState.interim) : null;
  const truncatedResult = voiceState.lastResult ? truncateVoiceText(voiceState.lastResult) : null;
  const errorMessage = React.useMemo(
    () => describeVoiceError(voiceState.error),
    [voiceState.error],
  );

  const hint = React.useMemo(() => {
    if (errorMessage) return errorMessage;
    if (isActive) {
      return truncatedInterim ? `Listening: "${truncatedInterim}"` : "Listening for voice input...";
    }
    if (status === "idle" && truncatedResult) {
      return `Captured: "${truncatedResult}"`;
    }
    return null;
  }, [errorMessage, isActive, status, truncatedInterim, truncatedResult]);

  const hintState: ComposerVoiceResult["hintState"] = errorMessage
    ? "error"
    : isActive
      ? "active"
      : truncatedResult
        ? "result"
        : null;

  return {
    supported,
    status,
    isActive,
    buttonLabel,
    buttonDisabled,
    hint,
    hintState,
    errorMessage,
    truncatedInterim,
    truncatedResult,
    toggle,
    stop,
  };
}
