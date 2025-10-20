// @vitest-environment jsdom

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AiStreamStudioStoreProvider,
  useAiStreamStudioStore,
} from "../useAiStreamStudioStore";
import type { StreamOverview, StreamPreferences } from "@/types/ai-stream";

vi.mock("@/lib/supabase/browser", () => {
  const channelFactory = () => ({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn(),
  });

  const supabaseStub = {
    channel: vi.fn(() => channelFactory()),
    removeChannel: vi.fn(),
  };

  return {
    getBrowserSupabaseClient: vi.fn(() => supabaseStub),
  };
});

const baseOverview: StreamOverview = {
  liveStream: {
    id: "ls-1",
    capsuleId: "capsule-1",
    ownerUserId: "owner-1",
    muxLiveStreamId: "mux-live-1",
    status: "idle",
    latencyMode: "low",
    isLowLatency: true,
    streamKey: "sk_primary",
    streamKeyBackup: "sk_backup",
    ingestUrl: "rtmps://global-live.mux.com:443/app",
    ingestUrlBackup: "rtmps://global-live-backup.mux.com:443/app",
    playbackId: "pb-1",
    playbackUrl: "https://stream.mux.com/pb-1.m3u8",
    playbackPolicy: "public",
    activeAssetId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastSeenAt: null,
    lastActiveAt: null,
    lastIdleAt: null,
  },
  playback: {
    playbackId: "pb-1",
    playbackUrl: "https://stream.mux.com/pb-1.m3u8",
    playbackPolicy: "public",
  },
  ingest: {
    primary: "rtmps://global-live.mux.com:443/app",
    backup: "rtmps://global-live-backup.mux.com:443/app",
    streamKey: "sk_primary",
    backupStreamKey: "sk_backup",
  },
  sessions: [],
  assets: [],
  aiJobs: [],
};

const basePreferences: StreamPreferences = {
  latencyMode: "low",
  disconnectProtection: true,
  audioWarnings: true,
  storePastBroadcasts: true,
  alwaysPublishVods: true,
  autoClips: false,
  simulcastDestinations: [],
  webhookEndpoints: [],
};

const okResponse = (payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const notFoundResponse = new Response("{}", { status: 404 });

describe("useAiStreamStudioStore", () => {
  let container: HTMLDivElement;
  let root: Root;
  const fetchMock = vi.fn<typeof fetch>();
  const originalFetch: typeof fetch = global.fetch;

  type StoreState = ReturnType<typeof useAiStreamStudioStore>["state"];
  type StoreActions = ReturnType<typeof useAiStreamStudioStore>["actions"];

  let latestState: StoreState | null = null;
  let latestActions: StoreActions | null = null;

  function StoreHarness({ capsuleId }: { capsuleId: string }) {
    const store = useAiStreamStudioStore();
    latestState = store.state;
    latestActions = store.actions;

    React.useEffect(() => {
      store.actions.setSelectedCapsuleId(capsuleId);
    }, [capsuleId, store.actions]);

    return null;
  }

  const flush = async () => {
    await act(async () => {
      await Promise.resolve();
    });
  };

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    fetchMock.mockReset();
    // Default fallback to 404 if a call is not stubbed.
    fetchMock.mockResolvedValue(notFoundResponse.clone());
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
  });

  it("loads overview and preferences when a capsule is selected", async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse({
        overview: baseOverview,
        preferences: basePreferences,
      }),
    );

    await act(async () => {
      root.render(
        <AiStreamStudioStoreProvider>
          <StoreHarness capsuleId="capsule-1" />
        </AiStreamStudioStoreProvider>,
      );
    });

    await flush();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/mux/live?capsuleId=capsule-1",
      expect.objectContaining({ method: "GET" }),
    );
    expect(latestState?.streamOverview?.liveStream.id).toBe("ls-1");
    expect(latestState?.streamPreferences.latencyMode).toBe("low");
    expect(latestState?.overviewError).toBeNull();
  });

  it("persists preference updates via PUT", async () => {
    const updatedPreferences = {
      ...basePreferences,
      disconnectProtection: false,
    };

    fetchMock
      .mockResolvedValueOnce(
        okResponse({
          overview: baseOverview,
          preferences: basePreferences,
        }),
      )
      .mockResolvedValueOnce(
        okResponse({
          overview: baseOverview,
          preferences: updatedPreferences,
        }),
      );

    await act(async () => {
      root.render(
        <AiStreamStudioStoreProvider>
          <StoreHarness capsuleId="capsule-1" />
        </AiStreamStudioStoreProvider>,
      );
    });

    await flush();

    await act(async () => {
      latestActions!.updateStreamPreferences({ disconnectProtection: false });
      await Promise.resolve();
    });

    await flush();

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/mux/live",
      expect.objectContaining({
        method: "PUT",
        headers: { "Content-Type": "application/json" },
      }),
    );

    const putInit = fetchMock.mock.calls[1]?.[1] as RequestInit | undefined;
    expect(putInit).toBeDefined();
    const putBodyRaw = putInit!.body;
    expect(typeof putBodyRaw).toBe("string");
    const putBody = JSON.parse(putBodyRaw as string);
    expect(putBody).toMatchObject({
      capsuleId: "capsule-1",
      preferences: expect.objectContaining({ disconnectProtection: false }),
    });

    expect(latestState?.streamPreferences.disconnectProtection).toBe(false);
  });

  it("ensures a stream and updates overview via POST", async () => {
    const ensuredOverview: StreamOverview = {
      ...baseOverview,
      liveStream: {
        ...baseOverview.liveStream,
        status: "active",
        streamKey: "sk_primary_rotated",
      },
    };

    fetchMock
      .mockResolvedValueOnce(
        okResponse({
          overview: baseOverview,
          preferences: basePreferences,
        }),
      )
      .mockResolvedValueOnce(
        okResponse({
          overview: ensuredOverview,
          preferences: basePreferences,
        }),
      );

    await act(async () => {
      root.render(
        <AiStreamStudioStoreProvider>
          <StoreHarness capsuleId="capsule-1" />
        </AiStreamStudioStoreProvider>,
      );
    });

    await flush();

    await act(async () => {
      await latestActions!.ensureStream();
    });

    await flush();

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/mux/live",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );

    const postInit = fetchMock.mock.calls[1]?.[1] as RequestInit | undefined;
    expect(postInit).toBeDefined();
    const postBodyRaw = postInit!.body;
    expect(typeof postBodyRaw).toBe("string");
    const postBody = JSON.parse(postBodyRaw as string);
    expect(postBody).toMatchObject({
      capsuleId: "capsule-1",
      action: "ensure",
      latencyMode: "low",
    });

    expect(latestState?.streamOverview?.liveStream.status).toBe("active");
    expect(latestState?.actionBusy).toBeNull();
  });
});
