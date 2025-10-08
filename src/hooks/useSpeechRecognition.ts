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


function useLatestRef<T>(value: T): React.MutableRefObject<T> {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

function useSpeechRecognitionSupport(): {
  supported: boolean;
  status: RecognitionStatus;
  setStatus: React.Dispatch<React.SetStateAction<RecognitionStatus>>;
  recognitionCtorRef: React.MutableRefObject<SpeechRecognitionConstructor | null>;
} {
  const [supported, setSupported] = React.useState(false);
  const [status, setStatus] = React.useState<RecognitionStatus>("unsupported");
  const recognitionCtorRef = React.useRef<SpeechRecognitionConstructor | null>(null);

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

  return { supported, status, setStatus, recognitionCtorRef };
}


function useRecognitionManager(
  recognitionCtorRef: React.MutableRefObject<SpeechRecognitionConstructor | null>,
): {
  recognitionRef: React.MutableRefObject<SpeechRecognitionInstance | null>;
  ensureRecognition: (supported: boolean) => SpeechRecognitionInstance | null;
  cleanupRecognition: () => void;
} {
  const recognitionRef = React.useRef<SpeechRecognitionInstance | null>(null);

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

  const ensureRecognition = React.useCallback(
    (supported: boolean) => {
      if (!supported) return null;
      const ctor = recognitionCtorRef.current;
      if (!ctor) return null;
      if (recognitionRef.current) return recognitionRef.current;
      const recognition = new ctor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognitionRef.current = recognition;
      return recognition;
    },
    [recognitionCtorRef],
  );

  return { recognitionRef, ensureRecognition, cleanupRecognition };
}

function useTranscriptState(
  optionsRef: React.MutableRefObject<UseSpeechRecognitionOptions>,
): {
  transcript: string;
  interimTranscript: string;
  handleResult: (event: RecognitionEvent) => void;
  clearTranscripts: () => void;
} {
  const [transcript, setTranscript] = React.useState("");
  const [interimTranscript, setInterimTranscript] = React.useState("");
  const resultRef = React.useRef("");

  const clearTranscripts = React.useCallback(() => {
    resultRef.current = "";
    setTranscript("");
    setInterimTranscript("");
  }, []);

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
        onInterimResult?.(interimChunk);
      } else {
        setInterimTranscript("");
      }

      if (finalChunk) {
        resultRef.current = resultRef.current ? `${resultRef.current} ${finalChunk}` : finalChunk;
        setTranscript(resultRef.current);
        onFinalResult?.(resultRef.current, finalChunk);
        setInterimTranscript("");
      }
    },
    [optionsRef],
  );

  return { transcript, interimTranscript, handleResult, clearTranscripts };
}


function useSpeechError(
  optionsRef: React.MutableRefObject<UseSpeechRecognitionOptions>,
  setStatus: React.Dispatch<React.SetStateAction<RecognitionStatus>>
): {
  error: string | null;
  reportError: (message: string) => void;
  clearError: () => void;
  handleError: (event: RecognitionErrorEvent) => void;
} {
  const [error, setError] = React.useState<string | null>(null);

  const clearError = React.useCallback(() => setError(null), []);

  const reportError = React.useCallback(
    (message: string) => {
      setError(message);
      setStatus("error");
      optionsRef.current?.onError?.(message);
    },
    [optionsRef, setStatus],
  );

  const handleError = React.useCallback(
    (event: RecognitionErrorEvent) => {
      const message = event?.error || event?.message || "speech-error";
      reportError(message);
    },
    [reportError],
  );

  return { error, reportError, clearError, handleError };
}

function useRecognitionBinding(
  handleResult: (event: RecognitionEvent) => void,
  handleEnd: () => void,
  handleError: (event: RecognitionErrorEvent) => void
): (recognition: SpeechRecognitionInstance) => void {
  return React.useCallback(
    (recognition: SpeechRecognitionInstance) => {
      recognition.onresult = handleResult;
      recognition.onend = handleEnd;
      recognition.onerror = handleError;
      recognition.onaudioend = null;
    },
    [handleEnd, handleError, handleResult],
  );
}


export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {},
): UseSpeechRecognitionReturn {
  const { supported, status, setStatus, recognitionCtorRef } = useSpeechRecognitionSupport();
  const statusRef = useLatestRef(status);
  const optionsRef = useLatestRef(options);

  const { recognitionRef, ensureRecognition, cleanupRecognition } =
    useRecognitionManager(recognitionCtorRef);
  const { transcript, interimTranscript, handleResult, clearTranscripts } =
    useTranscriptState(optionsRef);
  const { error, reportError, clearError, handleError } = useSpeechError(optionsRef, setStatus);

  const handleEnd = React.useCallback(() => {
    if (!supported) {
      setStatus("unsupported");
      return;
    }
    setStatus("idle");
  }, [setStatus, supported]);

  const bindHandlers = useRecognitionBinding(handleResult, handleEnd, handleError);

  const start = React.useCallback(() => {
    if (!supported) {
      setStatus("unsupported");
      return false;
    }

    const recognition = ensureRecognition(supported);
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
      clearTranscripts();
      clearError();
      setStatus("listening");
      recognition.start();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "speech-start-error";
      statusRef.current = "error";
      reportError(message);
      return false;
    }
  }, [
    bindHandlers,
    clearError,
    clearTranscripts,
    ensureRecognition,
    optionsRef,
    reportError,
    setStatus,
    statusRef,
    supported,
  ]);

  const stop = React.useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    if (statusRef.current !== "listening") {
      return;
    }

    statusRef.current = "stopping";
    setStatus("stopping");
    try {
      recognition.stop();
    } catch (err) {
      const message = err instanceof Error ? err.message : "speech-stop-error";
      statusRef.current = "error";
      reportError(message);
    }
  }, [recognitionRef, reportError, setStatus, statusRef]);

  const reset = React.useCallback(() => {
    clearTranscripts();
    clearError();
    const recognition = recognitionRef.current;
    if (recognition) {
      recognition.abort();
      cleanupRecognition();
    }
    if (supported) {
      setStatus("idle");
    } else {
      setStatus("unsupported");
    }
  }, [
    cleanupRecognition,
    clearError,
    clearTranscripts,
    recognitionRef,
    setStatus,
    supported,
  ]);

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

