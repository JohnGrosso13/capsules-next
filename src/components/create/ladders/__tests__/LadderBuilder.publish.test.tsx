"use client";

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ladder: { id: "ladder-123", capsuleId: "capsule-1" } }),
    } as Response);
    global.fetch = fetchMock as unknown as typeof fetch;
    pushMock.mockReset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    global.fetch = originalFetch;
    fetchMock.mockReset();
    vi.useRealTimers();
  });

  it("saves a ladder draft and routes to the events view", async () => {
    await act(async () => {
      root.render(<LadderBuilder capsules={capsules} initialCapsuleId="capsule-1" />);
    });

    const setInputValue = async (input: HTMLInputElement | null, value: string) => {
      expect(input).toBeTruthy();
      await act(async () => {
        if (input) {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
          if (setter) {
            setter.call(input, value);
          } else {
            input.value = value;
          }
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
    };

    const clickButton = async (matcher: (button: HTMLButtonElement) => boolean) => {
      const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(matcher);
      expect(button).toBeTruthy();
      await act(async () => {
        button?.click();
      });
      await act(async () => {
        await Promise.resolve();
      });
    };

    await setInputValue(container.querySelector<HTMLInputElement>("#ladder-name"), "Launch Ladder");
    await clickButton((button) => button.textContent?.startsWith("Next") ?? false); // Basics -> Seed
    await clickButton((button) => button.textContent?.startsWith("Next") ?? false); // Seed -> Story
    await clickButton((button) => button.textContent?.startsWith("Next") ?? false); // Story -> Format

    await setInputValue(container.querySelector<HTMLInputElement>("#game-title"), "VALORANT");
    await clickButton((button) => button.textContent?.startsWith("Next") ?? false); // Format -> Roster

    await setInputValue(container.querySelector<HTMLInputElement>("tbody tr td input"), "Player One");
    await clickButton((button) => button.textContent?.startsWith("Next") ?? false); // Roster -> Review

    await clickButton((button) => button.textContent?.includes("Save ladder draft") ?? false);
    await act(async () => {
      vi.runAllTimers();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/capsules/capsule-1/ladders",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(pushMock).toHaveBeenCalledWith("/capsule?capsuleId=capsule-1&switch=events");
  });
});
