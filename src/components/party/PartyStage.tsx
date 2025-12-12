"use client";

import * as React from "react";
import Image from "next/image";
import { createPortal } from "react-dom";

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
  type TranscriptionSegment,
} from "livekit-client";
import {
  CrownSimple,
  Microphone,
  MicrophoneSlash,
  MicrophoneStage,
  PaperPlaneTilt,
  SignOut,
  SpeakerSimpleHigh,
  SpeakerSimpleSlash,
  Sparkle,
  XCircle,
  GearSix,
} from "@phosphor-icons/react/dist/ssr";

import { useChatContext, type ChatFriendTarget } from "@/components/providers/ChatProvider";
import { usePartyContext, type PartySession } from "@/components/providers/PartyProvider";
import { preferDisplayName } from "@/lib/users/format";
import cm from "@/components/ui/context-menu.module.css";
import styles from "./party-panel.module.css";
import { initialsFromName, MAX_TRANSCRIPT_SEGMENTS, type ParticipantProfile, type PartyTranscriptSegment } from "./partyTypes";

type NavigatorUserMediaSuccessCallback = (stream: MediaStream) => void;
type NavigatorUserMediaErrorCallback = (error: DOMException) => void;

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
  summaryEnabled: boolean;
  onTranscriptsChange(segments: PartyTranscriptSegment[]): void;
};

type ParticipantMenuState = {
  identity: string;
  name: string;
  avatar: string | null;
  anchorRect: DOMRect;
};

type ParticipantBadgeProps = {
  participant: ReturnType<typeof useParticipants>[number];
  profile: ParticipantProfile | null;
  isSelected?: boolean;
  isHost?: boolean;
  onOpenMenu?: (
    participant: ReturnType<typeof useParticipants>[number],
    profile: ParticipantProfile | null,
    anchor: HTMLElement,
  ) => void;
};

type ParticipantMenuPortalProps = {
  state: ParticipantMenuState;
  onClose(): void;
  onSendMessage(): void;
  onVolumeChange(value: number): void;
  volume: number;
  disableMessage?: boolean;
  canMakeHost?: boolean;
  onMakeHost?: () => void;
  makeHostBusy?: boolean;
};

const INPUT_DEVICE_STORAGE_KEY = "capsules:voice:input-device";
const OUTPUT_DEVICE_STORAGE_KEY = "capsules:voice:output-device";
const INPUT_VOLUME_STORAGE_KEY = "capsules:voice:input-volume";
const OUTPUT_VOLUME_STORAGE_KEY = "capsules:voice:output-volume";

export default React.memo(function PartyStage({
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
  summaryEnabled,
  onTranscriptsChange,
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
        summaryEnabled={summaryEnabled}
      onTranscriptsChange={onTranscriptsChange}
    />
  </LiveKitRoom>
);
});

const PartyStageScene = React.memo(function PartyStageScene({
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
  summaryEnabled,
  onTranscriptsChange,
}: PartyStageProps) {
  const { updateMetadata } = usePartyContext();
  const room = useRoomContext();
  const participants = useParticipants();
  const chat = useChatContext();
  const { voiceInputDeviceId, voiceOutputDeviceId, voiceInputVolume, voiceOutputVolume } =
    usePersistentAudioSettings();
  const transcriptBufferRef = React.useRef<Map<string, PartyTranscriptSegment>>(new Map());
  const [micEnabled, setMicEnabled] = React.useState<boolean>(true);
  const [micBusy, setMicBusy] = React.useState(false);
  const [micNotice, setMicNotice] = React.useState<string | null>(null);
  const [isDeafened, setIsDeafened] = React.useState(false);
  const [volumeLevels, setVolumeLevels] = React.useState<Record<string, number>>({});
  const [menuState, setMenuState] = React.useState<ParticipantMenuState | null>(null);
  const [assistantNotice, setAssistantNotice] = React.useState<string | null>(null);
  const [assistantBusy, setAssistantBusy] = React.useState(false);
  const [hostNotice, setHostNotice] = React.useState<string | null>(null);
  const [hostBusy, setHostBusy] = React.useState(false);
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

  const currentHostId = session.metadata.hostId ?? session.metadata.ownerId;

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

  const flushTranscripts = React.useCallback(() => {
    const entries = Array.from(transcriptBufferRef.current.values());
    if (!entries.length) {
      onTranscriptsChange([]);
      return;
    }
    entries.sort((a, b) => {
      const aStart = a.startTime ?? Number.POSITIVE_INFINITY;
      const bStart = b.startTime ?? Number.POSITIVE_INFINITY;
      if (Number.isFinite(aStart) && Number.isFinite(bStart)) {
        return aStart - bStart;
      }
      if (Number.isFinite(aStart)) return -1;
      if (Number.isFinite(bStart)) return 1;
      return a.id.localeCompare(b.id);
    });
    onTranscriptsChange(entries.slice(-MAX_TRANSCRIPT_SEGMENTS));
  }, [onTranscriptsChange]);

  const applyParticipantAudioState = React.useCallback(() => {
    if (!room) return;
    room.remoteParticipants.forEach((participant, identity) => {
      const targetVolume =
        (isDeafened ? 0 : getParticipantVolume(identity)) * voiceOutputVolume;
      setRemoteParticipantVolume(identity, targetVolume);
    });
  }, [getParticipantVolume, isDeafened, room, setRemoteParticipantVolume, voiceOutputVolume]);

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
    if (!room || !voiceInputDeviceId) return;
    room
      .switchActiveDevice?.("audioinput", voiceInputDeviceId)
      .catch((error) => console.warn("Failed to switch input device", error));
  }, [room, voiceInputDeviceId]);

  React.useEffect(() => {
    if (!room || !voiceOutputDeviceId) return;
    room
      .switchActiveDevice?.("audiooutput", voiceOutputDeviceId)
      .catch((error) => console.warn("Failed to switch output device", error));
  }, [room, voiceOutputDeviceId]);

  React.useEffect(() => {
    if (!room) return;
    room.localParticipant?.audioTrackPublications.forEach((publication) => {
      const track = publication.audioTrack;
      if (track && "setVolume" in track && typeof track.setVolume === "function") {
        track.setVolume(Math.min(Math.max(voiceInputVolume, 0), 1));
      }
    });
  }, [room, voiceInputVolume]);

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
    if (!room || !summaryEnabled) {
      transcriptBufferRef.current.clear();
      if (!summaryEnabled) {
        onTranscriptsChange([]);
      }
      return;
    }

    const handleTranscription = (segments: TranscriptionSegment[], participant?: Participant) => {
      const identity = participant?.identity ?? null;
      const profile = identity ? participantProfiles.get(identity) ?? null : null;
      const isAssistant = typeof identity === "string" && identity.startsWith("agent-");
      const speakerName = preferDisplayName({
        name:
          profile?.name ??
          participant?.name ??
          (identity === session.metadata.ownerId ? session.metadata.ownerDisplayName ?? null : null),
        fallback: identity,
        fallbackLabel: isAssistant ? "Assistant" : "Guest",
      });

      for (const segment of segments) {
        if (!segment?.id) continue;
        const text = typeof segment.text === "string" ? segment.text.trim() : "";
        if (!text.length) continue;
        const entry: PartyTranscriptSegment = {
          id: segment.id,
          text,
          speakerId: identity,
          speakerName: speakerName ?? null,
        };
        if (typeof segment.startTime === "number") {
          entry.startTime = segment.startTime;
        }
        if (typeof segment.endTime === "number") {
          entry.endTime = segment.endTime;
        }
        if (segment.language !== undefined) {
          entry.language = typeof segment.language === "string" ? segment.language : null;
        }
        if (typeof segment.final === "boolean") {
          entry.final = segment.final;
        }
        transcriptBufferRef.current.set(segment.id, entry);
      }

      if (transcriptBufferRef.current.size > MAX_TRANSCRIPT_SEGMENTS * 2) {
        const trimmedEntries = Array.from(transcriptBufferRef.current.entries())
          .sort((a, b) => {
            const aStart = a[1].startTime ?? Number.POSITIVE_INFINITY;
            const bStart = b[1].startTime ?? Number.POSITIVE_INFINITY;
            if (Number.isFinite(aStart) && Number.isFinite(bStart)) {
              return aStart - bStart;
            }
            if (Number.isFinite(aStart)) return -1;
            if (Number.isFinite(bStart)) return 1;
            return a[0].localeCompare(b[0]);
          })
          .slice(-MAX_TRANSCRIPT_SEGMENTS);
        transcriptBufferRef.current = new Map(trimmedEntries);
      }

      flushTranscripts();
    };

    room.on(RoomEvent.TranscriptionReceived, handleTranscription);

    return () => {
      room.off(RoomEvent.TranscriptionReceived, handleTranscription);
    };
  }, [
    flushTranscripts,
    onTranscriptsChange,
    participantProfiles,
    room,
    session.metadata.ownerDisplayName,
    session.metadata.ownerId,
    summaryEnabled,
  ]);

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
      const targetVolume =
        (isDeafened ? 0 : getParticipantVolume(identity)) * voiceOutputVolume;
      const track = publication.audioTrack;
      if (track && "setVolume" in track && typeof track.setVolume === "function") {
        track.setVolume(targetVolume);
      }
    };

    room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);

    return () => {
      room.off(RoomEvent.TrackSubscribed, handleTrackSubscribed);
    };
  }, [getParticipantVolume, isDeafened, room, voiceOutputVolume]);

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
      const effectiveVolume = (isDeafened ? 0 : normalized) * voiceOutputVolume;
      setRemoteParticipantVolume(identity, effectiveVolume);
    },
    [isDeafened, setRemoteParticipantVolume, voiceOutputVolume],
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
      const isAssistant = identity.startsWith("agent-");
      const nameCandidate = preferDisplayName({
        name:
          profile?.name ??
          participant.name ??
          (identity === session.metadata.ownerId ? session.metadata.ownerDisplayName ?? null : null),
        fallback: identity,
        fallbackLabel: isAssistant ? "Assistant" : "Guest",
      });
      setMenuState({
        identity,
        name: nameCandidate,
        avatar: profile?.avatar ?? null,
        anchorRect: rect,
      });
    },
    [session.metadata.ownerDisplayName, session.metadata.ownerId],
  );

  const handleSendMessage = React.useCallback(
    (identity: string) => {
      if (!identity) return;
      if (identity === room?.localParticipant?.identity) return;
      const knownProfile = participantProfiles.get(identity) ?? null;
      const fallbackName = preferDisplayName({
        name: knownProfile?.name ?? null,
        fallback: identity,
        fallbackLabel: "Guest",
      });
      const target =
        friendTargets.get(identity) ??
        {
          userId: identity,
          name: fallbackName,
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

  const handleMakeHost = React.useCallback(
    async (identity: string) => {
      if (!session || !identity || hostBusy) return;
      if (identity === currentHostId) {
        setHostNotice("That participant is already the host.");
        return;
      }
      setHostBusy(true);
      setHostNotice(null);
      try {
        const res = await fetch(`/api/party/${session.partyId}/host`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ hostId: identity }),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          const message =
            payload && typeof payload === "object" && typeof (payload as { message?: unknown }).message === "string"
              ? (payload as { message: string }).message
              : "Unable to hand off hosting right now.";
          throw new Error(message);
        }
        const nextHost =
          payload && typeof payload === "object" && "hostId" in payload && typeof (payload as { hostId?: unknown }).hostId === "string"
            ? ((payload as { hostId: string }).hostId as string)
            : identity;
        updateMetadata((metadata) => ({
          ...metadata,
          hostId: nextHost,
        }));
        setHostNotice("Hosting handed off.");
        closeParticipantMenu();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to hand off hosting.";
        setHostNotice(message);
      } finally {
        setHostBusy(false);
      }
    },
    [closeParticipantMenu, currentHostId, hostBusy, session, updateMetadata],
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
  const selfIdentity = room?.localParticipant?.identity ?? null;
  const canMessageSelected = Boolean(menuState && menuState.identity !== selfIdentity);
  const canTransferHost =
    session.isOwner ||
    (selfIdentity
      ? selfIdentity === session.metadata.ownerId || selfIdentity === currentHostId
      : false);
  const assistantPresent = React.useMemo(
    () =>
      participants.some(
        (participant) => typeof participant.identity === "string" && participant.identity.startsWith("agent-"),
      ),
    [participants],
  );

  const applyAssistantMetadata = React.useCallback(
    (
      assistant:
        | {
            desired?: boolean;
            lastRequestedAt?: string | null;
            lastDismissedAt?: string | null;
          }
        | null,
      fallbackDesired: boolean,
    ) => {
      updateMetadata((metadata) => {
        const currentAssistant =
          metadata.assistant ?? { desired: fallbackDesired, lastRequestedAt: null, lastDismissedAt: null };
        const nextDesired =
          assistant && typeof assistant.desired === "boolean" ? assistant.desired : currentAssistant.desired;
        const nextLastRequested =
          assistant && "lastRequestedAt" in assistant
            ? assistant.lastRequestedAt ?? null
            : currentAssistant.lastRequestedAt ?? null;
        const nextLastDismissed =
          assistant && "lastDismissedAt" in assistant
            ? assistant.lastDismissedAt ?? null
            : currentAssistant.lastDismissedAt ?? null;

        return {
          ...metadata,
          assistant: {
            desired: typeof nextDesired === "boolean" ? nextDesired : fallbackDesired,
            lastRequestedAt: nextLastRequested,
            lastDismissedAt: nextLastDismissed,
          },
        };
      });
    },
    [updateMetadata],
  );

  const summonAssistant = React.useCallback(async () => {
    if (!session) return;
    setAssistantBusy(true);
    setAssistantNotice(null);
    try {
      const res = await fetch(`/api/party/${session.partyId}/assistant`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ desired: true }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          payload && typeof payload === "object" && typeof (payload as { message?: unknown }).message === "string"
            ? (payload as { message: string }).message
            : "Unable to call the assistant right now.";
        throw new Error(message);
      }
      const assistantPayload =
        payload && typeof payload === "object" && "assistant" in payload
          ? ((payload as { assistant?: unknown }).assistant as {
              desired?: boolean;
              lastRequestedAt?: string | null;
              lastDismissedAt?: string | null;
            } | null)
          : null;
      applyAssistantMetadata(assistantPayload, true);
      setAssistantNotice("Assistant invited. It may take a few seconds to join.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to call the assistant.";
      setAssistantNotice(message);
    } finally {
      setAssistantBusy(false);
    }
  }, [applyAssistantMetadata, session]);

  const dismissAssistant = React.useCallback(async () => {
    if (!session) return;
    setAssistantBusy(true);
    setAssistantNotice(null);
    try {
      const res = await fetch(`/api/party/${session.partyId}/assistant`, { method: "DELETE" });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          payload && typeof payload === "object" && typeof (payload as { message?: unknown }).message === "string"
            ? (payload as { message: string }).message
            : "Unable to dismiss the assistant right now.";
        throw new Error(message);
      }
      const assistantPayload =
        payload && typeof payload === "object" && "assistant" in payload
          ? ((payload as { assistant?: unknown }).assistant as {
              desired?: boolean;
              lastRequestedAt?: string | null;
              lastDismissedAt?: string | null;
            } | null)
          : null;
      applyAssistantMetadata(assistantPayload, false);
      setAssistantNotice("Assistant dismissed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to dismiss the assistant.";
      setAssistantNotice(message);
    } finally {
      setAssistantBusy(false);
    }
  }, [applyAssistantMetadata, session]);

  const handleOpenSettings = React.useCallback(() => {
    setAssistantNotice("Device settings coming soon.");
  }, []);

  const micLabel = micEnabled ? "Mute" : "Unmute";
  const deafenLabel = isDeafened ? "Undeafen" : "Deafen";

  React.useEffect(() => {
    if (!assistantNotice) return;
    const timer = window.setTimeout(() => setAssistantNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [assistantNotice]);

  return (
    <>
      <div className={styles.stageShell}>
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
          const isHost = (participant.identity ?? null) === currentHostId;
          return (
            <ParticipantBadge
              key={participant.sid}
              participant={participant}
              profile={profile ?? null}
              isSelected={menuState?.identity === participant.identity}
              isHost={isHost}
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
        <div className={styles.controlGroup}>
          {!canPlayAudio ? (
            <button {...startAudioButtonProps}>
              <MicrophoneStage size={16} weight="bold" />
              Tap to allow party audio
            </button>
          ) : null}
        </div>
        {canClose ? (
          <div className={styles.controlGroup}>
            <button
              type="button"
              className={`${styles.controlButton} ${
                assistantPresent ? styles.controlDanger : styles.controlCompact
              }`}
              onClick={() => {
                if (assistantPresent) {
                  void dismissAssistant();
                } else {
                  void summonAssistant();
                }
              }}
              disabled={assistantBusy || !room}
              aria-pressed={assistantPresent}
            >
              {assistantPresent ? <XCircle size={16} weight="bold" /> : <Sparkle size={16} weight="bold" />}
              {assistantBusy
                ? assistantPresent
                  ? "Dismissing..."
                  : "Calling..."
                : assistantPresent
                  ? "Dismiss Assistant"
                  : "Call Assistant"}
            </button>
          </div>
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
      {assistantNotice ? (
        <div className={styles.micNotice} role="status">
          {assistantNotice}
        </div>
      ) : null}
      {hostNotice ? (
        <div className={styles.micNotice} role="status">
          {hostNotice}
        </div>
      ) : null}
      </div>
      <div className={styles.stageFooter}>
          <div className={styles.stageFooterContent}>
            <div className={styles.stageFooterPrimary}>
              <button
                type="button"
                className={`${styles.footerActionButton} ${styles.footerPrimaryButton}`}
                onClick={() => {
                  void onLeave();
                }}
              >
                <SignOut size={16} weight="bold" />
              Leave
            </button>
            {canClose ? (
              <button
                type="button"
                className={`${styles.footerActionButton} ${styles.footerDangerButton}`}
                onClick={() => {
                  void onClose();
                }}
              >
                <XCircle size={16} weight="bold" />
                End
              </button>
            ) : null}
          </div>
          <div className={styles.stageFooterActions}>
            <button
              type="button"
              className={`${styles.footerIconButton} ${micEnabled ? styles.footerIconActive : ""}`.trim()}
              onClick={() => {
                void handleToggleMic();
              }}
              aria-pressed={micEnabled}
              aria-label={micLabel === "Mute" ? "Mute microphone" : "Unmute microphone"}
              disabled={micBusy || !room}
            >
              {micEnabled ? <Microphone size={18} weight="bold" /> : <MicrophoneSlash size={18} weight="bold" />}
              <span className={styles.footerIconLabel}>{micLabel}</span>
            </button>
            <button
              type="button"
              className={`${styles.footerIconButton} ${isDeafened ? styles.footerIconActive : ""}`.trim()}
              onClick={handleToggleDeafen}
              aria-pressed={isDeafened}
              aria-label={deafenLabel === "Deafen" ? "Deafen party audio" : "Undeafen party audio"}
              disabled={!room}
            >
              {isDeafened ? <SpeakerSimpleSlash size={18} weight="bold" /> : <SpeakerSimpleHigh size={18} weight="bold" />}
              <span className={styles.footerIconLabel}>{deafenLabel}</span>
            </button>
            <button
              type="button"
              className={styles.footerIconButton}
              onClick={handleOpenSettings}
              aria-label="Audio settings"
            >
              <GearSix size={18} weight="bold" />
            </button>
          </div>
        </div>
      </div>
      </div>
      {menuState ? (
        <ParticipantMenuPortal
          state={menuState}
          onClose={closeParticipantMenu}
          onSendMessage={() => handleSendMessage(menuState.identity)}
          onVolumeChange={(value) => handleParticipantVolumeChange(menuState.identity, value)}
          volume={menuVolume}
          disableMessage={!canMessageSelected}
          canMakeHost={canTransferHost && menuState.identity !== currentHostId}
          onMakeHost={() => handleMakeHost(menuState.identity)}
          makeHostBusy={hostBusy}
        />
      ) : null}
    </>
  );
});

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
  isHost = false,
  onOpenMenu,
}: ParticipantBadgeProps) {
  const speaking = participant.isSpeaking;
  const mic = participant.isMicrophoneEnabled;
  const assistantName = participant.identity?.startsWith("agent-") ? "Assistant" : null;
  const name = preferDisplayName({
    name: profile?.name ?? assistantName ?? participant.name ?? null,
    fallback: assistantName ?? participant.identity ?? null,
    fallbackLabel: assistantName ?? "Guest",
  });
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
          {isHost ? (
            <span className={styles.participantHostChip}>
              <CrownSimple size={12} weight="fill" aria-hidden />
              <span className={styles.participantHostLabel}>Host</span>
            </span>
          ) : null}
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

function ParticipantMenuPortal({
  state,
  onClose,
  onSendMessage,
  onVolumeChange,
  volume,
  disableMessage = false,
  canMakeHost = false,
  onMakeHost,
  makeHostBusy = false,
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
        {canMakeHost ? (
          <button
            type="button"
            className={cm.item}
            onClick={() => {
              onMakeHost?.();
            }}
            disabled={makeHostBusy}
          >
            <CrownSimple size={16} weight="bold" />
            {makeHostBusy ? "Handing off..." : "Make host"}
          </button>
        ) : null}
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

function usePersistentAudioSettings() {
  const [voiceInputDeviceId, setVoiceInputDeviceId] = React.useState<string | null>(null);
  const [voiceOutputDeviceId, setVoiceOutputDeviceId] = React.useState<string | null>(null);
  const [voiceInputVolume, setVoiceInputVolume] = React.useState<number>(1);
  const [voiceOutputVolume, setVoiceOutputVolume] = React.useState<number>(1);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const readString = (key: string): string | null => {
      try {
        const value = window.localStorage.getItem(key);
        return value && value.trim().length ? value : null;
      } catch {
        return null;
      }
    };
    const readNumber = (key: string, fallback: number): number => {
      try {
        const value = window.localStorage.getItem(key);
        if (!value) return fallback;
        const parsed = Number.parseInt(value, 10);
        if (Number.isNaN(parsed)) return fallback;
        return Math.min(Math.max(parsed, 0), 100);
      } catch {
        return fallback;
      }
    };

    setVoiceInputDeviceId(readString(INPUT_DEVICE_STORAGE_KEY));
    setVoiceOutputDeviceId(readString(OUTPUT_DEVICE_STORAGE_KEY));
    setVoiceInputVolume(readNumber(INPUT_VOLUME_STORAGE_KEY, 80) / 100);
    setVoiceOutputVolume(readNumber(OUTPUT_VOLUME_STORAGE_KEY, 80) / 100);
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (voiceInputDeviceId) {
        window.localStorage.setItem(INPUT_DEVICE_STORAGE_KEY, voiceInputDeviceId);
      }
      if (voiceOutputDeviceId) {
        window.localStorage.setItem(OUTPUT_DEVICE_STORAGE_KEY, voiceOutputDeviceId);
      }
      window.localStorage.setItem(
        INPUT_VOLUME_STORAGE_KEY,
        `${Math.round(Math.min(Math.max(voiceInputVolume, 0), 1) * 100)}`,
      );
      window.localStorage.setItem(
        OUTPUT_VOLUME_STORAGE_KEY,
        `${Math.round(Math.min(Math.max(voiceOutputVolume, 0), 1) * 100)}`,
      );
    } catch {
      // Ignore storage write errors
    }
  }, [voiceInputDeviceId, voiceInputVolume, voiceOutputDeviceId, voiceOutputVolume]);

  return {
    voiceInputDeviceId,
    voiceOutputDeviceId,
    voiceInputVolume,
    voiceOutputVolume,
  };
}

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
      "Microphone access requires a secure connection. Reopen Capsules over HTTPS or use a trusted tunnel when testing on mobile.",
    );
  }
  if (typeof error === "object" && error !== null && "name" in error && typeof (error as { name?: unknown }).name === "string") {
    const name = (error as { name: string }).name;
    if (name === "NotAllowedError" || name === "SecurityError") {
      return new Error("Microphone access was blocked. Update your browser permissions.");
    }
    if (name === "NotReadableError" || name === "AbortError") {
      return new Error(
        "We couldn't access your microphone. Please close other apps that use it and try again.",
      );
    }
    if (name === "NotFoundError" || name === "OverconstrainedError") {
      return new Error("No microphone was found. Plug in or select a microphone and retry.");
    }
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error("We couldn't access your microphone. Please try again.");
}
