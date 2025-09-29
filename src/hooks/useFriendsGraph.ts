import * as React from "react";

export const FRIENDS_GRAPH_UPDATE_EVENT = "capsule:friends:update" as const;
export const FRIENDS_GRAPH_REFRESH_EVENT = "capsule:friends:refresh" as const;

export type FriendsGraphUpdateEventDetail = {
  friends?: unknown[];
  incomingCount?: number;
  outgoingCount?: number;
  incomingRequests?: unknown[];
  outgoingRequests?: unknown[];
};


function dispatchFriendsEvent(event: Event) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(event);
}

export function broadcastFriendsGraphUpdate(detail: FriendsGraphUpdateEventDetail = {}): void {
  if (typeof window === "undefined") return;
  try {
    dispatchFriendsEvent(new CustomEvent(FRIENDS_GRAPH_UPDATE_EVENT, { detail }));
  } catch {
    dispatchFriendsEvent(new Event(FRIENDS_GRAPH_UPDATE_EVENT));
  }
}

export function broadcastFriendsGraphRefresh(): void {
  dispatchFriendsEvent(new Event(FRIENDS_GRAPH_REFRESH_EVENT));
}

export type Friend = {
  id: string | null;
  userId: string | null;
  key?: string | null;
  name: string;
  avatar?: string | null;
  since?: string | null;
  status?: "online" | "offline" | "away";
};

export function mapFriendList(items: unknown[]): Friend[] {
  return items.map((raw) => {
    const record = raw as Record<string, unknown>;
    const name =
      typeof record["name"] === "string"
        ? (record["name"] as string)
        : typeof record["user_name"] === "string"
          ? (record["user_name"] as string)
          : typeof record["userName"] === "string"
            ? (record["userName"] as string)
            : "Friend";
    const avatar =
      typeof record["avatar"] === "string"
        ? (record["avatar"] as string)
        : typeof record["avatarUrl"] === "string"
          ? (record["avatarUrl"] as string)
          : typeof record["userAvatar"] === "string"
            ? (record["userAvatar"] as string)
            : null;
    const statusValue =
      typeof record["status"] === "string" ? (record["status"] as string) : undefined;
    const status: Friend["status"] =
      statusValue === "online" || statusValue === "away" ? statusValue : "offline";
    return {
      id: typeof record["id"] === "string" ? (record["id"] as string) : null,
      userId:
        typeof record["userId"] === "string"
          ? (record["userId"] as string)
          : typeof record["user_id"] === "string"
            ? (record["user_id"] as string)
            : null,
      key:
        typeof record["key"] === "string"
          ? (record["key"] as string)
          : typeof record["userKey"] === "string"
            ? (record["userKey"] as string)
            : null,
      name,
      avatar,
      since: typeof record["since"] === "string" ? (record["since"] as string) : null,
      status,
    } satisfies Friend;
  });
}

export function useFriendsGraph(initial: Friend[]) {
  const [friends, setFriends] = React.useState<Friend[]>(initial);
  const [incomingRequestCount, setIncomingRequestCount] = React.useState(0);
  const [outgoingRequestCount, setOutgoingRequestCount] = React.useState(0);

  const refresh = React.useCallback(async () => {
    try {
      const res = await fetch("/api/friends/sync", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: {} }),
      });
      if (!res.ok) {
        throw new Error(`friends sync failed (${res.status})`);
      }
      const d = await res.json();
      const arr = Array.isArray(d?.friends) ? d.friends : [];
      const mapped = mapFriendList(arr);
      setFriends(mapped.length ? mapped : initial);
      const rawGraph = d && typeof d === "object" ? (d as { graph?: unknown }).graph : null;
      const graph =
        rawGraph && typeof rawGraph === "object"
          ? (rawGraph as { incomingRequests?: unknown; outgoingRequests?: unknown })
          : null;
      const incoming = Array.isArray(graph?.incomingRequests) ? graph!.incomingRequests!.length : 0;
      const outgoing = Array.isArray(graph?.outgoingRequests) ? graph!.outgoingRequests!.length : 0;
      setIncomingRequestCount(incoming);
      setOutgoingRequestCount(outgoing);
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Friends graph refresh error", error);
      }
      setFriends(initial);
      setIncomingRequestCount(0);
      setOutgoingRequestCount(0);
    }
  }, [initial]);

  React.useEffect(() => {
    function handleGraphUpdate(event: Event) {
      const detail = (event as CustomEvent<FriendsGraphUpdateEventDetail>).detail;
      if (!detail || typeof detail !== "object") return;
      if (Array.isArray(detail.friends)) {
        const mapped = mapFriendList(detail.friends);
        setFriends(mapped.length ? mapped : initial);
      }
      if (typeof detail.incomingCount === "number" && Number.isFinite(detail.incomingCount)) {
        setIncomingRequestCount(Math.max(0, Math.trunc(detail.incomingCount)));
      } else if (Array.isArray(detail.incomingRequests)) {
        setIncomingRequestCount(detail.incomingRequests.length);
      }
      if (typeof detail.outgoingCount === "number" && Number.isFinite(detail.outgoingCount)) {
        setOutgoingRequestCount(Math.max(0, Math.trunc(detail.outgoingCount)));
      } else if (Array.isArray(detail.outgoingRequests)) {
        setOutgoingRequestCount(detail.outgoingRequests.length);
      }
    }
    window.addEventListener(
      FRIENDS_GRAPH_UPDATE_EVENT,
      handleGraphUpdate as EventListener,
    );
    return () =>
      window.removeEventListener(
        FRIENDS_GRAPH_UPDATE_EVENT,
        handleGraphUpdate as EventListener,
      );
  }, [initial]);

  React.useEffect(() => {
    function handleGraphRefresh() {
      void refresh();
    }
    window.addEventListener(
      FRIENDS_GRAPH_REFRESH_EVENT,
      handleGraphRefresh as EventListener,
    );
    return () =>
      window.removeEventListener(
        FRIENDS_GRAPH_REFRESH_EVENT,
        handleGraphRefresh as EventListener,
      );
  }, [refresh]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return { friends, setFriends, incomingRequestCount, outgoingRequestCount, refresh } as const;
}
