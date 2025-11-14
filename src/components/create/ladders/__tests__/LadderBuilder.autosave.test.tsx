"use client";

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LadderBuilder } from "../LadderBuilder";
import type { CapsuleSummary } from "@/server/capsules/service";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

const networkStatusMock = vi.fn(() => true);

vi.mock("@/hooks/useNetworkStatus", () => ({
  useNetworkStatus: () => networkStatusMock(),
}));

const actEnv = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
actEnv.IS_REACT_ACT_ENVIRONMENT = true;

const capsules: CapsuleSummary[] = [
  {
    id: "capsule-1",
    name: "Testing Capsule",
    slug: "testing-capsule",
    bannerUrl: null,
    storeBannerUrl: null,
    promoTileUrl: null,
    logoUrl: null,
    role: "owner",
    ownership: "owner",
  },
];

describe("LadderBuilder autosave", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "anon-key";
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY =
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "pk_test_clerk";
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
  });

  it("persists draft form data to localStorage", async () => {
    await act(async () => {
      root.render(<LadderBuilder capsules={capsules} initialCapsuleId="capsule-1" />);
    });

    const nameInput = container.querySelector<HTMLInputElement>("#guided-name");
    expect(nameInput).toBeTruthy();

    await act(async () => {
      if (nameInput) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        if (setter) {
          setter.call(nameInput, "Autosave Ladder");
        } else {
          nameInput.value = "Autosave Ladder";
        }
        nameInput.dispatchEvent(new Event("input", { bubbles: true }));
        nameInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    expect(nameInput?.value).toBe("Autosave Ladder");

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 950));
    });

    const storageKey = "capsules:ladder-builder:capsule-1";
    const stored = window.localStorage.getItem(storageKey);
    expect(stored).toBeTruthy();
    const parsed = stored ? JSON.parse(stored) : null;
    expect(parsed?.form?.name).toBe("Autosave Ladder");
  });
});
