"use client";

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useLadderDraft, type PersistedLadderDraft } from "../hooks/useLadderDraft";
import { defaultMembersForm, defaultSeedForm } from "../ladderFormState";
import type { LadderBuilderFormState } from "../builderState";
import { createInitialFormState } from "../builderState";
import { DEFAULT_GUIDED_STEP } from "../guidedConfig";

type HarnessProps = { name: string; onSaved?: (draft: PersistedLadderDraft | null) => void };

function DraftHarness({ name, onSaved }: HarnessProps) {
  const form = React.useMemo<LadderBuilderFormState>(() => {
    const next = createInitialFormState();
    next.name = name;
    return next;
  }, [name]);

  useLadderDraft({
    storageKey: "capsules:ladder-builder:test",
    serializeDraft: () => ({
      form,
      members: defaultMembersForm(),
      seed: { ...defaultSeedForm },
      meta: {},
      guidedStep: DEFAULT_GUIDED_STEP,
    }),
    hydrateDraft: (draft) => {
      onSaved?.(draft);
    },
    resetToDefaults: () => undefined,
    capsuleId: "capsule-test",
  });

  return <div data-testid="draft-harness">{name}</div>;
}

describe("Ladder draft autosave (hook)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    window.localStorage.clear();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it("persists draft form data to localStorage", async () => {
    await act(async () => {
      root.render(<DraftHarness name="Autosave Ladder" />);
    });

    await act(async () => {
      vi.runAllTimers();
    });

    const stored = window.localStorage.getItem("capsules:ladder-builder:test");
    expect(stored).toBeTruthy();
    const parsed = stored ? (JSON.parse(stored) as PersistedLadderDraft) : null;
    expect(parsed?.form?.name).toBe("Autosave Ladder");
    expect(parsed?.version).toBe(1);
    expect(typeof parsed?.updatedAt).toBe("number");
  });
});
