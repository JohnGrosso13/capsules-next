export type FriendTarget = Record<string, unknown>;

async function postUpdate(body: Record<string, unknown>) {
  const res = await fetch("/api/friends/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (data && typeof data.message === "string" && data.message) ||
      (data && typeof data.error === "string" && data.error) ||
      "Friends update failed.";
    throw new Error(message);
  }
  return data as Record<string, unknown>;
}

export async function removeFriend(target: FriendTarget) {
  return postUpdate({ action: "remove", target });
}

export async function requestFriend(target: FriendTarget) {
  return postUpdate({ action: "request", target });
}

