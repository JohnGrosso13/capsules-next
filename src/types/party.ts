export type PartyInviteStatus = "pending" | "accepted" | "declined" | "cancelled" | "expired";

export type PartyInviteUser = {
  id: string;
  key: string | null;
  name: string | null;
  avatarUrl: string | null;
};

export type PartyInviteSummary = {
  id: string;
  partyId: string;
  senderId: string;
  recipientId: string;
  status: PartyInviteStatus;
  topic: string | null;
  message: string | null;
  createdAt: string | null;
  respondedAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  cancelledAt: string | null;
  expiresAt: string | null;
  sender: PartyInviteUser | null;
};
