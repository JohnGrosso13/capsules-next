import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { act } from "react";
import ReactDOM from "react-dom/client";

import { PartyProvider, usePartyContext } from "../PartyProvider";
import type { Room } from "livekit-client";

vi.mock("@/services/auth/client", () => ({
  useCurrentUser: () => ({ user: { name: "Test User" } }),
}));

type PartyContextValue = ReturnType<typeof usePartyContext>;

function createOkResponse<T>(payload: T) {
  return {
    ok: true,
    async json() {
      return payload;
    },
  } as Response;
}

describe("PartyProvider", () => {
  let container: HTMLDivElement;
  let root: ReactDOM.Root;
  let contextRef: { current: PartyContextValue | null };
  const originalFetch = global.fetch;

  function TestConsumer() {
    const context = usePartyContext();
    contextRef.current = context;
    React.useEffect(() => {
      contextRef.current = context;
    }, [context]);
    return null;
  }

  async function flushMicrotasks() {
    await act(async () => {
      await Promise.resolve();
    });
  }

  beforeEach(() => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    contextRef = { current: null };
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);
    act(() => {
      root.render(
        <PartyProvider>
          <TestConsumer />
        </PartyProvider>,
      );
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    localStorage.clear();
    delete (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT;
  });

  it("does not automatically resume after an intentional leave", async () => {
    const partyPayload = {
      partyId: "party_123",
      token: "token_abc",
      livekitUrl: "wss://unit-test.example",
      metadata: {
        ownerDisplayName: "Test User",
        topic: null,
        privacy: "invite-only",
        createdAt: new Date().toISOString(),
      },
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      isOwner: true,
    };

    let tokenRequests = 0;
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/party") {
        return createOkResponse(partyPayload);
      }
      if (url === "/api/party/token") {
        tokenRequests += 1;
        return createOkResponse({ ...partyPayload, token: "token_resume" });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    await flushMicrotasks();

    expect(contextRef.current).not.toBeNull();
    const context = contextRef.current as PartyContextValue;

    await act(async () => {
      await context.createParty({ displayName: "Tester", privacy: "invite-only" });
    });
    await flushMicrotasks();

    expect(contextRef.current?.session?.partyId).toBe("party_123");

    const mockRoom = {
      engine: { lossyDC: null, reliableDC: null },
      disconnect: vi.fn(async () => {
        contextRef.current?.handleRoomDisconnected();
      }),
    } as unknown as Room;

    await act(async () => {
      contextRef.current?.handleRoomConnected(mockRoom as unknown as Room);
    });

    await act(async () => {
      await contextRef.current?.leaveParty();
    });

    await flushMicrotasks();
    await flushMicrotasks();

    expect(contextRef.current?.session).toBeNull();
    expect(contextRef.current?.status).toBe("idle");
    expect(tokenRequests).toBe(0);
  });
});
