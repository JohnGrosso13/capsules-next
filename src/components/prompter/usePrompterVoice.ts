import * as React from "react";

import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import type { RecognitionStatus } from "@/hooks/useSpeechRecognition";

function describeVoiceError(code: string | null): string | null {
  if (!code) return null;
  const normalized = code.toLowerCase();
  if (normalized.includes("not-allowed")) {
    return "Microphone access is blocked. Enable it in your browser settings.";
  }
  if (normalized === "service-not-allowed") {
    return "Microphone access is blocked by your browser.";
  }
  if (normalized === "no-speech") {
    return "Didn't catch that. Try speaking again.";
  }
  if (normalized === "aborted") {
    return null;
  }
  if (normalized === "audio-capture") {
    return "No microphone was detected.";
  }
  if (normalized === "unsupported") {
    return "Voice input isn't supported in this browser.";
  }
  return "Voice input is unavailable right now.";
}

type Options = {
  currentText: string;
  buttonBusy: boolean;
  onTranscript: (text: string) => void;
  onSubmit: () => void;
  onSaveTranscript?: (text: string) => void | Promise<void>;
  closeMenu: () => void;
};

type VoiceHookResult = {
  voiceSupported: boolean;
  voiceStatus: RecognitionStatus;
  voiceStatusMessage: string | null;
  voiceButtonLabel: string;
  handleVoiceToggle: () => void;
};

export function usePrompterVoice(options: Options): VoiceHookResult {
  const {
    currentText,
    buttonBusy,
    onTranscript,
    onSubmit,
    onSaveTranscript,
    closeMenu,
  } = options;
  const [voiceError, setVoiceError] = React.useState<string | null>(null);
  const [voiceDraft, setVoiceDraft] = React.useState<{ session: number; text: string } | null>(null);
  const [pendingVoiceSubmission, setPendingVoiceSubmission] = React.useState<string | null>(null);

  const sessionCounterRef = React.useRef(1);
  const activeVoiceSessionRef = React.useRef<number | null>(null);
  const processedVoiceSessionRef = React.useRef<number | null>(null);

  const {
    supported: voiceSupported,
    status: voiceStatus,
    start: startVoice,
    stop: stopVoice,
  } = useSpeechRecognition({
    onFinalResult: (fullTranscript) => {
      const sessionId = activeVoiceSessionRef.current;
      if (!sessionId) return;
      const normalized = fullTranscript.trim();
      if (!normalized) return;
      onTranscript(normalized);
      setVoiceDraft({ session: sessionId, text: normalized });
    },
    onError: (message) => {
      setVoiceError(message);
    },
  });

  const stopVoiceRef = React.useRef(stopVoice);

  React.useEffect(() => {
    stopVoiceRef.current = stopVoice;
  }, [stopVoice]);

  React.useEffect(
    () => () => {
      stopVoiceRef.current?.();
    },
    [],
  );

  const handleVoiceToggle = React.useCallback(() => {
    if (!voiceSupported) {
      setVoiceError("unsupported");
      return;
    }
    if (voiceStatus === "stopping") return;
    if (voiceStatus === "listening") {
      stopVoice();
      return;
    }
    setVoiceError(null);
    setPendingVoiceSubmission(null);
    const started = startVoice();
    if (started) {
      const sessionId = sessionCounterRef.current;
      sessionCounterRef.current += 1;
      activeVoiceSessionRef.current = sessionId;
      processedVoiceSessionRef.current = null;
      setVoiceDraft(null);
      closeMenu();
    }
  }, [voiceSupported, voiceStatus, startVoice, stopVoice, closeMenu]);

  React.useEffect(() => {
    if (!voiceDraft) return;
    if (voiceStatus !== "idle" && voiceStatus !== "error" && voiceStatus !== "unsupported") return;
    const { session, text } = voiceDraft;
    if (processedVoiceSessionRef.current === session) return;
    processedVoiceSessionRef.current = session;
    activeVoiceSessionRef.current = null;
    const normalized = text.trim();
    if (!normalized) {
      setVoiceDraft(null);
      return;
    }
    setPendingVoiceSubmission(normalized);
    setVoiceDraft(null);
  }, [voiceDraft, voiceStatus]);

  React.useEffect(() => {
    if (!pendingVoiceSubmission) return;
    if (voiceStatus === "listening" || voiceStatus === "stopping") return;
    if (buttonBusy) return;
    if (currentText !== pendingVoiceSubmission) return;
    onSubmit();
    if (onSaveTranscript) {
      void onSaveTranscript(pendingVoiceSubmission);
    }
    setPendingVoiceSubmission(null);
  }, [pendingVoiceSubmission, voiceStatus, buttonBusy, currentText, onSubmit, onSaveTranscript]);

  const voiceStatusMessage =
    voiceStatus === "listening"
      ? "Listening for voice command..."
      : voiceStatus === "stopping"
        ? "Processing your voice command..."
        : describeVoiceError(voiceError);

  const voiceButtonLabel = voiceSupported
    ? voiceStatus === "listening"
      ? "Stop voice capture"
      : "Start voice capture"
    : "Voice input not supported in this browser";

  return {
    voiceSupported,
    voiceStatus,
    voiceStatusMessage,
    voiceButtonLabel,
    handleVoiceToggle,
  };
}
