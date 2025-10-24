"use strict";

import type { CapsuleStyleSelection } from "./capsule-style";

export type CapsuleImageAttemptEvent = {
  type: "attempt";
  attempt: number;
  model: string;
};

export type CapsuleImagePromptEvent = {
  type: "prompt";
  prompt: string;
  mode: "generate" | "edit" | "fallback";
  assetKind?: string | null;
  style?: CapsuleStyleSelection | null;
  styleSummary?: string | null;
};

export type CapsuleImageRetryEvent = {
  type: "retry";
  attempt: number;
  model: string;
  error: {
    message: string;
    code?: string | null;
    status?: number | null;
    type?: string | null;
  };
  nextDelayMs?: number | null;
};

export type CapsuleImageLogEvent = {
  type: "log";
  level?: "info" | "warn" | "error";
  message: string;
};

export type CapsuleImageSuccessEvent = {
  type: "success";
  url: string;
  imageData?: string | null;
  mimeType?: string | null;
  message?: string | null;
  mode: "generate" | "edit" | "fallback";
  assetKind?: string | null;
};

export type CapsuleImageErrorEvent = {
  type: "error";
  message: string;
  status?: number | null;
  code?: string | null;
};

export type CapsuleImageEvent =
  | CapsuleImageAttemptEvent
  | CapsuleImagePromptEvent
  | CapsuleImageRetryEvent
  | CapsuleImageLogEvent
  | CapsuleImageSuccessEvent
  | CapsuleImageErrorEvent;
