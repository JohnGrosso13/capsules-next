"use client";

import * as React from "react";

import type { ChatFriendTarget } from "@/components/providers/ChatProvider";
import type { PartySession } from "@/components/providers/PartyProvider";
import type { FriendItem } from "@/hooks/useFriendsData";
import { sendPartyInviteRequest } from "@/services/party-invite/client";

import type { InviteStatus } from "../partyTypes";

type UsePartyInvitesOptions = {
  session: PartySession | null;
  inviteUrl: string | null;
  friendTargets: Map<string, ChatFriendTarget>;
  inviteableFriendsByUserId: Map<string, FriendItem>;
};

export function usePartyInvites({
  session,
  inviteUrl,
  friendTargets,
  inviteableFriendsByUserId,
}: UsePartyInvitesOptions) {
  const [inviteFeedback, setInviteFeedback] = React.useState<InviteStatus | null>(null);
  const [inviteSending, setInviteSending] = React.useState(false);
  const [inviteError, setInviteError] = React.useState<string | null>(null);
  const [copyState, setCopyState] = React.useState<"idle" | "copied">("idle");
  const [showInviteDetails, setShowInviteDetails] = React.useState(false);
  const [invitePickerOpen, setInvitePickerOpen] = React.useState(false);

  const handleCopyInvite = React.useCallback(async () => {
    if (!session) return;
    const content = inviteUrl ?? session.partyId;
    try {
      await navigator.clipboard.writeText(content);
      setCopyState("copied");
      setInviteFeedback({
        message: "Invite link copied to your clipboard.",
        tone: "success",
      });
    } catch (err) {
      console.error("Copy failed", err);
      setCopyState("idle");
      setInviteFeedback({
        message: "We couldn't copy the invite link. Copy it manually.",
        tone: "warning",
      });
    }
  }, [inviteUrl, session]);

  const handleGenerateInvite = React.useCallback(async () => {
    await handleCopyInvite();
    setShowInviteDetails(true);
  }, [handleCopyInvite]);

  const handleOpenInvitePicker = React.useCallback(() => {
    setInviteError(null);
    setInvitePickerOpen(true);
  }, []);

  const handleCloseInvitePicker = React.useCallback(() => {
    setInviteError(null);
    setInvitePickerOpen(false);
  }, []);

  const handleInviteFriends = React.useCallback(
    async (userIds: string[]) => {
      if (!session) {
        setInviteError("Start a party first, then invite your friends.");
        setInviteFeedback({
          message: "Start a party first, then invite your friends.",
          tone: "warning",
        });
        return;
      }
      const unique = Array.from(new Set(userIds));
      if (!unique.length) {
        setInviteError("Pick at least one friend to invite.");
        return;
      }
      const validIds = unique.filter((userId) => friendTargets.has(userId));
      if (!validIds.length) {
        setInviteError("Those friends cannot be invited right now.");
        return;
      }
      setInviteSending(true);
      setInviteError(null);
      try {
        for (const userId of validIds) {
          await sendPartyInviteRequest({
            partyId: session.partyId,
            recipientId: userId,
          });
        }
        const namedTargets = validIds
          .map((id) => inviteableFriendsByUserId.get(id)?.name)
          .filter(Boolean);
        const successMessage =
          namedTargets.length === 1
            ? `Invite sent to ${namedTargets[0]}.`
            : `Invites sent to ${namedTargets.length} friends.`;
        setInviteFeedback({
          message: successMessage,
          tone: "success",
        });
        setInvitePickerOpen(false);
      } catch (err) {
        console.error("Party invite error", err);
        const message =
          err instanceof Error
            ? err.message
            : "We couldn't deliver those invites. Try again soon.";
        setInviteError(message);
        setInviteFeedback({
          message: "We couldn't deliver one or more invites. Try again soon.",
          tone: "warning",
        });
      } finally {
        setInviteSending(false);
      }
    },
    [friendTargets, inviteableFriendsByUserId, session],
  );

  React.useEffect(() => {
    if (copyState !== "copied") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 2400);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  React.useEffect(() => {
    if (!inviteFeedback) return;
    const timer = window.setTimeout(() => setInviteFeedback(null), 3800);
    return () => window.clearTimeout(timer);
  }, [inviteFeedback]);

  React.useEffect(() => {
    if (!session) {
      setShowInviteDetails(false);
    }
  }, [session?.partyId, session]);

  return {
    copyState,
    inviteFeedback,
    inviteSending,
    inviteError,
    invitePickerOpen,
    showInviteDetails,
    handleOpenInvitePicker,
    handleCloseInvitePicker,
    handleInviteFriends,
    handleGenerateInvite,
    handleCopyInvite,
    setInviteError,
  };
}
