import { createNotifications } from "@/server/notifications/service";
import { fetchPostCoreById } from "@/server/posts/repository";
import { listCapsuleFollowers, listCapsuleMembers, getCapsuleSummaryForViewer } from "@/server/capsules/repository";
import type { FriendRequestSummary } from "@/server/friends/types";
import type { CapsuleMemberRequestSummary } from "@/types/capsules";
import type {
  CapsuleLadderDetail,
  CapsuleLadderMember,
  LadderChallenge,
  LadderMatchRecord,
} from "@/types/ladders";

function trimString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function truncate(value: string | null | undefined, max = 200): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.length) return null;
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

function buildPostHref(postId: string | null, capsuleId?: string | null): string | null {
  const normalizedId = trimString(postId);
  if (!normalizedId) return null;
  const params = new URLSearchParams({ postId: normalizedId });
  if (capsuleId) {
    params.set("capsuleId", capsuleId);
  }
  return `/home?${params.toString()}`;
}

function collectUserIds(...groups: Array<Array<string | null | undefined>>): string[] {
  const set = new Set<string>();
  for (const group of groups) {
    for (const entry of group) {
      const normalized = trimString(entry);
      if (normalized) set.add(normalized);
    }
  }
  return Array.from(set);
}

export async function notifyPostComment(options: {
  postId: string | null;
  commentAuthorId: string | null;
  commentAuthorName?: string | null;
  commentContent?: string | null;
  capsuleId?: string | null;
}): Promise<void> {
  const resolvedPostId = trimString(options.postId);
  const authorId = trimString(options.commentAuthorId);
  if (!resolvedPostId || !authorId) return;

  let postAuthorId: string | null = null;
  let postClientId: string | null = null;
  let postCapsuleId: string | null = trimString(options.capsuleId);

  try {
    const post = await fetchPostCoreById(resolvedPostId);
    postAuthorId = trimString(post?.author_user_id ?? null);
    postClientId =
      trimString((post as { client_id?: unknown })?.client_id as string | null) ??
      trimString((post as { id?: unknown })?.id as string | null) ??
      resolvedPostId;
    postCapsuleId = trimString((post as { capsule_id?: unknown })?.capsule_id as string | null) ?? postCapsuleId;
  } catch (error) {
    console.warn("notifyPostComment: unable to fetch post", error);
  }

  const recipientId = postAuthorId;
  if (!recipientId || recipientId === authorId) return;

  const actorName = trimString(options.commentAuthorName) ?? "Someone";
  const href = buildPostHref(postClientId ?? resolvedPostId, postCapsuleId);
  const body = truncate(options.commentContent, 180);

  try {
    await createNotifications(
      [recipientId],
      {
        type: "comment_on_post",
        title: `${actorName} commented on your post`,
        body,
        href,
        data: {
          postId: postClientId ?? resolvedPostId,
          capsuleId: postCapsuleId,
          actorName,
        },
        actorId: authorId,
      },
      { respectPreferences: true },
    );
  } catch (error) {
    console.warn("notifyPostComment error", error);
  }
}

export async function notifyCapsulePost(options: {
  capsuleId: string | null;
  authorId: string | null;
  authorName?: string | null;
  postClientId?: string | null;
  postRecordId?: string | null;
  excerpt?: string | null;
}): Promise<void> {
  const capsuleId = trimString(options.capsuleId);
  const authorId = trimString(options.authorId);
  if (!capsuleId || !authorId) return;

  let capsuleName: string | null = null;
  try {
    const summary = await getCapsuleSummaryForViewer(capsuleId, authorId);
    capsuleName = trimString(summary?.name ?? null);
  } catch (error) {
    console.warn("notifyCapsulePost: capsule summary lookup failed", error);
  }

  let recipients: string[] = [];
  try {
    const members = await listCapsuleMembers(capsuleId);
    const followers = await listCapsuleFollowers(capsuleId);
    recipients = collectUserIds(
      members.map((member) => member.userId),
      followers.map((follower) => follower.userId),
    ).filter((id) => id !== authorId);
  } catch (error) {
    console.warn("notifyCapsulePost: member lookup failed", error);
    return;
  }

  if (!recipients.length) return;

  const actorName = trimString(options.authorName) ?? "Someone";
  const postId = trimString(options.postClientId) ?? trimString(options.postRecordId);
  const href = postId ? buildPostHref(postId, capsuleId) : null;
  const body = truncate(options.excerpt, 220);
  const title = capsuleName
    ? `${actorName} posted in ${capsuleName}`
    : `${actorName} shared a new post`;

  try {
    await createNotifications(
      recipients,
      {
        type: "capsule_new_post",
        title,
        body,
        href,
        data: {
          postId,
          capsuleId,
          actorName,
          capsuleName,
        },
        actorId: authorId,
      },
      { respectPreferences: true },
    );
  } catch (error) {
    console.warn("notifyCapsulePost error", error);
  }
}

export async function notifyFriendRequest(request: FriendRequestSummary): Promise<void> {
  const recipientId = trimString(request.recipientId);
  const requesterId = trimString(request.requesterId);
  if (!recipientId || !requesterId || recipientId === requesterId) return;

  const requesterName = trimString(request.user?.name) ?? "A Capsules member";
  const href = "/friends?tab=requests";
  const body = truncate(request.message, 180);

  try {
    await createNotifications(
      [recipientId],
      {
        type: "friend_request",
        title: `New friend request from ${requesterName}`,
        body: body ?? "Review the request on your Friends tab.",
        href,
        data: {
          requestId: request.id,
          requesterId,
        },
        actorId: requesterId,
      },
      { respectPreferences: true },
    );
  } catch (error) {
    console.warn("notifyFriendRequest error", error);
  }
}

export async function notifyFriendRequestAccepted(request: FriendRequestSummary): Promise<void> {
  const requesterId = trimString(request.requesterId);
  const recipientId = trimString(request.recipientId);
  if (!requesterId || !recipientId || requesterId === recipientId) return;

  const recipientName = trimString(request.user?.name) ?? "A Capsules member";
  const href = "/friends";

  try {
    await createNotifications(
      [requesterId],
      {
        type: "friend_request_accepted",
        title: `${recipientName} accepted your friend request`,
        body: "You can start a chat or follow their updates.",
        href,
        data: {
          requestId: request.id,
          userId: recipientId,
        },
        actorId: recipientId,
      },
      { respectPreferences: true },
    );
  } catch (error) {
    console.warn("notifyFriendRequestAccepted error", error);
  }
}

export async function notifyCapsuleInvite(invite: CapsuleMemberRequestSummary): Promise<void> {
  const targetUserId = trimString(invite.requesterId);
  const initiatorId = trimString(invite.initiatorId);
  if (!targetUserId || (initiatorId && targetUserId === initiatorId)) return;

  const inviterName =
    trimString(invite.initiator?.name ?? null) ??
    trimString(invite.capsuleName ?? null) ??
    "Capsule owner";
  const capsuleName = trimString(invite.capsuleName ?? null) ?? "a capsule";
  const href = "/friends?tab=requests";

  try {
    await createNotifications(
      [targetUserId],
      {
        type: "capsule_invite",
        title: `You're invited to join ${capsuleName}`,
        body: `${inviterName} wants you to collaborate in ${capsuleName}.`,
        href,
        data: {
          requestId: invite.id,
          capsuleId: invite.capsuleId,
        },
        actorId: initiatorId,
      },
      { respectPreferences: true },
    );
  } catch (error) {
    console.warn("notifyCapsuleInvite error", error);
  }
}

export async function notifyLadderChallenge(options: {
  ladder: CapsuleLadderDetail;
  challenge: LadderChallenge;
  members: CapsuleLadderMember[];
  actorId?: string | null;
}): Promise<void> {
  const opponent = options.members.find((member) => member.id === options.challenge.opponentId);
  const challenger = options.members.find((member) => member.id === options.challenge.challengerId);
  const opponentUserId = trimString(opponent?.userId ?? null);
  const actorId = trimString(options.actorId ?? null);
  if (!opponentUserId || opponentUserId === actorId) return;

  const challengerName = trimString(challenger?.displayName) ?? "A challenger";
  const ladderName = trimString(options.ladder.name) ?? "your ladder";
  const href = `/create/ladders?ladderId=${encodeURIComponent(options.ladder.id)}`;

  try {
    await createNotifications(
      [opponentUserId],
      {
        type: "ladder_challenge",
        title: `${challengerName} challenged you on ${ladderName}`,
        body: truncate(options.challenge.note, 160) ?? "Review and respond to the challenge.",
        href,
        data: {
          ladderId: options.ladder.id,
          challengeId: options.challenge.id,
        },
        actorId,
      },
      { respectPreferences: true },
    );
  } catch (error) {
    console.warn("notifyLadderChallenge error", error);
  }
}

export async function notifyLadderChallengeResolved(options: {
  ladder: CapsuleLadderDetail;
  challenge: LadderChallenge;
  history: LadderMatchRecord;
  members: CapsuleLadderMember[];
  actorId?: string | null;
}): Promise<void> {
  const opponent = options.members.find((member) => member.id === options.challenge.opponentId);
  const challenger = options.members.find((member) => member.id === options.challenge.challengerId);
  const opponentUserId = trimString(opponent?.userId ?? null);
  const challengerUserId = trimString(challenger?.userId ?? null);
  const actorId = trimString(options.actorId ?? null);
  const ladderName = trimString(options.ladder.name) ?? "your ladder";
  const href = `/create/ladders?ladderId=${encodeURIComponent(options.ladder.id)}`;

  const recipients = [opponentUserId, challengerUserId]
    .filter((id): id is string => Boolean(id))
    .filter((id, index, arr) => arr.indexOf(id) === index && id !== actorId);

  if (!recipients.length) return;

  const title = `Match resolved on ${ladderName}`;
  const body =
    options.history.outcome === "draw"
      ? "Match recorded as a draw."
      : `${options.history.outcome === "challenger" ? "Challenger" : "Opponent"} reported a win.`;

  try {
    await createNotifications(
      recipients,
      {
        type: "ladder_challenge_resolved",
        title,
        body,
        href,
        data: {
          ladderId: options.ladder.id,
          challengeId: options.challenge.id,
        },
        actorId,
      },
      { respectPreferences: true },
    );
  } catch (error) {
    console.warn("notifyLadderChallengeResolved error", error);
  }
}
