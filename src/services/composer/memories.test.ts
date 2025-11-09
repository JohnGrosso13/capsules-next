"use client";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { ComposerMemorySavePayload } from "@/components/composer/types";
import { saveComposerItem } from "./memories";

const basePayload: ComposerMemorySavePayload = {
  title: "Launch visual",
  description: "Hero image for the launch recap",
  kind: "image",
  mediaUrl: "https://cdn.example.com/launch.png",
  mediaType: "image/png",
  downloadUrl: "https://cdn.example.com/launch.png?download=1",
  thumbnailUrl: "https://cdn.example.com/launch-thumb.png",
  prompt: "Design a bold launch visual",
  durationSeconds: null,
  muxPlaybackId: null,
  muxAssetId: null,
  runId: "run-123",
  tags: ["launch"],
  metadata: { channel: "social" },
};

describe("saveComposerItem", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("sends composer metadata and returns response payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ memoryId: "mem-123", message: "Saved" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await saveComposerItem({
      payload: basePayload,
      capsuleId: "cap-1",
      envelope: { key: "user-1" },
    });

    expect(result).toEqual({ memoryId: "mem-123", message: "Saved" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const callArgs = fetchMock.mock.calls[0];
    expect(callArgs).toBeDefined();
    const [, init] = callArgs as [unknown, RequestInit];
    expect(init?.method).toBe("POST");
    const body = JSON.parse((init?.body as string) ?? "{}");
    expect(body.user).toEqual({ key: "user-1" });
    expect(body.item.metadata).toMatchObject({
      capsule_id: "cap-1",
      category: "capsule_creation",
      kind: "image",
      prompt: "Design a bold launch visual",
      video_run_id: "run-123",
      channel: "social",
    });
  });

  it("throws when the API returns an error response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      text: () => Promise.resolve("Denied"),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      saveComposerItem({
        payload: { ...basePayload, metadata: null },
        capsuleId: null,
        envelope: null,
      }),
    ).rejects.toThrow("Denied");
  });
});
