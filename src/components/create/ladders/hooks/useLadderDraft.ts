import * as React from "react";

import type { trackLadderEvent } from "@/lib/telemetry/ladders";

import type { GuidedStepId } from "../guidedConfig";
import type { LadderBuilderFormState } from "../builderState";
import type { LadderMemberFormValues, LadderSeedFormValues } from "../ladderFormState";

export type PersistedLadderDraft = {
  version: 1;
  updatedAt: number;
  form: LadderBuilderFormState;
  members: LadderMemberFormValues[];
  seed: LadderSeedFormValues;
  meta: Record<string, unknown>;
  guidedStep?: GuidedStepId;
};

type UseLadderDraftOptions = {
  storageKey: string | null;
  serializeDraft: () => Omit<PersistedLadderDraft, "version" | "updatedAt">;
  hydrateDraft: (draft: PersistedLadderDraft) => void;
  resetToDefaults: () => void;
  capsuleId: string | null;
  onDraftRestored?: (restoredAt: number) => void;
  onAutosaveSuccess?: (updatedAt: number) => void;
  onAutosaveError?: (error: unknown) => void;
  onHydrationError?: (error: unknown) => void;
  tracker?: typeof trackLadderEvent;
};

type DraftStatus = "idle" | "saving" | "saved" | "error";

type UseLadderDraftResult = {
  draftStatus: DraftStatus;
  lastDraftSavedAt: number | null;
  draftRestoredAt: number | null;
  canDiscardDraft: boolean;
  discardDraft: () => void;
};

export const useLadderDraft = (options: UseLadderDraftOptions): UseLadderDraftResult => {
  const {
    storageKey,
    serializeDraft,
    hydrateDraft,
    resetToDefaults,
    capsuleId,
    onDraftRestored,
    onAutosaveSuccess,
    onAutosaveError,
    onHydrationError,
    tracker,
  } = options;
  const [draftStatus, setDraftStatus] = React.useState<DraftStatus>("idle");
  const [lastDraftSavedAt, setLastDraftSavedAt] = React.useState<number | null>(null);
  const [draftRestoredAt, setDraftRestoredAt] = React.useState<number | null>(null);
  const draftHydratedRef = React.useRef(false);
  const autosaveTimer = React.useRef<number | null>(null);
  const autosaveStartedAt = React.useRef<number | null>(null);
  const prevStorageKeyRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (prevStorageKeyRef.current === storageKey) return;
    prevStorageKeyRef.current = storageKey;
    draftHydratedRef.current = false;
    setDraftStatus("idle");
    setLastDraftSavedAt(null);
    setDraftRestoredAt(null);
  }, [storageKey]);

  React.useEffect(() => {
    if (!storageKey || draftHydratedRef.current || typeof window === "undefined") {
      return;
    }
    const raw = window.localStorage.getItem(storageKey);
    draftHydratedRef.current = true;
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as PersistedLadderDraft;
      if (parsed?.version !== 1) {
        window.localStorage.removeItem(storageKey);
        return;
      }
      hydrateDraft(parsed);
      const restoredAt = Date.now();
      setDraftStatus("saved");
      setLastDraftSavedAt(parsed.updatedAt ?? restoredAt);
      setDraftRestoredAt(restoredAt);
      onDraftRestored?.(restoredAt);
    } catch (error) {
      console.warn("Failed to restore ladder draft", error);
      window.localStorage.removeItem(storageKey);
      onHydrationError?.(error);
    }
  }, [hydrateDraft, onDraftRestored, onHydrationError, storageKey]);

  React.useEffect(() => {
    if (!storageKey || typeof window === "undefined" || !draftHydratedRef.current) {
      return;
    }
    setDraftStatus("saving");
    autosaveStartedAt.current = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
    if (autosaveTimer.current) {
      window.clearTimeout(autosaveTimer.current);
    }
    autosaveTimer.current = window.setTimeout(() => {
      try {
        const payload: PersistedLadderDraft = {
          version: 1,
          updatedAt: Date.now(),
          ...serializeDraft(),
        };
        window.localStorage.setItem(storageKey, JSON.stringify(payload));
        setDraftStatus("saved");
        setLastDraftSavedAt(payload.updatedAt);
        onAutosaveSuccess?.(payload.updatedAt);
        const latency = computeLatency(autosaveStartedAt.current);
        tracker?.({
          event: "ladders.autosave.status",
          capsuleId,
          payload: {
            status: "saved",
            latencyMs: latency,
          },
        });
      } catch (error) {
        console.warn("Failed to persist ladder draft", error);
        setDraftStatus("error");
        onAutosaveError?.(error);
        tracker?.({
          event: "ladders.autosave.status",
          capsuleId,
          payload: { status: "error" },
        });
      } finally {
        autosaveStartedAt.current = null;
      }
    }, 900);
    return () => {
      if (autosaveTimer.current) {
        window.clearTimeout(autosaveTimer.current);
      }
      autosaveStartedAt.current = null;
    };
  }, [capsuleId, onAutosaveError, onAutosaveSuccess, serializeDraft, storageKey, tracker]);

  const discardDraft = React.useCallback(() => {
    if (!storageKey || typeof window === "undefined") return;
    window.localStorage.removeItem(storageKey);
    resetToDefaults();
    setDraftStatus("idle");
    setLastDraftSavedAt(null);
    setDraftRestoredAt(null);
    draftHydratedRef.current = false;
  }, [resetToDefaults, storageKey]);

  return {
    draftStatus,
    lastDraftSavedAt,
    draftRestoredAt,
    canDiscardDraft: Boolean(lastDraftSavedAt || draftRestoredAt),
    discardDraft,
  };
};

const computeLatency = (startedAt: number | null): number | null => {
  if (startedAt === null) return null;
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
  return Math.max(0, Math.round(now - startedAt));
};
