"use client";

import * as React from "react";

export type RecognitionStatus = "idle" | "listening" | "stopping" | "unsupported" | "error";

type RecognitionResult = {
  isFinal: boolean;
  length: number;
  item(index: number): RecognitionAlternative;
  [index: number]: RecognitionAlternative;
};

type RecognitionAlternative = {
  transcript: string;
};

type RecognitionResultList = {
  length: number;
  item(index: number): RecognitionResult;
  [index: number]: RecognitionResult;
};

type RecognitionEvent = Event & {
  results: RecognitionResultList;
  resultIndex: number;
};

type RecognitionErrorEvent = Event & {
  error?: string;
  message?: string;
};

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onaudioend: ((event: Event) => void) | null;
  onend: ((event: Event) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onresult: ((event: RecognitionEvent) => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export type UseSpeechRecognitionOptions = {
  language?: string | null;
  onFinalResult?: (fullTranscript: string, chunk: string) => void;
  onInterimResult?: (text: string) => void;
  onError?: (error: string) => void;
};

export type UseSpeechRecognitionReturn = {
  supported: boolean;
  status: RecognitionStatus;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  start: () => boolean;
  stop: () => void;
  reset: () => void;
};

function getRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {},
): UseSpeechRecognitionReturn {
  const [supported, setSupported] = React.useState(false);
  const [status, setStatus] = React.useState<RecognitionStatus>("unsupported");
  const [transcript, setTranscript] = React.useState("");
  const [interimTranscript, setInterimTranscript] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const recognitionCtorRef = React.useRef<SpeechRecognitionConstructor | null>(null);
  const recognitionRef = React.useRef<SpeechRecognitionInstance | null>(null);
  const resultRef = React.useRef("");
  const optionsRef = React.useRef(options);

  React.useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const cleanupRecognition = React.useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    recognition.onresult = null;
    recognition.onend = null;
    recognition.onerror = null;
    recognition.onaudioend = null;
    recognitionRef.current = null;
  }, []);

  React.useEffect(() => () => cleanupRecognition(), [cleanupRecognition]);

  React.useEffect(() => {
    const ctor = getRecognitionConstructor();
    recognitionCtorRef.current = ctor;
    if (ctor) {
      setSupported(true);
      setStatus((prev) => (prev === "unsupported" ? "idle" : prev));
    } else {
      setSupported(false);
      setStatus("unsupported");
    }
  }, []);

  const ensureRecognition = React.useCallback(() => {
    const ctor = recognitionCtorRef.current;
    if (!supported || !ctor) return null;
    if (recognitionRef.current) return recognitionRef.current;
    const recognition = new ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;
    return recognition;
  }, [supported]);

  const handleResult = React.useCallback(
    (event: RecognitionEvent) => {
      let interimChunk = "";
      let finalChunk = "";
      const { onFinalResult, onInterimResult } = optionsRef.current;
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result) continue;
        const primary = result[0] ?? result.item(0);
        const value = (primary?.transcript ?? "").trim();
        if (!value) continue;
        if (result.isFinal) {
          finalChunk = finalChunk ? `${finalChunk} ${value}` : value;
        } else {
          interimChunk = interimChunk ? `${interimChunk} ${value}` : value;
        }
      }
      if (interimChunk) {
        setInterimTranscript(interimChunk);
        if (onInterimResult) onInterimResult(interimChunk);
      } else {
        setInterimTranscript("");
      }
      if (finalChunk) {
        resultRef.current = resultRef.current
          ? `${resultRef.current} ${finalChunk}`
          : finalChunk;
        setTranscript(resultRef.current);
        if (onFinalResult) onFinalResult(resultRef.current, finalChunk);
        setInterimTranscript("");
      }
    },
    [],
  );

  const handleEnd = React.useCallback(() => {
    if (!supported) {
      setStatus("unsupported");
      return;
    }
    setStatus("idle");
  }, [supported]);

  const handleError = React.useCallback((event: RecognitionErrorEvent) => {
    const message = event?.error || event?.message || "speech-error";
    setError(message);
    setStatus("error");
    optionsRef.current?.onError?.(message);
  }, []);

  const bindHandlers = React.useCallback(
    (recognition: SpeechRecognitionInstance) => {
      recognition.onresult = handleResult;
      recognition.onend = handleEnd;
      recognition.onerror = handleError;
      recognition.onaudioend = null;
    },
    [handleEnd, handleError, handleResult],
  );

  const start = React.useCallback(() => {
    if (!supported) {
      setStatus("unsupported");
      return false;
    }
    const recognition = ensureRecognition();
    if (!recognition) {
      setStatus("unsupported");
      return false;
    }
    try {
      bindHandlers(recognition);
      const language = optionsRef.current.language;
      const fallbackLang =
        typeof navigator !== "undefined" && typeof navigator.language === "string"
          ? navigator.language
          : "en-US";
      recognition.lang = language ?? fallbackLang ?? "en-US";
      resultRef.current = "";
      setTranscript("");
      setError(null);
      setInterimTranscript("");
      setStatus("listening");
      recognition.start();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "speech-start-error";
      setError(message);
      setStatus("error");
      optionsRef.current?.onError?.(message);
      return false;
    }
  }, [bindHandlers, ensureRecognition, supported]);

  const stop = React.useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    if (status !== "listening") {
      recognition.stop();
      return;
    }
    setStatus("stopping");
    try {
      recognition.stop();
    } catch (err) {
      const message = err instanceof Error ? err.message : "speech-stop-error";
      setError(message);
      setStatus("error");
      optionsRef.current?.onError?.(message);
    }
  }, [status]);

  const reset = React.useCallback(() => {
    setTranscript("");
    setInterimTranscript("");
    setError(null);
    resultRef.current = "";
    if (!recognitionRef.current) return;
    recognitionRef.current.abort();
    cleanupRecognition();
    if (supported) {
      setStatus("idle");
    } else {
      setStatus("unsupported");
    }
  }, [cleanupRecognition, supported]);

  return {
    supported,
    status,
    transcript,
    interimTranscript,
    error,
    start,
    stop,
    reset,
  };
}
