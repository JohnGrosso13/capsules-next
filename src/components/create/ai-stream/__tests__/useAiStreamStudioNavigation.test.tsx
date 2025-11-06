// @vitest-environment jsdom

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AiStreamStudioStoreProvider,
  useAiStreamStudioStore,
} from "../useAiStreamStudioStore";
import { useAiStreamStudioNavigation } from "../useAiStreamStudioNavigation";
import type { CapsuleSummary } from "@/server/capsules/service";

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

const capsule: CapsuleSummary = {
  id: "capsule-1",
  name: "Studio Capsule",
  slug: "studio-capsule",
  bannerUrl: null,
  storeBannerUrl: null,
  promoTileUrl: null,
  logoUrl: null,
  role: "owner",
  ownership: "owner",
};

describe("useAiStreamStudioNavigation", () => {
  let container: HTMLDivElement;
  let root: Root;
  const fetchMock = vi.fn<typeof fetch>();
  const originalFetch: typeof fetch = global.fetch;

  let navigationResult: ReturnType<typeof useAiStreamStudioNavigation> | null = null;
  let observedSelectedCapsuleId: string | null = null;
  const routerReplace = vi.fn();

  type NavigationOptions = Parameters<typeof useAiStreamStudioNavigation>[0];

  function StoreProbe() {
    const {
      state: { selectedCapsuleId },
    } = useAiStreamStudioStore();
    observedSelectedCapsuleId = selectedCapsuleId;
    return null;
  }

  function NavigationHarness(props: { options: NavigationOptions }) {
    navigationResult = useAiStreamStudioNavigation(props.options);
    return null;
  }

  const flush = async () => {
    await act(async () => {
      await Promise.resolve();
    });
  };

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    routerReplace.mockReset();
    navigationResult = null;
    observedSelectedCapsuleId = null;
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          overview: null,
          preferences: {
            latencyMode: "low",
            disconnectProtection: true,
            audioWarnings: true,
            storePastBroadcasts: true,
            alwaysPublishVods: true,
            autoClips: false,
            simulcastDestinations: [],
            webhookEndpoints: [],
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("syncs active tab and search params when interacting with navigation helpers", async () => {
    const initialSearchParams = new URLSearchParams("view=producer&capsuleId=capsule-1");
    const searchParamsForHook = initialSearchParams as NavigationOptions["searchParams"];

    await act(async () => {
      root.render(
        <AiStreamStudioStoreProvider>
          <StoreProbe />
          <NavigationHarness
            options={{
              capsules: [capsule],
              initialTab: "studio",
              pathname: "/create/ai-stream",
              searchParams: searchParamsForHook,
              searchParamsString: initialSearchParams.toString(),
              router: { replace: routerReplace },
            }}
          />
        </AiStreamStudioStoreProvider>,
      );
    });

    await flush();

    expect(navigationResult?.activeTab).toBe("producer");
    expect(observedSelectedCapsuleId).toBe("capsule-1");
    expect(routerReplace).not.toHaveBeenCalled();

    await act(async () => {
      navigationResult?.handleTabChange("encoder");
      await Promise.resolve();
    });

    expect(routerReplace).toHaveBeenLastCalledWith(
      "/create/ai-stream?view=encoder&capsuleId=capsule-1",
      { scroll: false },
    );

    await act(async () => {
      navigationResult?.handleCapsuleChange(null);
      await Promise.resolve();
    });

    await flush();

    expect(routerReplace).toHaveBeenLastCalledWith(
      "/create/ai-stream?view=producer&switch=1",
      { scroll: false },
    );
    expect(observedSelectedCapsuleId).toBeNull();
    expect(navigationResult?.selectorOpen).toBe(true);
  });
});
