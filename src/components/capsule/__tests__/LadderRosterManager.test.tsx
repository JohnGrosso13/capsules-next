"use client";

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LadderRosterManager } from "../LadderRosterManager";
import type { CapsuleLadderSummary } from "@/hooks/useCapsuleLadders";

const refreshMock = vi.fn();

vi.mock("@/hooks/useNetworkStatus", () => ({
  useNetworkStatus: vi.fn(() => false),
}));

vi.mock("@/hooks/useLadderMembers", () => ({
  useLadderMembers: vi.fn(() => ({
    members: [],
    loading: false,
    error: "Unable to load roster",
    refreshing: false,
    mutating: false,
    addMembers: vi.fn(),
    updateMember: vi.fn(),
    removeMember: vi.fn(),
    refresh: refreshMock,
  })),
}));

const ladder: CapsuleLadderSummary = {
  id: "ladder-1",
  capsuleId: "capsule-1",
  name: "Test Ladder",
  slug: null,
  summary: null,
  status: "active",
  visibility: "public",
  createdById: "user-1",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  publishedAt: null,
  meta: null,
};

describe("LadderRosterManager offline state", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    refreshMock.mockReset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("disables mutation controls and surfaces a retry action", async () => {
    await act(async () => {
      root.render(
        <LadderRosterManager
          open
          capsuleId="capsule-1"
          ladder={ladder}
          onClose={() => {}}
        />,
      );
    });

    const fieldset = container.querySelector("fieldset");
    expect(fieldset).toBeTruthy();
    expect(fieldset?.getAttribute("disabled")).not.toBeNull();

    const retryButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Retry"),
    );
    expect(retryButton).toBeTruthy();

    await act(async () => {
      retryButton?.click();
    });

    expect(refreshMock).toHaveBeenCalled();
  });
});
