"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { createPortal } from "react-dom";

import {
  MicrophoneStage,
  CopySimple,
  LinkSimple,
  Microphone,
  MicrophoneSlash,
  PaperPlaneTilt,
  SignOut,
  Sparkle,
  SpeakerSimpleHigh,
  SpeakerSimpleSlash,
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
import {
  RoomEvent,
  Track,
  type Participant,
  type RemoteTrackPublication,
  type Room,
  type TrackPublication,
} from "livekit-client";

import type { FriendItem } from "@/hooks/useFriendsData";
import { useChatContext, type ChatFriendTarget } from "@/components/providers/ChatProvider";
import { usePartyContext, type PartySession } from "@/components/providers/PartyProvider";
import { useCurrentUser } from "@/services/auth/client";
import { sendPartyInviteRequest } from "@/services/party-invite/client";

import cm from "@/components/ui/context-menu.module.css";
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
  friendTargets: Map<string, ChatFriendTarget>;
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
          friendTargets={friendTargets}
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
  friendTargets,
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
        friendTargets={friendTargets}
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
  friendTargets: Map<string, ChatFriendTarget>;
  onLeave(): Promise<void> | void;
  onClose(): Promise<void> | void;
  onReconnecting(): void;
  onReady(room: Room): void;
  onDisconnected(): void;
};

type ParticipantMenuState = {
  identity: string;
  name: string;
  avatar: string | null;
  anchorRect: DOMRect;
};

function PartyStageScene({
  session: _session,
  canClose,
  status,
  participantProfiles,
  friendTargets,
  onLeave,
  onClose,
  onReconnecting,
  onReady,
  onDisconnected,
}: PartyStageSceneProps) {
  const room = useRoomContext();
  const participants = useParticipants();
  const chat = useChatContext();
  const [micEnabled, setMicEnabled] = React.useState<boolean>(true);
  const [micBusy, setMicBusy] = React.useState(false);
  const [micNotice, setMicNotice] = React.useState<string | null>(null);
  const [isDeafened, setIsDeafened] = React.useState(false);
  const [volumeLevels, setVolumeLevels] = React.useState<Record<string, number>>({});
  const [menuState, setMenuState] = React.useState<ParticipantMenuState | null>(null);
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

  const getParticipantVolume = React.useCallback(
    (identity: string | null | undefined): number => {
      if (!identity) return 1;
      const stored = volumeLevels[identity];
      if (typeof stored === "number" && Number.isFinite(stored)) {
        return Math.min(Math.max(stored, 0), 1);
      }
      return 1;
    },
    [volumeLevels],
  );

  const setRemoteParticipantVolume = React.useCallback(
    (identity: string | null | undefined, volume: number) => {
      if (!room || !identity) return;
      const participant = room.remoteParticipants.get(identity);
      if (!participant) return;
      const clampedVolume = Math.min(Math.max(volume, 0), 1);
      participant.audioTrackPublications.forEach((publication) => {
        const track = publication.audioTrack;
        if (track && "setVolume" in track && typeof track.setVolume === "function") {
          track.setVolume(clampedVolume);
        }
      });
    },
    [room],
  );

  const applyParticipantAudioState = React.useCallback(() => {
    if (!room) return;
    room.remoteParticipants.forEach((participant, identity) => {
      const targetVolume = isDeafened ? 0 : getParticipantVolume(identity);
      setRemoteParticipantVolume(identity, targetVolume);
    });
  }, [getParticipantVolume, isDeafened, room, setRemoteParticipantVolume]);

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
    setMicEnabled(resolveLocalMicEnabled(room));
    room.on(RoomEvent.Disconnected, handleRoomDisconnected);
    room.on(RoomEvent.Reconnecting, handleRoomReconnecting);
    room.on(RoomEvent.Reconnected, handleRoomReconnected);

    return () => {
      room.off(RoomEvent.Disconnected, handleRoomDisconnected);
      room.off(RoomEvent.Reconnecting, handleRoomReconnecting);
      room.off(RoomEvent.Reconnected, handleRoomReconnected);
    };
  }, [onDisconnected, onReady, onReconnecting, room]);

  React.useEffect(() => {
    if (!room) return;

    const syncMicState = () => {
      setMicEnabled(resolveLocalMicEnabled(room));
    };

    const handleTrackToggle = (publication: TrackPublication, participant: Participant) => {
      if (participant.isLocal && publication.kind === Track.Kind.Audio) {
        syncMicState();
      }
    };

    syncMicState();
    const handleLocalTrackPublished = (publication: TrackPublication, participant: Participant) => {
      if (participant.isLocal && publication.kind === Track.Kind.Audio) {
        syncMicState();
      }
    };

    room.on(RoomEvent.TrackMuted, handleTrackToggle);
    room.on(RoomEvent.TrackUnmuted, handleTrackToggle);
    room.on(RoomEvent.LocalTrackPublished, handleLocalTrackPublished);

    return () => {
      room.off(RoomEvent.TrackMuted, handleTrackToggle);
      room.off(RoomEvent.TrackUnmuted, handleTrackToggle);
      room.off(RoomEvent.LocalTrackPublished, handleLocalTrackPublished);
    };
  }, [room]);

  React.useEffect(() => {
    applyParticipantAudioState();
  }, [applyParticipantAudioState]);

  React.useEffect(() => {
    if (!room) return;

    const handleTrackSubscribed = (
      _track: unknown,
      publication: RemoteTrackPublication,
      participant: Participant,
    ) => {
      if (participant.isLocal) return;
      if (publication.kind !== Track.Kind.Audio) return;
      const identity = participant.identity;
      if (!identity) return;
      const targetVolume = isDeafened ? 0 : getParticipantVolume(identity);
      const track = publication.audioTrack;
      if (track && "setVolume" in track && typeof track.setVolume === "function") {
        track.setVolume(targetVolume);
      }
    };

    room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);

    return () => {
      room.off(RoomEvent.TrackSubscribed, handleTrackSubscribed);
    };
  }, [getParticipantVolume, isDeafened, room]);

  const handleToggleDeafen = React.useCallback(() => {
    if (!room) return;
    setIsDeafened((prev) => !prev);
  }, [room]);

  const handleParticipantVolumeChange = React.useCallback(
    (identity: string, sliderPercent: number) => {
      if (!identity) return;
      const normalized = Math.min(Math.max(sliderPercent, 0), 100) / 100;
      setVolumeLevels((prev) => {
        const previous = prev[identity] ?? 1;
        if (Math.abs(previous - normalized) < 0.001) {
          return prev;
        }
        return {
          ...prev,
          [identity]: normalized,
        };
      });
      const effectiveVolume = isDeafened ? 0 : normalized;
      setRemoteParticipantVolume(identity, effectiveVolume);
    },
    [isDeafened, setRemoteParticipantVolume],
  );

  const closeParticipantMenu = React.useCallback(() => {
    setMenuState(null);
  }, []);

  const handleOpenParticipantMenu = React.useCallback(
    (
      participant: ReturnType<typeof useParticipants>[number],
      profile: ParticipantProfile | null,
      anchor: HTMLElement,
    ) => {
      if (participant.isLocal) return;
      const identity = participant.identity;
      if (!identity) return;
      const rect = anchor.getBoundingClientRect();
      const nameCandidate =
        profile?.name ?? participant.name ?? identity ?? "Guest";
      setMenuState({
        identity,
        name: nameCandidate,
        avatar: profile?.avatar ?? null,
        anchorRect: rect,
      });
    },
    [],
  );

  const handleSendMessage = React.useCallback(
    (identity: string) => {
      if (!identity) return;
      if (identity === room?.localParticipant?.identity) return;
      const knownProfile = participantProfiles.get(identity) ?? null;
      const target =
        friendTargets.get(identity) ??
        {
          userId: identity,
          name: knownProfile?.name ?? identity,
          avatar: knownProfile?.avatar ?? null,
        };
      const result = chat.startChat(target, { activate: true });
      if (!result) {
        console.warn("Unable to start a chat session for participant", identity);
      }
      closeParticipantMenu();
    },
    [chat, closeParticipantMenu, friendTargets, participantProfiles, room],
  );

  React.useEffect(() => {
    if (!menuState) return;
    if (typeof window === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeParticipantMenu();
      }
    };
    const handleViewportChange = () => {
      closeParticipantMenu();
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [closeParticipantMenu, menuState]);

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
      setMicEnabled(resolveLocalMicEnabled(room));
      setMicNotice(null);
    } catch (err) {
      console.warn("Toggle microphone failed", err);
      const message = normalizeMicrophoneError(err);
      setMicNotice(message.message);
      setMicEnabled(resolveLocalMicEnabled(room));
    } finally {
      setMicBusy(false);
    }
  }, [room]);

  const participantCount = participants.length;
  const menuVolume = menuState ? getParticipantVolume(menuState.identity) : 1;
  const canMessageSelected =
    Boolean(menuState && menuState.identity !== room?.localParticipant?.identity);

  return (
    <>
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
              isSelected={menuState?.identity === participant.identity}
              onOpenMenu={handleOpenParticipantMenu}
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
          onClick={handleToggleDeafen}
          disabled={!room}
          aria-pressed={isDeafened}
        >
          {isDeafened ? (
            <SpeakerSimpleSlash size={16} weight="bold" />
          ) : (
            <SpeakerSimpleHigh size={16} weight="bold" />
          )}
          {isDeafened ? "Undeafen" : "Deafen"}
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
      {menuState ? (
        <ParticipantMenuPortal
          state={menuState}
          onClose={closeParticipantMenu}
          onSendMessage={() => handleSendMessage(menuState.identity)}
          onVolumeChange={(value) => handleParticipantVolumeChange(menuState.identity, value)}
          volume={menuVolume}
          disableMessage={!canMessageSelected}
        />
      ) : null}
    </>
  );
}

type ParticipantBadgeProps = {
  participant: ReturnType<typeof useParticipants>[number];
  profile: ParticipantProfile | null;
  isSelected?: boolean;
  onOpenMenu?: (
    participant: ReturnType<typeof useParticipants>[number],
    profile: ParticipantProfile | null,
    anchor: HTMLElement,
  ) => void;
};

function resolveLocalMicEnabled(room: Room | null): boolean {
  if (!room) return true;
  const participant = room.localParticipant;
  if (!participant) return true;
  if (participant.audioTrackPublications.size > 0) {
    for (const publication of participant.audioTrackPublications.values()) {
      if (!publication.isMuted) {
        return true;
      }
    }
    return false;
  }
  return participant.isMicrophoneEnabled;
}

function ParticipantBadge({
  participant,
  profile,
  isSelected = false,
  onOpenMenu,
}: ParticipantBadgeProps) {
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
  const actionable = Boolean(onOpenMenu && !participant.isLocal);
  const classes = [
    styles.participantCard,
    speaking ? styles.participantSpeaking : "",
    actionable ? styles.participantActionable : "",
    isSelected ? styles.participantSelected : "",
  ]
    .filter(Boolean)
    .join(" ");

  const activateMenu = (anchor: HTMLElement) => {
    if (!actionable || !onOpenMenu) return;
    onOpenMenu(participant, profile, anchor);
  };

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!actionable) return;
    activateMenu(event.currentTarget);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!actionable) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activateMenu(event.currentTarget);
    }
  };

  return (
    <div
      className={classes}
      role={actionable ? "button" : undefined}
      tabIndex={actionable ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-pressed={actionable ? isSelected : undefined}
      aria-label={actionable ? `Interact with ${name}` : undefined}
      data-identity={participant.identity ?? undefined}
    >
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

type ParticipantMenuPortalProps = {
  state: ParticipantMenuState;
  onClose(): void;
  onSendMessage(): void;
  onVolumeChange(value: number): void;
  volume: number;
  disableMessage?: boolean;
};

function ParticipantMenuPortal({
  state,
  onClose,
  onSendMessage,
  onVolumeChange,
  volume,
  disableMessage = false,
}: ParticipantMenuPortalProps) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }
  const menuWidth = 260;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const scrollX = window.scrollX ?? window.pageXOffset ?? 0;
  const scrollY = window.scrollY ?? window.pageYOffset ?? 0;
  const targetBottom = scrollY + state.anchorRect.bottom;
  const topCandidate = targetBottom + 12;
  const maxTop = scrollY + viewportHeight - 200;
  const menuTop = Math.max(scrollY + 16, Math.min(topCandidate, maxTop));
  const rawLeft =
    scrollX + state.anchorRect.left + state.anchorRect.width / 2 - menuWidth / 2;
  const minLeft = scrollX + 16;
  const maxLeft = scrollX + viewportWidth - menuWidth - 16;
  const menuLeft = Math.max(minLeft, Math.min(rawLeft, maxLeft));
  const volumePercent = Math.round(Math.min(Math.max(volume, 0), 1) * 100);

  return createPortal(
    <>
      <div className={cm.backdrop} onClick={onClose} aria-hidden="true" />
      <div
        className={`${cm.menu} ${styles.participantMenu}`}
        style={{ top: `${menuTop}px`, left: `${menuLeft}px`, width: `${menuWidth}px` }}
        role="dialog"
        aria-label={`${state.name} options`}
      >
        <div className={styles.participantMenuHeader}>
          <span className={styles.participantMenuName}>{state.name}</span>
        </div>
        <button
          type="button"
          className={cm.item}
          onClick={onSendMessage}
          disabled={disableMessage}
        >
          <PaperPlaneTilt size={16} weight="bold" />
          Send a message
        </button>
        <div className={cm.separator} aria-hidden="true" />
        <div className={styles.participantMenuSlider}>
          <div className={styles.participantMenuSliderLabel}>
            <span>User volume</span>
            <span>{volumePercent}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={volumePercent}
            onChange={(event) => onVolumeChange(Number(event.currentTarget.value))}
            className={styles.participantMenuSliderInput}
            aria-label="Adjust user volume"
          />
        </div>
      </div>
    </>,
    document.body,
  );
}
