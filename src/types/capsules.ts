export type CapsuleMemberProfile = {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  userKey: string | null;
};

export type CapsuleMemberSummary = {
  userId: string;
  role: string | null;
  joinedAt: string | null;
  name: string | null;
  avatarUrl: string | null;
  userKey: string | null;
  isOwner: boolean;
};

export type CapsuleMemberRequestStatus = "pending" | "approved" | "declined" | "cancelled";

export type CapsuleMemberRequestSummary = {
  id: string;
  capsuleId: string;
  requesterId: string;
  responderId: string | null;
  status: CapsuleMemberRequestStatus;
  role: string | null;
  message: string | null;
  createdAt: string | null;
  respondedAt: string | null;
  approvedAt: string | null;
  declinedAt: string | null;
  cancelledAt: string | null;
  requester: CapsuleMemberProfile | null;
};

export type CapsuleMembershipViewer = {
  userId: string | null;
  isOwner: boolean;
  isMember: boolean;
  canManage: boolean;
  canRequest: boolean;
  role: string | null;
  memberSince: string | null;
  requestStatus: CapsuleMemberRequestStatus | "none";
  requestId: string | null;
};

export type CapsuleMembershipState = {
  capsule: {
    id: string;
    name: string | null;
    slug: string | null;
    ownerId: string;
  };
  viewer: CapsuleMembershipViewer;
  counts: {
    members: number;
    pendingRequests: number;
  };
  members: CapsuleMemberSummary[];
  requests: CapsuleMemberRequestSummary[];
  viewerRequest: CapsuleMemberRequestSummary | null;
};

export type CapsuleMembershipAction =
  | "request_join"
  | "approve_request"
  | "decline_request"
  | "remove_member";

