import type { FriendTarget } from "@/hooks/useHomeFeed/utils";

type JsonRecord = Record<string, unknown> | null;

function parseJsonSafe(response: Response): Promise<JsonRecord> {
  return response
    .json()
    .then((value) => (value && typeof value === "object" ? (value as Record<string, unknown>) : null))
    .catch(() => null);
}

function resolveErrorMessage(payload: JsonRecord, fallback: string): string {
  if (!payload) return fallback;
  const message = payload.message;
  if (typeof message === "string" && message.trim().length > 0) {
    return message;
  }
  const error = payload.error;
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  return fallback;
}

async function ensureOk(response: Response, fallback: string): Promise<JsonRecord> {
  const payload = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(resolveErrorMessage(payload, fallback));
  }
  return payload;
}

export type FeedFetchOptions = {
  limit?: number;
  cursor?: string | null;
  capsuleId?: string | null;
  signal?: AbortSignal;
};

export type FeedFetchResult = {
  posts: unknown[];
  cursor: string | null;
};

function buildFeedUrl(options: FeedFetchOptions): string {
  const params = new URLSearchParams();
  if (typeof options.limit === "number" && Number.isFinite(options.limit)) {
    const limit = Math.max(1, Math.trunc(options.limit));
    params.set("limit", String(limit));
  }
  if (typeof options.cursor === "string" && options.cursor.trim().length > 0) {
    params.set("cursor", options.cursor);
  }
  if (typeof options.capsuleId === "string" && options.capsuleId.trim().length > 0) {
    params.set("capsuleId", options.capsuleId.trim());
  }
  const query = params.toString();
  return query ? `/api/posts?${query}` : "/api/posts";
}

export async function fetchHomeFeed(options: FeedFetchOptions = {}): Promise<FeedFetchResult> {
  const requestUrl = buildFeedUrl(options);
  const init: RequestInit = {};
  if (options.signal) {
    init.signal = options.signal;
  }
  const response = await fetch(requestUrl, init);
  const payload = await ensureOk(response, `Feed request failed (${response.status})`);
  const postsRaw = Array.isArray(payload?.posts) ? (payload!.posts as unknown[]) : [];
  const cursorRaw = payload && typeof payload.cursor === "string" ? payload.cursor : null;
  return { posts: postsRaw, cursor: cursorRaw };
}

export type ToggleLikeParams = {
  postId: string;
  action: "like" | "unlike";
  signal?: AbortSignal;
};

export type ToggleLikeResult = {
  likes: number | null;
  viewerLiked: boolean | null;
};

export async function togglePostLike(params: ToggleLikeParams): Promise<ToggleLikeResult> {
  const { postId, action, signal } = params;
  const init: RequestInit = {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  };
  if (signal) {
    init.signal = signal;
  }
  const response = await fetch(`/api/posts/${encodeURIComponent(postId)}/like`, init);
  const payload = await ensureOk(response, `Like request failed (${response.status})`);
  const likes = typeof payload?.likes === "number" ? (payload.likes as number) : null;
  const viewerLiked =
    typeof payload?.viewerLiked === "boolean"
      ? (payload.viewerLiked as boolean)
      : typeof payload?.viewer_liked === "boolean"
        ? (payload.viewer_liked as boolean)
        : null;
  return { likes, viewerLiked };
}

export type ToggleMemoryParams = {
  postId: string;
  action: "remember" | "forget";
  payload?: Record<string, unknown> | null;
  signal?: AbortSignal;
};

export type ToggleMemoryResult = {
  remembered: boolean | null;
};

export async function togglePostMemory(params: ToggleMemoryParams): Promise<ToggleMemoryResult> {
  const { postId, action, payload, signal } = params;
  const init: RequestInit = {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      action === "remember"
        ? { action, payload: payload ?? {} }
        : { action },
    ),
  };
  if (signal) {
    init.signal = signal;
  }
  const response = await fetch(`/api/posts/${encodeURIComponent(postId)}/memory`, init);
  const data = await ensureOk(response, `Memory request failed (${response.status})`);
  const remembered =
    typeof data?.remembered === "boolean"
      ? (data.remembered as boolean)
      : typeof data?.viewerRemembered === "boolean"
        ? (data.viewerRemembered as boolean)
        : typeof data?.viewer_remembered === "boolean"
          ? (data.viewer_remembered as boolean)
          : null;
  return { remembered };
}

export type FriendAction = "request" | "remove";

export type UpdateFriendOptions = {
  action: FriendAction;
  target: FriendTarget;
  signal?: AbortSignal;
};

export type UpdateFriendResult = {
  message: string | null;
  data: Record<string, unknown> | null;
};

export async function updatePostFriendship(options: UpdateFriendOptions): Promise<UpdateFriendResult> {
  const { action, target, signal } = options;
  const init: RequestInit = {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, target }),
  };
  if (signal) {
    init.signal = signal;
  }
  const response = await fetch("/api/friends/update", init);
  const payload = await ensureOk(response, `Friend ${action} failed (${response.status})`);
  const message =
    typeof payload?.message === "string"
      ? (payload.message as string)
      : typeof payload?.detail === "string"
        ? (payload.detail as string)
        : null;
  return { message, data: payload };
}

export type DeletePostParams = {
  postId: string;
  signal?: AbortSignal;
};

export async function deletePost(params: DeletePostParams): Promise<void> {
  const { postId, signal } = params;
  const init: RequestInit = {
    method: "DELETE",
    credentials: "include",
  };
  if (signal) {
    init.signal = signal;
  }
  const response = await fetch(`/api/posts/${encodeURIComponent(postId)}`, init);
  if (!response.ok) {
    const payload = await parseJsonSafe(response);
    throw new Error(resolveErrorMessage(payload, `Delete failed (${response.status})`));
  }
}
