"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

import {
  CopySimple,
  CrownSimple,
  Clock,
  LinkSimple,
  MicrophoneStage,
  PaperPlaneTilt,
  UsersThree,
  XCircle,
  CaretDown,
} from "@phosphor-icons/react/dist/ssr";

import type { FriendItem } from "@/hooks/useFriendsData";
import { ChatStartOverlay } from "@/components/chat/ChatStartOverlay";
import { type ChatFriendTarget } from "@/components/providers/ChatProvider";
import {
  usePartyContext,
  type PartyPrivacy,
  type PartySession,
} from "@/components/providers/PartyProvider";
import { useCurrentUser } from "@/services/auth/client";
import type { SummaryLengthHint, SummaryResult } from "@/types/summary";

import { usePartyInvites } from "./hooks/usePartyInvites";
import { usePartySummary } from "./hooks/usePartySummary";
import {
  formatRelativeTime,
  type PartyPanelVariant,
  type ParticipantProfile,
} from "./partyTypes";
import styles from "./party-panel.module.css";

type PartyPanelProps = {
  friends: FriendItem[];
  friendTargets: Map<string, ChatFriendTarget>;
  onShowFriends(): void;
  variant?: PartyPanelVariant;
};

type ExpandableSettingProps = {
  id: string;
  title: string;
  description?: string;
  eyebrow?: string;
  status?: React.ReactNode;
  open: boolean;
  onToggle(next: boolean): void;
  children: React.ReactNode;
};

const PartyStage = React.lazy(() => import("./PartyStage"));

function ExpandableSetting({
  id,
  title,
  description,
  eyebrow,
  status,
  open,
  onToggle,
  children,
}: ExpandableSettingProps) {
  const regionId = `${id}-body`;
  const titleId = `${id}-title`;

  return (
    <div className={`${styles.settingCard} ${open ? styles.settingCardOpen : ""}`.trim()}>
      <button
        type="button"
        className={styles.settingHeader}
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => onToggle(!open)}
      >
        <div className={styles.settingHeaderText}>
          {eyebrow ? <span className={styles.settingEyebrow}>{eyebrow}</span> : null}
          <div className={styles.settingTitleRow}>
            <span className={styles.settingTitle} id={titleId}>
              {title}
            </span>
            {status ? <span className={styles.settingStatus}>{status}</span> : null}
          </div>
          {description ? <p className={styles.settingHint}>{description}</p> : null}
        </div>
        <CaretDown
          size={16}
          weight="bold"
          className={`${styles.settingCaret} ${open ? styles.settingCaretOpen : ""}`.trim()}
          aria-hidden
        />
      </button>
      <div
        className={`${styles.settingBody} ${open ? styles.settingBodyOpen : ""}`.trim()}
        id={regionId}
        role="region"
        aria-labelledby={titleId}
        aria-hidden={!open}
      >
        <div className={styles.settingBodyInner}>{children}</div>
      </div>
    </div>
  );
}

type JoinSectionProps = {
  joinCode: string;
  loading: boolean;
  action: string | null;
  onChange(value: string): void;
  onSubmit(): void;
};

const JoinSection = React.memo(function JoinSection({
  joinCode,
  loading,
  action,
  onChange,
  onSubmit,
}: JoinSectionProps) {
  const ariaLabel = loading
    ? action === "join"
      ? "Connecting to party"
      : action === "resume"
        ? "Reconnecting to party"
        : "Connecting"
    : "Join party with this code";

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeaderRow}>
        <LinkSimple size={18} weight="duotone" />
        <span>Have a code? Jump into a party</span>
      </div>
      <div className={styles.inlineJoin}>
        <div className={styles.inlineJoinField}>
          <input
            className={styles.inlineJoinInput}
            placeholder="Enter your party code"
            value={joinCode}
            onChange={(event) => onChange(event.target.value)}
            disabled={loading}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (!loading && joinCode.trim()) {
                  onSubmit();
                }
              }
            }}
          />
          <button
            type="button"
            className={styles.inlineJoinButton}
            onClick={onSubmit}
            disabled={loading || !joinCode.trim()}
            aria-label={ariaLabel}
          >
            <PaperPlaneTilt size={16} weight="bold" />
          </button>
        </div>
      </div>
    </section>
  );
});

type SummaryPanelProps = {
  summaryEnabled: boolean;
  canManageSummary: boolean;
  summaryStatusLabel: string;
  summaryVerbosity: SummaryLengthHint;
  summaryUpdating: boolean;
  summaryGenerating: boolean;
  summaryButtonDisabled: boolean;
  summaryGenerateLabel: string;
  summaryResult: SummaryResult | null;
  summaryError: string | null;
  transcriptsReady: boolean;
  summaryLastSavedLabel: string | null;
  summaryMemoryId: string | null;
  onToggle(): void;
  onVerbosityChange(value: SummaryLengthHint): void;
  onGenerate(): void;
  onReset(): void;
};

const SummaryPanel = React.memo(function SummaryPanel({
  summaryEnabled,
  canManageSummary,
  summaryStatusLabel,
  summaryVerbosity,
  summaryUpdating,
  summaryGenerating,
  summaryButtonDisabled,
  summaryGenerateLabel,
  summaryResult,
  summaryError,
  transcriptsReady,
  summaryLastSavedLabel,
  summaryMemoryId,
  onToggle,
  onVerbosityChange,
  onGenerate,
  onReset,
}: SummaryPanelProps) {
  return (
    <div className={styles.summaryPanel}>
      <div className={styles.summaryHeaderRow}>
        <div className={styles.summaryHeaderText}>
          <span className={styles.label}>Conversation summary</span>
          <p className={styles.summaryDescription}>
            {summaryEnabled
              ? "Generate a recap and Capsule will file it under Memory."
              : "Enable summaries to capture a recap of this voice party."}
          </p>
        </div>
        {canManageSummary ? (
          <button
            type="button"
            className={`${styles.summaryToggle} ${summaryEnabled ? styles.summaryToggleActive : ""}`.trim()}
            onClick={onToggle}
            disabled={summaryUpdating}
            aria-pressed={summaryEnabled}
          >
            {summaryStatusLabel}
          </button>
        ) : (
          <span
            className={`${styles.summaryStatusBadge} ${summaryEnabled ? styles.summaryStatusBadgeActive : ""}`.trim()}
          >
            {summaryEnabled ? "Enabled" : "Disabled"}
          </span>
        )}
      </div>
      <div className={styles.summaryControls}>
        <div className={styles.summaryVerbosityRow}>
          {SUMMARY_VERBOSITY_OPTIONS.map((option) => {
            const active = summaryVerbosity === option;
            return (
              <button
                key={option}
                type="button"
                className={`${styles.summaryVerbosityButton} ${active ? styles.summaryVerbosityButtonActive : ""}`.trim()}
                onClick={() => onVerbosityChange(option)}
                disabled={!canManageSummary || summaryUpdating || !summaryEnabled}
                aria-pressed={active}
              >
                <span>{SUMMARY_LABELS[option]}</span>
                <small>{SUMMARY_DESCRIPTIONS[option]}</small>
              </button>
            );
          })}
        </div>
        <div className={styles.summaryActionRow}>
          <button
            type="button"
            className={styles.summaryPrimaryButton}
            onClick={onGenerate}
            disabled={summaryButtonDisabled}
          >
            {summaryGenerateLabel}
          </button>
          {canManageSummary && summaryLastSavedLabel ? (
            <button
              type="button"
              className={styles.summaryResetButton}
              onClick={onReset}
              disabled={summaryUpdating || summaryGenerating}
            >
              Reset summary
            </button>
          ) : null}
        </div>
        <div className={styles.summaryMetaRow}>
          <span>
            {summaryEnabled
              ? transcriptsReady
                ? "Live captions are rolling."
                : "Listening for voices."
              : "Summaries are off for this party."}
          </span>
          {summaryLastSavedLabel ? (
            <span>
              Last saved {summaryLastSavedLabel}
              {summaryMemoryId ? (
                <span className={styles.summaryMemoryTag}>Memory #{summaryMemoryId.slice(0, 8)}</span>
              ) : null}
            </span>
          ) : null}
        </div>
        {summaryError ? (
          <div className={styles.summaryError} role="status">
            {summaryError}
          </div>
        ) : null}
      </div>
      {summaryResult ? (
        <div className={styles.summaryResultCard}>
          <p className={styles.summaryResultText}>{summaryResult.summary}</p>
          {summaryResult.highlights.length ? (
            <ul className={styles.summaryHighlights}>
              {summaryResult.highlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
          {summaryResult.nextActions.length ? (
            <div className={styles.summaryNextActions}>
              <span>Next steps</span>
              <ul>
                {summaryResult.nextActions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

type PrivacyOption = {
  value: PartyPrivacy;
  label: string;
  description: string;
};

const DEFAULT_PRIVACY: PartyPrivacy = "invite-only";

const PRIVACY_OPTIONS: PrivacyOption[] = [
  {
    value: "public",
    label: "Open party",
    description: "Anyone with the link can jump in.",
  },
  {
    value: "invite-only",
    label: "Invite only",
    description: "Only people you invite can join.",
  },
];

const SUMMARY_VERBOSITY_OPTIONS: SummaryLengthHint[] = ["brief", "medium", "detailed"];
const SUMMARY_LABELS: Record<SummaryLengthHint, string> = {
  brief: "Brief",
  medium: "Balanced",
  detailed: "Detailed",
};
const SUMMARY_DESCRIPTIONS: Record<SummaryLengthHint, string> = {
  brief: "Quick snapshot",
  medium: "Every key moment",
  detailed: "Rich context",
};
export function PartyPanel({
  friends,
  friendTargets,
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
    updateMetadata,
  } = usePartyContext();
  const { user } = useCurrentUser();

  const [displayName, setDisplayName] = React.useState(() => user?.name ?? "");
  const [privacy, setPrivacy] = React.useState<PartyPrivacy>(DEFAULT_PRIVACY);
  const [createSummaryEnabled, setCreateSummaryEnabled] = React.useState(false);
  const [createSummaryVerbosity, setCreateSummaryVerbosity] =
    React.useState<SummaryLengthHint>("medium");
  const [privacyExpanded, setPrivacyExpanded] = React.useState(true);
  const [summaryExpanded, setSummaryExpanded] = React.useState(false);
  const [joinCode, setJoinCode] = React.useState("");

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
    if (session?.metadata?.privacy) {
      setPrivacy(session.metadata.privacy);
    }
  }, [session?.metadata?.privacy]);

  React.useEffect(() => {
    if (partyQuery && !session) {
      setJoinCode((prev) => (prev ? prev : partyQuery));
    }
  }, [partyQuery, session]);

  React.useEffect(() => {
    if (createSummaryEnabled) {
      setSummaryExpanded(true);
    }
  }, [createSummaryEnabled]);

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
  const inviteableFriendsByUserId = React.useMemo(() => {
    const map = new Map<string, FriendItem>();
    inviteableFriends.forEach((friend) => {
      if (friend.userId) {
        map.set(friend.userId, friend);
      }
    });
    return map;
  }, [inviteableFriends]);
  const {
    summarySettings,
    summaryResult,
    summaryError,
    summaryUpdating,
    summaryGenerating,
    transcriptSegments,
    handleSummaryToggle,
    handleSummaryVerbosityChange,
    handleSummaryReset,
    handleTranscriptsChange,
    handleGenerateSummary,
  } = usePartySummary({ session, updateMetadata });
  const {
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
  } = usePartyInvites({
    session,
    inviteUrl,
    friendTargets,
    inviteableFriendsByUserId,
  });

  const handlePrivacyKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, optionIndex: number) => {
      if (loading) return;
      const { key } = event;
      if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(key)) {
        return;
      }
      event.preventDefault();
      const delta = key === "ArrowRight" || key === "ArrowDown" ? 1 : -1;
      const nextIndex = (optionIndex + delta + PRIVACY_OPTIONS.length) % PRIVACY_OPTIONS.length;
      setPrivacy(PRIVACY_OPTIONS[nextIndex]!.value);
    },
    [loading],
  );

  const handleSummaryVerbosityKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, optionIndex: number) => {
      if (!createSummaryEnabled) return;
      const { key } = event;
      if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(key)) {
        return;
      }
      event.preventDefault();
      const delta = key === "ArrowRight" || key === "ArrowDown" ? 1 : -1;
      const nextIndex =
        (optionIndex + delta + SUMMARY_VERBOSITY_OPTIONS.length) % SUMMARY_VERBOSITY_OPTIONS.length;
      setCreateSummaryVerbosity(SUMMARY_VERBOSITY_OPTIONS[nextIndex]!);
    },
    [createSummaryEnabled],
  );

  const handleCreateParty = React.useCallback(async () => {
    const trimmedName = displayName.trim();
    await createParty({
      displayName: trimmedName || null,
      privacy,
      summary: {
        enabled: createSummaryEnabled,
        verbosity: createSummaryVerbosity,
      },
    });
  }, [createParty, createSummaryEnabled, createSummaryVerbosity, displayName, privacy]);

  const handleJoinParty = React.useCallback(async () => {
    if (!joinCode.trim()) return;
    await joinParty(joinCode.trim(), {
      displayName: displayName.trim() || null,
    });
  }, [joinParty, joinCode, displayName]);

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

  const privacyStatusLabel = React.useMemo(() => {
    return PRIVACY_OPTIONS.find((option) => option.value === privacy)?.label ?? "Invite only";
  }, [privacy]);

  const summarySetupStatusLabel = React.useMemo(() => {
    return createSummaryEnabled ? `On - ${SUMMARY_LABELS[createSummaryVerbosity]}` : "Off";
  }, [createSummaryEnabled, createSummaryVerbosity]);

  const panelClassName =
    variant === "compact" ? `${styles.panel} ${styles.panelCompact}`.trim() : styles.panel;
  const tileClassName =
    variant === "compact" ? `${styles.partyTile} ${styles.partyTileCompact}`.trim() : styles.partyTile;

  const renderInactiveTile = () => (
    <>
      <header className={styles.tileHeader}>
        <div className={styles.tileHeading}>
          <div className={styles.titleRow}>
            <span className={styles.titleIcon} aria-hidden>
              <MicrophoneStage size={18} weight="duotone" />
            </span>
            <h2 className={styles.tileTitle}>Host a party lobby</h2>
          </div>
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
          <ExpandableSetting
            id="party-privacy"
            title="Party privacy"
            eyebrow="Default: Invite only"
            description="Choose who can discover and join your lobby."
            status={<span className={styles.settingStatusPill}>{privacyStatusLabel}</span>}
            open={privacyExpanded}
            onToggle={setPrivacyExpanded}
          >
            <div className={styles.settingOptions} role="radiogroup" aria-label="Party privacy">
              {PRIVACY_OPTIONS.map((option, index) => {
                const selected = privacy === option.value;
                const optionClassName = selected
                  ? `${styles.settingOption} ${styles.settingOptionSelected}`.trim()
                  : styles.settingOption;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={optionClassName}
                    onClick={() => setPrivacy(option.value)}
                    role="radio"
                    aria-checked={selected}
                    tabIndex={selected ? 0 : -1}
                    aria-label={`${option.label}: ${option.description}`}
                    disabled={loading}
                    onKeyDown={(event) => handlePrivacyKeyDown(event, index)}
                  >
                    <span className={styles.settingOptionLabel}>{option.label}</span>
                    <span className={styles.settingOptionDescription}>{option.description}</span>
                  </button>
                );
              })}
            </div>
          </ExpandableSetting>
          <ExpandableSetting
            id="party-summaries"
            title="Conversation summaries"
            eyebrow="Saves to Memory"
            description="Capture an AI recap of your voice chat."
            status={
              <span
                className={`${styles.settingStatusPill} ${
                  createSummaryEnabled ? styles.settingStatusPillActive : ""
                }`.trim()}
              >
                {summarySetupStatusLabel}
              </span>
            }
            open={summaryExpanded}
            onToggle={setSummaryExpanded}
          >
            <div className={styles.summarySetup}>
              <div className={styles.summarySetupHeader}>
                <div className={styles.summarySetupLabels}>
                  <span className={styles.label}>Recording & saving</span>
                  <p className={styles.summarySetupHint}>
                    Save an AI recap of your voice chat to Memory for later reference.
                  </p>
                </div>
                <button
                  type="button"
                  className={`${styles.summaryToggle} ${
                    createSummaryEnabled ? styles.summaryToggleActive : ""
                  }`.trim()}
                  onClick={() => setCreateSummaryEnabled((prev) => !prev)}
                  aria-pressed={createSummaryEnabled}
                >
                  {createSummaryEnabled ? "Enabled" : "Disabled"}
                </button>
              </div>
              <div
                className={styles.settingOptions}
                role="radiogroup"
                aria-label="Summary verbosity"
              >
                {SUMMARY_VERBOSITY_OPTIONS.map((option, index) => {
                  const active = createSummaryVerbosity === option;
                  const optionClassName = active
                    ? `${styles.settingOption} ${styles.settingOptionSelected}`.trim()
                    : styles.settingOption;
                  return (
                    <button
                      key={option}
                      type="button"
                      className={optionClassName}
                      onClick={() => setCreateSummaryVerbosity(option)}
                      disabled={!createSummaryEnabled}
                      aria-checked={active}
                      role="radio"
                      tabIndex={active ? 0 : -1}
                      aria-label={`${SUMMARY_LABELS[option]}: ${SUMMARY_DESCRIPTIONS[option]}`}
                      onKeyDown={(event) => handleSummaryVerbosityKeyDown(event, index)}
                    >
                      <span className={styles.settingOptionLabel}>{SUMMARY_LABELS[option]}</span>
                      <span className={styles.settingOptionDescription}>
                        {SUMMARY_DESCRIPTIONS[option]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </ExpandableSetting>
          <button
            type="button"
            className={`${styles.primaryButton} ${styles.primaryButtonFull}`}
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
      </section>
      <JoinSection
        joinCode={joinCode}
        loading={loading}
        action={action}
        onChange={setJoinCode}
        onSubmit={() => {
          void handleJoinParty();
        }}
      />
    </>
  );

  const renderActiveTile = (currentSession: PartySession) => {
    const activeHostId = currentSession.metadata.hostId ?? currentSession.metadata.ownerId;
    const statusText = status === "connected" ? null : partyStatusLabel;
    const summaryEnabled = summarySettings.enabled;
    const summaryVerbosity = summarySettings.verbosity;
    const summaryLastSavedLabel = summarySettings.lastGeneratedAt
      ? formatRelativeTime(summarySettings.lastGeneratedAt)
      : null;
    const summaryMemoryId = summarySettings.memoryId ?? null;
    const canManageSummary = currentSession.isOwner || activeHostId === user?.id;
    const transcriptsReady = transcriptSegments.length > 0;
    const summaryButtonDisabled =
      summaryGenerating || summaryUpdating || !summaryEnabled || !transcriptsReady || !canManageSummary;
    const summaryGenerateLabel = summaryGenerating ? "Summarizing..." : "Generate summary";
    const summaryStatusLabel = summaryUpdating
      ? "Updating..."
      : summaryEnabled
        ? "Enabled"
        : "Disabled";
    const hostProfile = activeHostId ? participantProfiles.get(activeHostId) ?? null : null;
    const hostName =
      hostProfile?.name ??
      (activeHostId === user?.id
        ? "You"
        : activeHostId ??
          currentSession.metadata.ownerDisplayName ??
          "Host");
    const liveDurationLabel = createdAtLabel || "Just now";

    return (
      <>
        <header className={`${styles.tileHeader} ${styles.tileHeaderActive}`}>
          <div className={styles.tileHeading}>
            <div className={styles.titleRow}>
              <h2 className={styles.tileTitle}>Party lobby</h2>
              {statusText ? <span className={styles.headerStatus}>{statusText}</span> : null}
            </div>
            <div className={styles.headerMetaRow}>
              <span className={styles.metaChip} title="Host">
                <CrownSimple size={14} weight="fill" />
                <span className={styles.metaChipText}>
                  <span className={styles.metaChipLabel}>Host</span>
                  <span className={styles.metaEmphasis}>{hostName}</span>
                  {currentSession.isOwner ? <span className={styles.metaYou}>you</span> : null}
                </span>
              </span>
              <span className={styles.metaChip} title="Live duration">
                <Clock size={14} weight="bold" />
                <span className={styles.metaChipText}>
                  <span className={styles.metaChipLabel}>Live</span>
                  <span className={styles.metaEmphasis}>{liveDurationLabel}</span>
                </span>
              </span>
            </div>
          </div>
          <div className={`${styles.headerActions} ${styles.headerActionsActive}`}>
            <button
              type="button"
              className={`${styles.secondaryButton} ${styles.inviteButton}`}
              onClick={handleOpenInvitePicker}
            >
              <UsersThree size={16} weight="bold" />
              Invite friends
            </button>
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
            {showInviteDetails ? <code className={styles.codeChip}>{currentSession.partyId}</code> : null}
          </div>
        </header>
        <section className={styles.section}>
          <React.Suspense
            fallback={<div className={styles.sectionNotice}>Loading party lobby...</div>}
          >
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
              summaryEnabled={summaryEnabled}
              onTranscriptsChange={handleTranscriptsChange}
            />
          </React.Suspense>
        </section>
        <section className={styles.section}>
          <SummaryPanel
            summaryEnabled={summaryEnabled}
            canManageSummary={canManageSummary}
            summaryStatusLabel={summaryStatusLabel}
            summaryVerbosity={summaryVerbosity}
            summaryUpdating={summaryUpdating}
            summaryGenerating={summaryGenerating}
            summaryButtonDisabled={summaryButtonDisabled}
            summaryGenerateLabel={summaryGenerateLabel}
            summaryResult={summaryResult}
            summaryError={summaryError}
            transcriptsReady={transcriptsReady}
            summaryLastSavedLabel={summaryLastSavedLabel}
            summaryMemoryId={summaryMemoryId}
            onToggle={handleSummaryToggle}
            onVerbosityChange={handleSummaryVerbosityChange}
            onGenerate={() => {
              void handleGenerateSummary();
            }}
            onReset={() => {
              void handleSummaryReset();
            }}
          />
        </section>
        <JoinSection
          joinCode={joinCode}
          loading={loading}
          action={action}
          onChange={setJoinCode}
          onSubmit={() => {
            void handleJoinParty();
          }}
        />
        <ChatStartOverlay
          open={invitePickerOpen}
          onClose={handleCloseInvitePicker}
          friends={inviteableFriends}
          busy={inviteSending || loading}
          error={inviteError}
          onSubmit={(userIds) => void handleInviteFriends(userIds)}
          mode="party"
        />
      </>
    );
  };

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

