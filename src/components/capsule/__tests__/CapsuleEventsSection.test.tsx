"use client";

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type MockedFunction } from "vitest";

import { CapsuleEventsSection } from "../CapsuleEventsSection";
import type { CapsuleLadderSummary } from "@/hooks/useCapsuleLadders";

const buildLadder = (id: number, overrides: Partial<CapsuleLadderSummary> = {}): CapsuleLadderSummary => ({
  id: `ladder-${id}`,
  capsuleId: "capsule-1",
  name: `Ladder ${id}`,
  slug: null,
  summary: null,
  status: "active",
  visibility: "public",
  createdById: "user-1",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  publishedAt: new Date().toISOString(),
  meta: null,
  ...overrides,
});

vi.mock("@/lib/telemetry/ladders", () => ({
  trackLadderEvent: vi.fn(),
}));

import { trackLadderEvent } from "@/lib/telemetry/ladders";

const trackLadderEventMock = trackLadderEvent as MockedFunction<typeof trackLadderEvent>;

describe("CapsuleEventsSection interactions", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    trackLadderEventMock.mockClear();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders ladders in chunks and shows more on demand", async () => {
    const ladders = Array.from({ length: 210 }, (_, index) => buildLadder(index + 1));

    await act(async () => {
      root.render(
        <CapsuleEventsSection
          capsuleId="capsule-1"
          ladders={ladders}
          tournaments={[]}
          loading={false}
          error={null}
          onRetry={() => {}}
        />,
      );
    });

    const initialRows = container.querySelectorAll<HTMLTableRowElement>("tbody tr");
    expect(initialRows.length).toBe(200);

    const showMore = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Show more ladders"),
    );
    expect(showMore).toBeTruthy();

    await act(async () => {
      showMore?.click();
    });

    const updatedRows = container.querySelectorAll<HTMLTableRowElement>("tbody tr");
    expect(updatedRows.length).toBe(210);
  });

  it("filters ladders by selected status", async () => {
    const ladders = [
      buildLadder(1, { status: "active" }),
      buildLadder(2, { status: "draft" }),
    ];

    await act(async () => {
      root.render(
        <CapsuleEventsSection
          capsuleId="capsule-1"
          ladders={ladders}
          tournaments={[]}
          loading={false}
          error={null}
          onRetry={() => {}}
        />,
      );
    });

    const draftFilter = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Drafts"),
    );
    expect(draftFilter).toBeTruthy();

    await act(async () => {
      draftFilter?.click();
    });

    const rows = Array.from(container.querySelectorAll<HTMLTableRowElement>("tbody tr"));
    expect(rows.length).toBe(1);
    expect(rows[0]?.querySelector("th")?.textContent).toContain("Ladder 2");

    const filterCall = trackLadderEventMock.mock.calls.find(([payload]) => payload.event === "ladders.filter.change");
    expect(filterCall).toBeTruthy();
    expect(filterCall?.[0].payload?.filter).toBe("draft");
  });

  it("sorts ladders by the game column", async () => {
    const ladders = [
      buildLadder(1, {
        name: "Zulu Ladder",
        meta: { game: { title: "Zulu" } },
        updatedAt: new Date("2025-01-02T00:00:00.000Z").toISOString(),
      }),
      buildLadder(2, {
        name: "Alpha Ladder",
        meta: { game: { title: "Alpha" } },
        updatedAt: new Date("2024-01-02T00:00:00.000Z").toISOString(),
      }),
    ];

    await act(async () => {
      root.render(
        <CapsuleEventsSection
          capsuleId="capsule-1"
          ladders={ladders}
          tournaments={[]}
          loading={false}
          error={null}
          onRetry={() => {}}
        />,
      );
    });

    const initialFirstRow = container.querySelector<HTMLTableRowElement>("tbody tr");
    expect(initialFirstRow?.querySelector("th")?.textContent).toContain("Zulu Ladder");

    const sortButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.trim() === "Game",
    );
    expect(sortButton).toBeTruthy();

    await act(async () => {
      sortButton?.click();
    });

    const sortedFirstRow = container.querySelector<HTMLTableRowElement>("tbody tr");
    expect(sortedFirstRow?.querySelector("th")?.textContent).toContain("Alpha Ladder");

    const sortCall = trackLadderEventMock.mock.calls.find(([payload]) => payload.event === "ladders.sort.change");
    expect(sortCall).toBeTruthy();
    expect(sortCall?.[0].payload?.sortBy).toBe("name");
  });
});
