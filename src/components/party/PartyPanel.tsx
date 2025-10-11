"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

import {
  MicrophoneStage,
  CopySimple,
  LinkSimple,
  Microphone,
  MicrophoneSlash,
  PaperPlaneTilt,
  SignOut,
  Sparkle,
  UsersThree,
  XCircle,
} from "@phosphor-icons/react/dist/ssr";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  useParticipants,
  useRoomContext,
} from "@livekit/components-react";
import { RoomEvent, type Room } from "livekit-client";

import type { FriendItem } from "@/hooks/useFriendsData";
import type { ChatFriendTarget } from "@/components/providers/ChatProvider";
import { usePartyContext, type PartySession } from "@/components/providers/PartyProvider";
import { useCurrentUser } from "@/services/auth/client";
import { sendPartyInviteRequest } from "@/services/party-invite/client";

import styles from "./party-panel.module.css";

type PartyPanelVariant = "default" | "compact";

type PartyPanelProps = {
  friends: FriendItem[];
  friendTargets: Map<string, ChatFriendTarget>;
  onShowFriends(): void;
  variant?: PartyPanelVariant;
};

type PartyStageProps = {
  session: PartySession;
  canClose: boolean;
  status: string;
  onLeave(): Promise<void> | void;
  onClose(): Promise<void> | void;
  onReady(room: Room): void;
  onDisconnected(): void;
};

type InviteStatus = {
  message: string;
  tone: "success" | "warning" | "info";
};

function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return "";
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "";
  const diffMs = Date.now() - timestamp;
  if (diffMs < 0) return "Just now";
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function initialsFromName(name: string | null | undefined): string {
  if (!name) return "★";
  const trimmed = name.trim();
  if (!trimmed) return "★";
  const parts = trimmed.split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

export function PartyPanel({ friends, friendTargets, onShowFriends, variant = "default" }: PartyPanelProps) {
  const searchParams = useSearchParams();
  const {
    status,
    action,
    session,
    error,
    inviteUrl,
    createParty,
    joinParty,
    leaveParty,
    closeParty,
    resetError,
    handleRoomConnected,
    handleRoomDisconnected,
  } = usePartyContext();
  const { user } = useCurrentUser();

  const [displayName, setDisplayName] = React.useState(() => user?.name ?? "");
  const [topic, setTopic] = React.useState("");
  const [joinCode, setJoinCode] = React.useState("");
  const [inviteFeedback, setInviteFeedback] = React.useState<InviteStatus | null>(null);
  const [inviteBusyId, setInviteBusyId] = React.useState<string | null>(null);
  const [copyState, setCopyState] = React.useState<"idle" | "copied">("idle");

  const partyQuery = searchParams?.get("party");

  React.useEffect(() => {
    if (user?.name && !displayName) {
      setDisplayName(user.name);
    }
  }, [user?.name, displayName]);

  React.useEffect(() => {
    if (partyQuery && !session) {
      setJoinCode((prev) => (prev ? prev : partyQuery));
    }
  }, [partyQuery, session]);

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

  const isLoading = status === "loading";
  const isConnecting = status === "connecting";
  const loading = isLoading || isConnecting;

  const inviteableFriends = React.useMemo(() => {
    return friends
      .filter((friend) => Boolean(friend.userId) && friendTargets.has(friend.userId as string))
      .sort((a, b) => {
        const aOnline = a.status === "online" ? 0 : 1;
        const bOnline = b.status === "online" ? 0 : 1;
        if (aOnline !== bOnline) return aOnline - bOnline;
        return a.name.localeCompare(b.name);
      });
  }, [friends, friendTargets]);

  const busyInviteIds = React.useMemo(() => new Set([inviteBusyId].filter(Boolean) as string[]), [inviteBusyId]);

  const handleCreateParty = React.useCallback(async () => {
    const trimmedName = displayName.trim();
    const trimmedTopic = topic.trim();
    await createParty({
      displayName: trimmedName || null,
      topic: trimmedTopic || null,
    });
  }, [createParty, displayName, topic]);

  const handleJoinParty = React.useCallback(async () => {
    if (!joinCode.trim()) return;
    await joinParty(joinCode.trim(), {
      displayName: displayName.trim() || null,
    });
  }, [joinParty, joinCode, displayName]);

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

  const handleInviteFriend = React.useCallback(
    async (friend: FriendItem) => {
      if (!session) {
        setInviteFeedback({
          message: "Start a party first, then invite your friends.",
          tone: "warning",
        });
        return;
      }
      if (!friend.userId) {
        setInviteFeedback({
          message: "That friend cannot be invited right now.",
          tone: "warning",
        });
        return;
      }
      if (!friendTargets.has(friend.userId)) {
        setInviteFeedback({
          message: "We couldn't prepare an invite for that friend.",
          tone: "warning",
        });
        return;
      }
      try {
        setInviteBusyId(friend.id);
        await sendPartyInviteRequest({
          partyId: session.partyId,
          recipientId: friend.userId,
        });
        setInviteFeedback({
          message: `Invite sent to ${friend.name}.`,
          tone: "success",
        });
      } catch (err) {
        console.error("Party invite error", err);
        setInviteFeedback({
          message: err instanceof Error ? err.message : "We couldn't deliver that invite. Try again soon.",
          tone: "warning",
        });
      } finally {
        setInviteBusyId(null);
      }
    },
    [friendTargets, session],
  );

  const handleResetAndLeave = React.useCallback(async () => {
    await leaveParty();
  }, [leaveParty]);

  const handleResetAndClose = React.useCallback(async () => {
    await closeParty();
  }, [closeParty]);

  const createdAtLabel = React.useMemo(
    () => (session ? formatRelativeTime(session.metadata.createdAt) : ""),
    [session],
  );

  const partyStatusLabel = React.useMemo(() => {
    if (isLoading) {
      if (action === "create") return "Spinning up your party...";
      if (action === "close") return "Ending party...";
      if (action === "resume") return "Reconnecting you to your party...";
      return "Preparing...";
    }
    if (isConnecting) {
      if (action === "join") return "Connecting to party...";
      if (action === "resume") return "Re-establishing audio...";
      return "Linking voice...";
    }
    if (!session) return "No active party.";
    if (status === "connected") return "Live and connected.";
    if (action === "resume") return "Trying to reconnect.";
    return "Ready to connect.";
  }, [action, isConnecting, isLoading, session, status]);

  const panelClassName =
    variant === "compact" ? `${styles.panel} ${styles.panelCompact}`.trim() : styles.panel;

  return (
    <div className={panelClassName}>
      {error ? (
        <div className={styles.errorBanner} role="alert">
          <div>
            <XCircle size={18} weight="duotone" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={resetError}
            aria-label="Dismiss error"
            className={styles.dismissButton}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {inviteFeedback ? (
        <div
          className={`${styles.notice} ${
            inviteFeedback.tone === "success"
              ? styles.noticeSuccess
              : inviteFeedback.tone === "warning"
              ? styles.noticeWarning
              : styles.noticeInfo
          }`}
        >
          {inviteFeedback.message}
        </div>
      ) : null}

      {!session ? (
        <div className={styles.heroCard}>
          <div className={styles.heroCopy}>
            <span className={styles.heroKicker}>
              <Sparkle size={18} weight="duotone" />
              Party voice
            </span>
            <h2 className={styles.heroTitle}>Drop-in party chat built for Capsules</h2>
            <p className={styles.heroSubtitle}>
              Start a futuristic voice lobby, sync up instantly, and keep the convo flowing without leaving Capsules.
            </p>
          </div>
          <div className={styles.heroActions}>
            {loading && action === "resume" ? (
              <div className={styles.heroResumeNotice}>Reconnecting you to your last party...</div>
            ) : null}
            <label className={styles.label} htmlFor="party-display-name">
              Display name
            </label>
            <input
              id="party-display-name"
              className={styles.input}
              placeholder="How should others see you?"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              disabled={loading}
            />
            <label className={styles.label} htmlFor="party-topic">
              Party vibe (optional)
            </label>
            <input
              id="party-topic"
              className={styles.input}
              placeholder="Casual catch-up, raid prep, midnight build..."
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              disabled={loading}
            />
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => {
                void handleCreateParty();
              }}
              disabled={loading || !displayName.trim()}
            >
              <UsersThree size={18} weight="duotone" />
              {loading
                ? action === "create"
                  ? "Starting..."
                  : action === "resume"
                  ? "Reconnecting..."
                  : "Start a party"
                : "Start a party"}
            </button>
          </div>
        </div>
      ) : null}

      {session ? (
        <div className={styles.sessionCard}>
          <div className={styles.sessionHeader}>
            <div className={styles.sessionStatus}>
              <MicrophoneStage size={18} weight="duotone" />
              <span>{partyStatusLabel}</span>
            </div>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => {
                void handleCopyInvite();
              }}
              disabled={loading}
            >
              <CopySimple size={16} weight="bold" />
              {copyState === "copied" ? "Copied" : "Copy invite"}
            </button>
          </div>
          <div className={styles.sessionMeta}>
            <div className={styles.metaBlock}>
              <span className={styles.metaLabel}>Party code</span>
              <code className={styles.metaCode}>{session.partyId}</code>
            </div>
            <div className={styles.metaBlock}>
              <span className={styles.metaLabel}>Host</span>
              <span className={styles.metaValue}>
                {session.metadata.ownerDisplayName ?? "Unknown"}
                {session.isOwner ? (
                  <span className={styles.hostBadge}>you</span>
                ) : null}
              </span>
            </div>
            <div className={styles.metaBlock}>
              <span className={styles.metaLabel}>Created</span>
              <span className={styles.metaValue}>{createdAtLabel || "Moments ago"}</span>
            </div>
          </div>
        </div>
      ) : null}

      {session ? (
        <PartyStage
          session={session}
          canClose={session.isOwner}
          status={status}
          onLeave={handleResetAndLeave}
          onClose={handleResetAndClose}
          onReady={handleRoomConnected}
          onDisconnected={handleRoomDisconnected}
        />
      ) : null}

      <div className={styles.joinCard}>
        <div className={styles.joinHeader}>
          <LinkSimple size={18} weight="duotone" />
          <span>Have a code? Jump into a party</span>
        </div>
        <div className={styles.joinRow}>
          <input
            className={styles.input}
            placeholder="party code"
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value)}
            disabled={loading}
          />
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => {
              void handleJoinParty();
            }}
            disabled={loading || !joinCode.trim()}
          >
            {loading
              ? action === "join"
                ? "Connecting..."
                : action === "resume"
                ? "Reconnecting..."
                : "Join"
              : "Join"}
          </button>
        </div>
      </div>

      {session ? (
        <div className={styles.inviteCard}>
          <div className={styles.inviteHeader}>
            <PaperPlaneTilt size={18} weight="duotone" />
            <div>
              <span className={styles.inviteTitle}>Invite friends</span>
              <p className={styles.inviteSubtitle}>
                Drop an invite in chat and they’ll join the voice lobby instantly.
              </p>
            </div>
          </div>

          {inviteableFriends.length === 0 ? (
            <div className={styles.emptyState}>
              <p>You don’t have invite-ready friends yet.</p>
              <button type="button" className={styles.secondaryButton} onClick={onShowFriends}>
                Find friends
              </button>
            </div>
          ) : (
            <ul className={styles.inviteList}>
              {inviteableFriends.map((friend) => {
                const isBusy = busyInviteIds.has(friend.id);
                return (
                  <li key={friend.id} className={styles.inviteRow}>
                    <div className={styles.inviteMeta}>
                      <div className={styles.avatar}>{initialsFromName(friend.name)}</div>
                      <div className={styles.inviteInfo}>
                        <span className={styles.inviteName}>{friend.name}</span>
                        <span
                          className={`${styles.inviteStatus} ${
                            friend.status === "online" ? styles.statusOnline : styles.statusIdle
                          }`}
                        >
                          {friend.status === "online" ? "Online" : "Offline"}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => {
                        void handleInviteFriend(friend);
                      }}
                      disabled={isBusy || loading}
                    >
                      <PaperPlaneTilt size={16} weight="bold" />
                      {isBusy ? "Sending..." : "Invite"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function PartyStage({ session, canClose, status, onLeave, onClose, onReady, onDisconnected }: PartyStageProps) {
  return (
    <div className={styles.stageCard}>
      <LiveKitRoom
        key={session.partyId}
        serverUrl={session.livekitUrl}
        token={session.token}
        connect
        audio
        video={false}
        connectOptions={{ autoSubscribe: true }}
        onDisconnected={() => {
          onDisconnected();
        }}
      >
        <RoomAudioRenderer />
        <StartAudio label="Tap to allow party audio" className={styles.startAudio} />
        <PartyStageScene
          session={session}
          canClose={canClose}
          status={status}
          onLeave={onLeave}
          onClose={onClose}
          onReady={onReady}
          onDisconnected={onDisconnected}
        />
      </LiveKitRoom>
    </div>
  );
}

type PartyStageSceneProps = {
  session: PartySession;
  canClose: boolean;
  status: string;
  onLeave(): Promise<void> | void;
  onClose(): Promise<void> | void;
  onReady(room: Room): void;
  onDisconnected(): void;
};

function PartyStageScene({
  session: _session,
  canClose,
  status,
  onLeave,
  onClose,
  onReady,
  onDisconnected,
}: PartyStageSceneProps) {
  const room = useRoomContext();
  const participants = useParticipants();
  const [micEnabled, setMicEnabled] = React.useState<boolean>(true);
  const [micBusy, setMicBusy] = React.useState(false);

  React.useEffect(() => {
    if (!room) return;

    const handleRoomDisconnected = () => {
      onDisconnected();
    };

    onReady(room);
    setMicEnabled(room.localParticipant?.isMicrophoneEnabled ?? true);
    room.on(RoomEvent.Disconnected, handleRoomDisconnected);

    return () => {
      room.off(RoomEvent.Disconnected, handleRoomDisconnected);
    };
  }, [onDisconnected, onReady, room]);

  const handleToggleMic = React.useCallback(async () => {
    if (!room) return;
    const next = !(room.localParticipant?.isMicrophoneEnabled ?? true);
    setMicBusy(true);
    try {
      await room.localParticipant?.setMicrophoneEnabled(next);
      setMicEnabled(next);
    } catch (err) {
      console.warn("Toggle microphone failed", err);
      setMicEnabled(room.localParticipant?.isMicrophoneEnabled ?? true);
    } finally {
      setMicBusy(false);
    }
  }, [room]);

  const participantCount = participants.length;

  return (
    <div className={styles.stageInner}>
      <div className={styles.stageHeader}>
        <span className={styles.stageTitle}>Live lobby</span>
        <span className={styles.stageMeta}>
          {participantCount} participant{participantCount === 1 ? "" : "s"}
        </span>
      </div>
      <div className={styles.participantsGrid}>
        {participants.map((participant) => {
          const isLocal = participant.identity === room?.localParticipant?.identity;
          return (
            <ParticipantBadge
              key={participant.sid}
              participant={participant}
              isLocal={Boolean(isLocal)}
            />
          );
        })}
        {participants.length === 0 ? (
          <div className={styles.participantEmpty}>
            <span>No one has joined yet. Share your invite to get the party started.</span>
          </div>
        ) : null}
      </div>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.controlButton}
          onClick={() => {
            void handleToggleMic();
          }}
          disabled={micBusy || !room}
        >
          {micEnabled ? <Microphone size={16} weight="bold" /> : <MicrophoneSlash size={16} weight="bold" />}
          {micEnabled ? "Mute" : "Unmute"}
        </button>
        <button
          type="button"
          className={styles.controlButton}
          onClick={() => {
            void onLeave();
          }}
        >
          <SignOut size={16} weight="bold" />
          Leave party
        </button>
        {canClose ? (
          <button
            type="button"
            className={`${styles.controlButton} ${styles.controlDanger}`}
            onClick={() => {
              void onClose();
            }}
          >
            <XCircle size={16} weight="bold" />
            End party for everyone
          </button>
        ) : null}
      </div>
      {status !== "connected" ? (
        <div className={styles.statusHint}>
          <span>Connection status: {status}</span>
        </div>
      ) : null}
    </div>
  );
}

type ParticipantBadgeProps = {
  participant: ReturnType<typeof useParticipants>[number];
  isLocal: boolean;
};

function ParticipantBadge({ participant, isLocal }: ParticipantBadgeProps) {
  const speaking = participant.isSpeaking;
  const mic = participant.isMicrophoneEnabled;
  const name = participant.name || participant.identity || "Guest";
  return (
    <div className={`${styles.participantCard} ${speaking ? styles.participantSpeaking : ""}`}>
      <div className={styles.participantAvatar}>{initialsFromName(name)}</div>
      <div className={styles.participantDetails}>
        <div className={styles.participantNameRow}>
          <span className={styles.participantName}>{name}</span>
          {isLocal ? <span className={styles.participantBadge}>you</span> : null}
        </div>
        <div className={styles.participantState}>
          {mic ? <Microphone size={14} weight="bold" /> : <MicrophoneSlash size={14} weight="bold" />}
          <span>{mic ? (speaking ? "Speaking" : "Live") : "Muted"}</span>
        </div>
      </div>
    </div>
  );
}

