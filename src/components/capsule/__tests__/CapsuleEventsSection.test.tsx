"use client";

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CapsuleEventsSection } from "../CapsuleEventsSection";
import type { CapsuleLadderDetail, CapsuleLadderMember } from "@/types/ladders";
import type { CapsuleLadderSummary } from "@/hooks/useCapsuleLadders";

const ladderSummaries: CapsuleLadderSummary[] = [
  {
    id: "ladder-1",
    capsuleId: "capsule-1",
    name: "Rated Ladder",
    slug: null,
    summary: "Test ladder",
    status: "active",
    visibility: "public",
    createdById: "user-1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    publishedAt: new Date().toISOString(),
    meta: { game: { title: "Game A", mode: "1v1" } },
  },
  {
    id: "ladder-2",
    capsuleId: "capsule-1",
    name: "Secondary Ladder",
    slug: null,
    summary: null,
    status: "draft",
    visibility: "public",
    createdById: "user-1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    publishedAt: null,
    meta: { game: { title: "Game B" } },
  },
];

const members: CapsuleLadderMember[] = [
  {
    id: "m1",
    ladderId: "ladder-1",
    userId: null,
    displayName: "Alpha",
    handle: null,
    seed: 1,
    rank: 1,
    rating: 1300,
    wins: 5,
    losses: 2,
    draws: 0,
    streak: 3,
    metadata: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "m2",
    ladderId: "ladder-1",
    userId: null,
    displayName: "Bravo",
    handle: "bravo",
    seed: 2,
    rank: 2,
    rating: 1250,
    wins: 4,
    losses: 3,
    draws: 0,
    streak: -1,
    metadata: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "m3",
    ladderId: "ladder-1",
    userId: null,
    displayName: "Charlie",
    handle: null,
    seed: 3,
    rank: 3,
    rating: 1180,
    wins: 2,
    losses: 5,
    draws: 0,
    streak: 0,
    metadata: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const ladderDetail: CapsuleLadderDetail = {
  id: "ladder-1",
  capsuleId: "capsule-1",
  name: "Rated Ladder",
  slug: null,
  summary: "Test ladder",
  status: "active",
  visibility: "public",
  createdById: "user-1",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  publishedAt: new Date().toISOString(),
  meta: { game: { title: "Game A", mode: "1v1" } },
  game: { title: "Game A", mode: "1v1" },
  config: { scoring: { system: "elo" }, moderation: { proofRequired: true } },
  sections: {},
  aiPlan: null,
  publishedById: "user-1",
};

vi.mock("@/hooks/useNetworkStatus", () => ({
  useNetworkStatus: () => true,
}));

vi.mock("@/hooks/useLadderDetail", () => ({
  useLadderDetail: () => ({
    ladder: ladderDetail,
    members,
    loading: false,
    refreshing: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

vi.mock("@/hooks/useLadderChallenges", () => ({
  useLadderChallenges: () => ({
    challenges: [],
    history: [],
    membersSnapshot: members,
    loading: false,
    refreshing: false,
    mutating: false,
    error: null,
    refresh: vi.fn(),
    createChallenge: vi.fn(),
    resolveChallenge: vi.fn(),
  }),
}));

vi.mock("@/lib/telemetry/ladders", () => ({
  trackLadderEvent: vi.fn(),
}));

describe("CapsuleEventsSection interactions", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders Elo standings with rating column and ladder selector", async () => {
    await act(async () => {
      root.render(
        <CapsuleEventsSection
          capsuleId="capsule-1"
          ladders={ladderSummaries}
          tournaments={[]}
          loading={false}
          error={null}
          onRetry={() => {}}
        />,
      );
    });

    const rows = container.querySelectorAll<HTMLTableRowElement>("tbody tr");
    expect(rows.length).toBe(members.length);
    const firstRatingCell = rows[0]?.querySelectorAll("td")[4];
    expect(firstRatingCell?.textContent).toContain("1300");
  });

  it("shows Elo ladder banner copy and disables challenge submit until players are chosen", async () => {
    await act(async () => {
      root.render(
        <CapsuleEventsSection
          capsuleId="capsule-1"
          ladders={ladderSummaries}
          tournaments={[]}
          loading={false}
          error={null}
          onRetry={() => {}}
        />,
      );
    });

    const banner = Array.from(container.querySelectorAll<HTMLElement>("p")).find((node) =>
      node.textContent?.includes("Elo ladder"),
    );
    expect(banner?.textContent).toContain("Elo ladder");

    const launchButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Launch challenge"),
    );
    expect(launchButton).toBeTruthy();
    expect(launchButton?.disabled).toBe(true);
  });

  it("shows proof input when proof is required", async () => {
    await act(async () => {
      root.render(
        <CapsuleEventsSection
          capsuleId="capsule-1"
          ladders={ladderSummaries}
          tournaments={[]}
          loading={false}
          error={null}
          onRetry={() => {}}
        />,
      );
    });

    const reportNav = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.toLowerCase().includes("report"),
    );
    expect(reportNav).toBeTruthy();
    await act(async () => {
      reportNav?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const proofInput = container.querySelector<HTMLInputElement>('input[type="url"]');
    expect(proofInput).toBeTruthy();
    expect(proofInput?.placeholder?.toLowerCase()).toContain("proof");
    const hint = Array.from(container.querySelectorAll<HTMLElement>("span")).find((node) =>
      node.textContent?.includes("Proof or notes are required"),
    );
    expect(hint).toBeTruthy();
  });
});
