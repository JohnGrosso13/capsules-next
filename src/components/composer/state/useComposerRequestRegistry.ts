"use client";

import * as React from "react";
import { safeRandomUUID } from "@/lib/random";

export type ComposerRequestRegistry = {
  beginRequestToken(): string;
  isRequestActive(token: string): boolean;
  clearRequestToken(token?: string): void;
  startRequestController(): AbortController;
  clearRequestController(controller?: AbortController | null): void;
  cancelActiveController(reason?: string): void;
  requestAbortRef: React.MutableRefObject<AbortController | null>;
  requestTokenRef: React.MutableRefObject<string | null>;
};

export function useComposerRequestRegistry(): ComposerRequestRegistry {
  const requestTokenRef = React.useRef<string | null>(null);
  const requestAbortRef = React.useRef<AbortController | null>(null);

  const beginRequestToken = React.useCallback(() => {
    const token = safeRandomUUID();
    requestTokenRef.current = token;
    return token;
  }, []);

  const isRequestActive = React.useCallback(
    (token: string) => requestTokenRef.current === token,
    [],
  );

  const clearRequestToken = React.useCallback((token?: string) => {
    if (!token || requestTokenRef.current === token) {
      requestTokenRef.current = null;
    }
  }, []);

  const startRequestController = React.useCallback(() => {
    if (requestAbortRef.current) {
      requestAbortRef.current.abort("composer_request_replaced");
    }
    const controller = new AbortController();
    requestAbortRef.current = controller;
    return controller;
  }, []);

  const clearRequestController = React.useCallback((controller?: AbortController | null) => {
    if (controller && requestAbortRef.current === controller) {
      requestAbortRef.current = null;
    }
  }, []);

  const cancelActiveController = React.useCallback((reason?: string) => {
    if (requestAbortRef.current) {
      requestAbortRef.current.abort(reason ?? "composer_cancelled");
    }
  }, []);

  return {
    beginRequestToken,
    isRequestActive,
    clearRequestToken,
    startRequestController,
    clearRequestController,
    cancelActiveController,
    requestAbortRef,
    requestTokenRef,
  };
}
