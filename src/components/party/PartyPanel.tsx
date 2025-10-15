"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";

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
  useParticipants,
  useRoomContext,
  useStartAudio,
} from "@livekit/components-react";
import { RoomEvent, type Room } from "livekit-client";

import type { FriendItem } from "@/hooks/useFriendsData";
import type { ChatFriendTarget } from "@/components/providers/ChatProvider";
import { usePartyContext, type PartySession } from "@/components/providers/PartyProvider";
import { useCurrentUser } from "@/services/auth/client";
import { sendPartyInviteRequest } from "@/services/party-invite/client";

import styles from "./party-panel.module.css";

type PartyPanelVariant = "default" | "compact";

type ParticipantProfile = {
  name: string | null;
  avatar: string | null;
};

type NavigatorUserMediaSuccessCallback = (stream: MediaStream) => void;
type NavigatorUserMediaErrorCallback = (error: DOMException) => void;

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
  participantProfiles: Map<string, ParticipantProfile>;
  onLeave(): Promise<void> | void;
  onClose(): Promise<void> | void;
  onReconnecting(): void;
  onReady(room: Room): void;
  onDisconnected(): void;
};

type InviteStatus = {
  message: string;
  tone: "success" | "warning" | "info";
};

type LegacyGetUserMediaFn = (
  constraints: MediaStreamConstraints,
  successCallback: NavigatorUserMediaSuccessCallback,
  errorCallback?: NavigatorUserMediaErrorCallback,
) => void;

type LegacyNavigator = Navigator & {
  webkitGetUserMedia?: LegacyGetUserMediaFn;
  mozGetUserMedia?: LegacyGetUserMediaFn;
  getUserMedia?: LegacyGetUserMediaFn;
};

async function requestMicrophonePermission(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!window.isSecureContext) {
    throw new Error(
      "Microphone access requires a secure connection. Reopen Capsules over HTTPS or use a trusted tunnel when testing on mobile.",
    );
  }
  const nav = window.navigator as LegacyNavigator;

  const modernGetUserMedia = nav.mediaDevices?.getUserMedia?.bind(nav.mediaDevices);
  const legacyGetUserMedia =
    nav.getUserMedia?.bind(nav) ??
    nav.webkitGetUserMedia?.bind(nav) ??
    nav.mozGetUserMedia?.bind(nav) ??
    null;

  if (!modernGetUserMedia && !legacyGetUserMedia) {
    throw new Error("Microphone access is not supported in this browser.");
  }

  let stream: MediaStream | null = null;

  try {
    if (modernGetUserMedia) {
      stream = await modernGetUserMedia({ audio: true });
    } else if (legacyGetUserMedia) {
      stream = await new Promise<MediaStream>((resolve, reject) => {
        legacyGetUserMedia(
          { audio: true },
          (legacyStream: MediaStream) => resolve(legacyStream),
          (error: DOMException) => reject(error),
        );
      });
    }
  } catch (permissionError) {
    throw normalizeMicrophoneError(permissionError);
  } finally {
    stream?.getTracks().forEach((track) => track.stop());
  }
}

function normalizeMicrophoneError(error: unknown): Error {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return new Error(
      "Microphone access requires HTTPS. Reopen Capsules using https:// or a secure tunnel when testing on mobile.",
    );
  }
  if (error instanceof DOMException) {
    switch (error.name) {
      case "NotAllowedError":
      case "PermissionDeniedError":
        return new Error("Capsules does not have permission to use your microphone. Enable it in your browser settings and try again.");
      case "NotReadableError":
      case "AbortError":
        return new Error("Your microphone is busy with another app. Close other apps using the mic and try again.");
      case "SecurityError":
        return new Error(
          "Microphone access is blocked in this context. Use HTTPS or adjust your browser privacy settings.",
        );
      case "NotFoundError":
      case "DevicesNotFoundError":
        return new Error("We couldn't find an available microphone. Connect one and try again.");
      default:
        break;
    }
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error("We couldn't access your microphone. Please try again.");
}


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

export function PartyPanel({
  friends,
  friendTargets,
  onShowFriends,
  variant = "default",
}: PartyPanelProps) {
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
    handleRoomReconnecting,
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
  const [showInviteDetails, setShowInviteDetails] = React.useState(false);
  const inviteRevealTimer = React.useRef<number | null>(null);

  const participantProfiles = React.useMemo(() => {
    const map = new Map<string, ParticipantProfile>();
    friendTargets.forEach((target, userId) => {
      map.set(userId, {
        name: target.name ?? null,
        avatar: target.avatar ?? null,
      });
    });
    if (user?.id) {
      map.set(user.id, {
        name: user.name ?? user.email ?? null,
        avatar: user.avatarUrl ?? null,
      });
    }
    return map;
  }, [friendTargets, user?.avatarUrl, user?.email, user?.id, user?.name]);

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

  React.useEffect(() => {
    return () => {
      if (inviteRevealTimer.current !== null) {
        window.clearTimeout(inviteRevealTimer.current);
        inviteRevealTimer.current = null;
      }
    };
  }, []);

  React.useEffect(() => {
    if (!session) {
      setShowInviteDetails(false);
      if (inviteRevealTimer.current !== null) {
        window.clearTimeout(inviteRevealTimer.current);
        inviteRevealTimer.current = null;
      }
    }
  }, [session?.partyId, session]);

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

  const busyInviteIds = React.useMemo(
    () => new Set([inviteBusyId].filter(Boolean) as string[]),
    [inviteBusyId],
  );

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

  const handleGenerateInvite = React.useCallback(async () => {
    await handleCopyInvite();
    setShowInviteDetails(true);
    if (inviteRevealTimer.current !== null) {
      window.clearTimeout(inviteRevealTimer.current);
      inviteRevealTimer.current = null;
    }
    inviteRevealTimer.current = window.setTimeout(() => {
      setShowInviteDetails(false);
      setCopyState("idle");
    }, 10000);
  }, [handleCopyInvite]);

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
          message:
            err instanceof Error ? err.message : "We couldn't deliver that invite. Try again soon.",
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
  const tileClassName =
    variant === "compact" ? `${styles.partyTile} ${styles.partyTileCompact}`.trim() : styles.partyTile;

  const renderInactiveTile = () => (
    <>
      <header className={styles.tileHeader}>
        <div className={styles.tileHeading}>
          <span className={styles.tileEyebrow}>Party voice</span>
          <h2 className={styles.tileTitle}>Host a party lobby</h2>
          <p className={styles.tileSubtitle}>
            Set a vibe, invite friends, and jump into voice together in seconds.
          </p>
        </div>
      </header>
      <section className={`${styles.section} ${styles.sectionSplit}`.trim()}>
        <div className={styles.sectionBody}>
          {loading && action === "resume" ? (
            <div className={styles.sectionNotice}>Reconnecting you to your last party...</div>
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
        <div className={styles.sectionAside}>
          <div className={styles.sectionAsideInner}>
            <Sparkle size={18} weight="duotone" />
            <span>Parties run in the background so you can keep browsing Capsules.</span>
          </div>
        </div>
      </section>
      <section className={styles.section}>
        <div className={styles.sectionHeaderRow}>
          <LinkSimple size={18} weight="duotone" />
          <span>Have a code? Jump into a party</span>
        </div>
        <div className={styles.inlineJoin}>
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
      </section>
    </>
  );

  const renderActiveTile = (currentSession: PartySession) => (
    <>
      <header className={styles.tileHeader}>
        <div className={styles.headerMeta}>
          <span className={styles.statusPill}>
            <MicrophoneStage size={16} weight="duotone" />
            {partyStatusLabel}
          </span>
          <div className={styles.headerDetailRow}>
            <span className={styles.metaLabel}>Host</span>
            <span className={styles.metaValue}>
              {currentSession.metadata.ownerDisplayName ?? "Unknown"}
              {currentSession.isOwner ? <span className={styles.hostBadge}>you</span> : null}
            </span>
          </div>
          <div className={styles.headerDetailRow}>
            <span className={styles.metaLabel}>Created</span>
            <span className={styles.metaValue}>{createdAtLabel || "Moments ago"}</span>
          </div>
        </div>
        <div className={styles.headerActions}>
          {showInviteDetails ? <code className={styles.codeChip}>{currentSession.partyId}</code> : null}
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => {
              void handleGenerateInvite();
            }}
            disabled={loading}
          >
            <CopySimple size={16} weight="bold" />
            {copyState === "copied" ? "Invite copied" : "Generate invite"}
          </button>
        </div>
      </header>
      <section className={styles.section}>
        <PartyStage
          session={currentSession}
          canClose={currentSession.isOwner}
          status={status}
          participantProfiles={participantProfiles}
          onLeave={handleResetAndLeave}
          onClose={handleResetAndClose}
          onReconnecting={handleRoomReconnecting}
          onReady={handleRoomConnected}
          onDisconnected={handleRoomDisconnected}
        />
      </section>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>Invite friends</span>
          <p className={styles.sectionSubtitle}>
            Drop an invite in chat and they&apos;ll join the voice lobby instantly.
          </p>
        </div>
        <div className={styles.sectionBody}>
          {inviteableFriends.length === 0 ? (
            <div className={styles.emptyState}>
              <p>You don&apos;t have invite-ready friends yet.</p>
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
      </section>
      <section className={styles.section}>
        <div className={styles.sectionHeaderRow}>
          <LinkSimple size={18} weight="duotone" />
          <span>Need to join manually?</span>
        </div>
        <div className={styles.inlineJoin}>
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
      </section>
    </>
  );

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

      <div className={tileClassName}>
        {session ? renderActiveTile(session) : renderInactiveTile()}
      </div>
    </div>
  );
}

function PartyStage({
  session,
  canClose,
  status,
  participantProfiles,
  onLeave,
  onClose,
  onReconnecting,
  onReady,
  onDisconnected,
}: PartyStageProps) {
  return (
    <LiveKitRoom
      key={session.partyId}
      serverUrl={session.livekitUrl}
      token={session.token}
      connect
      audio
      video={false}
      connectOptions={{ autoSubscribe: true }}
    >
      <RoomAudioRenderer />
      <PartyStageScene
        session={session}
        canClose={canClose}
        status={status}
        participantProfiles={participantProfiles}
        onLeave={onLeave}
        onClose={onClose}
        onReconnecting={onReconnecting}
        onReady={onReady}
        onDisconnected={onDisconnected}
      />
    </LiveKitRoom>
  );
}

type PartyStageSceneProps = {
  session: PartySession;
  canClose: boolean;
  status: string;
  participantProfiles: Map<string, ParticipantProfile>;
  onLeave(): Promise<void> | void;
  onClose(): Promise<void> | void;
  onReconnecting(): void;
  onReady(room: Room): void;
  onDisconnected(): void;
};

function PartyStageScene({
  session: _session,
  canClose,
  status,
  participantProfiles,
  onLeave,
  onClose,
  onReconnecting,
  onReady,
  onDisconnected,
}: PartyStageSceneProps) {
  const room = useRoomContext();
  const participants = useParticipants();
  const [micEnabled, setMicEnabled] = React.useState<boolean>(true);
  const [micBusy, setMicBusy] = React.useState(false);
  const [micNotice, setMicNotice] = React.useState<string | null>(null);
  const { mergedProps: startAudioProps, canPlayAudio } = useStartAudio({
    room,
    props: {
      type: "button",
      className: `${styles.controlButton} ${styles.startAudio}`,
    },
  });
  const startAudioButtonProps = React.useMemo(() => {
    const { style: _style, ...rest } = startAudioProps;
    return rest;
  }, [startAudioProps]);

  React.useEffect(() => {
    if (!room) return;

    const handleRoomDisconnected = () => {
      onDisconnected();
    };
    const handleRoomReconnecting = () => {
      onReconnecting();
    };
    const handleRoomReconnected = () => {
      onReady(room);
    };

    onReady(room);
    setMicEnabled(room.localParticipant?.isMicrophoneEnabled ?? true);
    room.on(RoomEvent.Disconnected, handleRoomDisconnected);
    room.on(RoomEvent.Reconnecting, handleRoomReconnecting);
    room.on(RoomEvent.Reconnected, handleRoomReconnected);

    return () => {
      room.off(RoomEvent.Disconnected, handleRoomDisconnected);
      room.off(RoomEvent.Reconnecting, handleRoomReconnecting);
      room.off(RoomEvent.Reconnected, handleRoomReconnected);
    };
  }, [onDisconnected, onReady, onReconnecting, room]);

  const handleToggleMic = React.useCallback(async () => {
    if (!room) return;
    const next = !(room.localParticipant?.isMicrophoneEnabled ?? true);
    setMicBusy(true);
    try {
      if (next) {
        try {
          await requestMicrophonePermission();
        } catch (permissionError) {
          console.warn("[party] microphone getUserMedia request failed", permissionError);
          throw new Error("Microphone permission is required to speak.");
        }

        if (typeof room.startAudio === "function") {
          // Mobile browsers require an active audio context before capturing audio.
          try {
            await room.startAudio();
          } catch (audioError) {
            console.warn("[party] failed to start audio before enabling mic", audioError);
          }
        }
      }
      await room.localParticipant?.setMicrophoneEnabled(next);
      setMicEnabled(room.localParticipant?.isMicrophoneEnabled ?? next);
      setMicNotice(null);
    } catch (err) {
      console.warn("Toggle microphone failed", err);
      const message = normalizeMicrophoneError(err);
      setMicNotice(message.message);
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
          const profile = participant.identity
            ? participantProfiles.get(participant.identity)
            : null;
          return (
            <ParticipantBadge
              key={participant.sid}
              participant={participant}
              profile={profile ?? null}
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
        {!canPlayAudio ? (
          <button {...startAudioButtonProps}>
            <MicrophoneStage size={16} weight="bold" />
            Tap to allow party audio
          </button>
        ) : null}
        <button
          type="button"
          className={styles.controlButton}
          onClick={() => {
            void handleToggleMic();
          }}
          disabled={micBusy || !room}
        >
          {micEnabled ? (
            <Microphone size={16} weight="bold" />
          ) : (
            <MicrophoneSlash size={16} weight="bold" />
          )}
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
      {micNotice ? (
        <div className={styles.micNotice} role="status">
          {micNotice}
        </div>
      ) : null}
    </div>
  );
}

type ParticipantBadgeProps = {
  participant: ReturnType<typeof useParticipants>[number];
  profile: ParticipantProfile | null;
};

function ParticipantBadge({ participant, profile }: ParticipantBadgeProps) {
  const speaking = participant.isSpeaking;
  const mic = participant.isMicrophoneEnabled;
  const fallbackName = participant.name || participant.identity || "Guest";
  const profileName = profile?.name ?? null;
  const hasProfileName = typeof profileName === "string" && profileName.trim().length > 0;
  const name = hasProfileName ? profileName : fallbackName;
  const avatarCandidate = profile?.avatar ?? null;
  const avatar =
    typeof avatarCandidate === "string" && avatarCandidate.trim().length > 0
      ? avatarCandidate
      : null;
  const initials = initialsFromName(name);
  return (
    <div className={`${styles.participantCard} ${speaking ? styles.participantSpeaking : ""}`}>
      <div className={styles.participantAvatar}>
        {avatar ? (
          <Image
            alt={`${name}'s avatar`}
            src={avatar}
            width={42}
            height={42}
            className={styles.participantAvatarImage}
            loading="lazy"
            referrerPolicy="no-referrer"
            sizes="42px"
          />
        ) : (
          initials
        )}
      </div>
      <div className={styles.participantDetails}>
        <div className={styles.participantNameRow}>
          <span className={styles.participantName}>{name}</span>
        </div>
        <div className={styles.participantState}>
          {mic ? (
            <Microphone size={14} weight="bold" />
          ) : (
            <MicrophoneSlash size={14} weight="bold" />
          )}
          <span>{mic ? (speaking ? "Speaking" : "Live") : "Muted"}</span>
        </div>
      </div>
    </div>
  );
}

