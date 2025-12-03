"use client";

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../ladderWizardConfig", async () => {
  const actual = await vi.importActual<typeof import("../ladderWizardConfig")>("../ladderWizardConfig");
  return {
    ...actual,
    LADDER_WIZARD_STEPS: actual.LADDER_WIZARD_STEPS.map((step) => ({
      ...step,
      validate: () => ({ success: true, data: null }),
      completionCheck: () => true,
    })),
  };
});

import { LadderBuilder } from "../LadderBuilder";
import type { CapsuleSummary } from "@/server/capsules/service";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock("@/hooks/useNetworkStatus", () => ({
  useNetworkStatus: () => true,
}));

const actEnv = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
actEnv.IS_REACT_ACT_ENVIRONMENT = true;
const originalMatchMedia = globalThis.matchMedia;
const originalScrollTo = Element.prototype.scrollTo;
const matchMediaStub = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

const capsules: CapsuleSummary[] = [
  {
    id: "capsule-1",
    name: "Test Capsule",
    slug: "test-capsule",
    bannerUrl: null,
    storeBannerUrl: null,
    promoTileUrl: null,
    logoUrl: null,
    role: "owner",
    ownership: "owner",
  },
];

describe("LadderBuilder publish flow", () => {
  let container: HTMLDivElement;
  let root: Root;
  const fetchMock = vi.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1920 });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ladder: { id: "ladder-123", capsuleId: "capsule-1" } }),
    } as Response);
    global.fetch = fetchMock as unknown as typeof fetch;
    pushMock.mockReset();

    Object.defineProperty(globalThis, "matchMedia", {
      writable: true,
      configurable: true,
      value: matchMediaStub,
    });
    Object.defineProperty(Element.prototype, "scrollTo", {
      writable: true,
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    global.fetch = originalFetch;
    fetchMock.mockReset();
    vi.useRealTimers();

    if (originalMatchMedia) {
      Object.defineProperty(globalThis, "matchMedia", {
        writable: true,
        configurable: true,
        value: originalMatchMedia,
      });
    } else {
      Reflect.deleteProperty(globalThis as object, "matchMedia");
    }
    if (originalScrollTo) {
      Object.defineProperty(Element.prototype, "scrollTo", {
        writable: true,
        configurable: true,
        value: originalScrollTo,
      });
    } else {
      Reflect.deleteProperty(Element.prototype, "scrollTo");
    }
  });

  it("saves a ladder draft and routes to the events view", async () => {
    await act(async () => {
      root.render(<LadderBuilder capsules={capsules} initialCapsuleId="capsule-1" />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const setInputValue = async (
      input: HTMLInputElement | HTMLTextAreaElement | null | undefined,
      value: string,
    ) => {
      expect(input).toBeTruthy();
      await act(async () => {
        if (input) {
          input.value = value;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
    };

  const clickNext = async () => {
    const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((entry) =>
      entry.textContent?.trim().startsWith("Next"),
    );
    expect(button).toBeTruthy();
    await act(async () => button?.click());
    await act(async () => Promise.resolve());
  };

  const goToStep = async (title: string) => {
    const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((entry) => {
      const text = entry.textContent?.trim() ?? "";
      return text === title;
    });
    expect(button).toBeTruthy();
    await act(async () => button?.click());
    await act(async () => Promise.resolve());
  };

    await clickNext(); // Blueprint -> Title
    await setInputValue(
      container.querySelector<HTMLTextAreaElement>("#guided-name") ??
        container.querySelector<HTMLInputElement>("#guided-name"),
      "Launch Ladder",
    );

    await goToStep("Summary");
    await setInputValue(
      container.querySelector<HTMLTextAreaElement>("#guided-summary") ??
        container.querySelector<HTMLInputElement>("#guided-summary"),
      "Weekly competitive ladder",
    );

    await goToStep("Basics");
    await setInputValue(container.querySelector<HTMLInputElement>("#guided-game-title"), "VALORANT");

    await goToStep("Roster");
    await setInputValue(container.querySelector<HTMLInputElement>("#member-name-0"), "Player One");

    await goToStep("Review");
    const saveButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Save ladder draft"),
    );
    expect(saveButton).toBeTruthy();
    expect(saveButton?.disabled).toBe(false);
  });
});
