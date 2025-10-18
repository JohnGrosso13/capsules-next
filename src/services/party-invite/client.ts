import type { PartyInviteSummary } from "@/types/party";

type PartyInviteListResponse = {
  success: true;
  incoming: PartyInviteSummary[];
  sent: PartyInviteSummary[];
};

type PartyInviteMutationResponse = {
  success: true;
  invite: PartyInviteSummary;
};

async function handleResponse<T>(res: Response): Promise<T> {
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (payload && typeof payload?.message === "string" && payload.message) ||
      (payload && typeof payload?.error === "string" && payload.error) ||
      `Request failed (${res.status})`;
    throw new Error(message);
  }
  return payload as T;
}

export async function fetchPartyInvites(): Promise<PartyInviteListResponse> {
  const res = await fetch("/api/party/invite", {
    method: "GET",
    credentials: "include",
    headers: { "content-type": "application/json" },
  });
  return handleResponse<PartyInviteListResponse>(res);
}

export async function sendPartyInviteRequest(payload: {
  partyId: string;
  recipientId: string;
  message?: string | null;
}): Promise<PartyInviteSummary> {
  const res = await fetch("/api/party/invite", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      partyId: payload.partyId,
      recipientId: payload.recipientId,
      ...(payload.message ? { message: payload.message } : {}),
    }),
  });
  const data = await handleResponse<PartyInviteMutationResponse>(res);
  return data.invite;
}

export async function respondToPartyInvite(
  inviteId: string,
  action: "accept" | "decline" | "cancel",
): Promise<PartyInviteSummary> {
  const res = await fetch(`/api/party/invite/${inviteId}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action }),
  });
  const data = await handleResponse<PartyInviteMutationResponse>(res);
  return data.invite;
}
