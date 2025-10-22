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

type RequestPreview = {
  id: string;
  user: { name?: string | null } | null;
};

type Channels = { events: string; presence: string } | null;

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

function mapRequestList(items: unknown[] | undefined | null): RequestPreview[] {
  if (!Array.isArray(items)) return [];
  const result: RequestPreview[] = [];
  for (const raw of items) {
    const record = raw as Record<string, unknown> | null | undefined;
    if (!record) continue;
    const idRaw = record["id"];
    const id = typeof idRaw === "string" ? idRaw : idRaw != null ? String(idRaw) : null;
    if (!id) continue;
    const userRaw = record["user"];
    let user: RequestPreview["user"] = null;
    if (userRaw && typeof userRaw === "object") {
      const name = (userRaw as Record<string, unknown>)["name"];
      user = { name: typeof name === "string" ? name : null };
    }
    result.push({ id, user });
  }
  return result;
}

export function useFriendsGraph(initial: Friend[]) {
  const [friends, setFriends] = React.useState<Friend[]>(initial);
  const [incomingRequests, setIncomingRequests] = React.useState<RequestPreview[]>([]);
  const [outgoingRequests, setOutgoingRequests] = React.useState<RequestPreview[]>([]);
  const [channels, setChannels] = React.useState<Channels>(null);
  const pendingRefresh = React.useRef<Promise<void> | null>(null);

  const refresh = React.useCallback(async () => {
    if (pendingRefresh.current) return pendingRefresh.current;
    const promise = (async () => {
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
        const data = await res.json();
        const friendItems = Array.isArray(data?.friends) ? data.friends : [];
        const mappedFriends = mapFriendList(friendItems);
        setFriends(mappedFriends.length ? mappedFriends : initial);
        const graphRaw =
          data && typeof data === "object" ? (data as { graph?: unknown }).graph : null;
        const graph =
          graphRaw && typeof graphRaw === "object" ? (graphRaw as Record<string, unknown>) : null;
        const incomingRaw = graph ? (graph["incomingRequests"] as unknown[]) : null;
        const outgoingRaw = graph ? (graph["outgoingRequests"] as unknown[]) : null;
        setIncomingRequests(mapRequestList(incomingRaw));
        setOutgoingRequests(mapRequestList(outgoingRaw));
        const channelsRaw =
          data && typeof data === "object" ? (data as { channels?: unknown }).channels : null;
        if (channelsRaw && typeof channelsRaw === "object") {
          const record = channelsRaw as Record<string, unknown>;
          const events = record["events"];
          const presence = record["presence"];
          if (typeof events === "string" && typeof presence === "string") {
            setChannels({ events, presence });
          } else {
            setChannels(null);
          }
        } else {
          setChannels(null);
        }
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.error("Friends graph refresh error", error);
        }
        setFriends(initial);
        setIncomingRequests([]);
        setOutgoingRequests([]);
        setChannels(null);
      } finally {
        pendingRefresh.current = null;
      }
    })();
    pendingRefresh.current = promise;
    return promise;
  }, [initial]);

  React.useEffect(() => {
    const handleGraphUpdate = () => {
      void refresh();
    };
    window.addEventListener(FRIENDS_GRAPH_UPDATE_EVENT, handleGraphUpdate as EventListener);
    return () =>
      window.removeEventListener(FRIENDS_GRAPH_UPDATE_EVENT, handleGraphUpdate as EventListener);
  }, [refresh]);

  React.useEffect(() => {
    const handleGraphRefresh = () => {
      void refresh();
    };
    window.addEventListener(FRIENDS_GRAPH_REFRESH_EVENT, handleGraphRefresh as EventListener);
    return () =>
      window.removeEventListener(FRIENDS_GRAPH_REFRESH_EVENT, handleGraphRefresh as EventListener);
  }, [refresh]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    friends,
    setFriends,
    incomingRequests,
    outgoingRequests,
    incomingRequestCount: incomingRequests.length,
    outgoingRequestCount: outgoingRequests.length,
    channels,
    refresh,
  } as const;
}
