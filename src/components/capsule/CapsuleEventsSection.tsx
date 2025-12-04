"use client";

import * as React from "react";

import { LadderRosterManager } from "@/components/capsule/LadderRosterManager";
import {
  Alert,
  AlertActions,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CapsuleLadderSummary } from "@/hooks/useCapsuleLadders";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useLadderDetail } from "@/hooks/useLadderDetail";
import { useLadderChallenges } from "@/hooks/useLadderChallenges";
import { formatRelativeTime } from "@/lib/composer/sidebar-types";
import { trackLadderEvent } from "@/lib/telemetry/ladders";
import { getIdentityAccent } from "@/lib/identity/teams";
import {
  buildDoubleEliminationBracket,
  buildSingleEliminationBracket,
  type BracketMatch,
  type BracketRound,
  type TournamentBracket,
} from "@/lib/ladders/bracket";
import type { CapsuleLadderDetail, CapsuleLadderMember, LadderParticipantType } from "@/types/ladders";
import styles from "./CapsuleEventsSection.module.css";

type CapsuleEventsSectionProps = {
  capsuleId: string | null;
  ladders: CapsuleLadderSummary[];
  tournaments: CapsuleLadderSummary[]; // kept for parity; not rendered in the new layout yet
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  previewOverrides?: {
    summary: CapsuleLadderSummary;
    detail: CapsuleLadderDetail;
    members: CapsuleLadderMember[];
  };
};

type NavId = "ladder" | "report" | "challenges" | "results" | "search" | "roster";
type LadderTabId = "standings" | "overview" | "rules" | "shoutouts" | "rewards";

function formatStatus(status: CapsuleLadderSummary["status"]): string {
  if (status === "active") return "Active";
  if (status === "archived") return "Archived";
  return "Draft";
}

type StatusTone = "success" | "neutral" | "warn";

function statusTone(status: CapsuleLadderSummary["status"]): StatusTone {
  if (status === "active") return "success";
  if (status === "archived") return "warn";
  return "neutral";
}

function formatVisibility(visibility: CapsuleLadderSummary["visibility"]): string {
  if (visibility === "capsule") return "Capsule";
  if (visibility === "private") return "Private";
  return "Public";
}

function formatGameMeta(ladder: CapsuleLadderSummary): { title: string; meta: string | null } {
  const meta =
    ladder.meta && typeof ladder.meta === "object" ? (ladder.meta as Record<string, unknown>) : null;
  const game = meta && typeof meta.game === "object" ? (meta.game as Record<string, unknown>) : null;
  const fallbackTitle =
    typeof meta?.gameTitle === "string" && meta.gameTitle.trim().length
      ? (meta.gameTitle as string)
      : ladder.name;
  const title =
    typeof game?.title === "string" && game.title.trim().length
      ? game.title
      : fallbackTitle || "Untitled ladder";
  const metaParts = [game?.mode, game?.platform, game?.region]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length);
  return {
    title,
    meta: metaParts.length ? metaParts.join(" \u2022 ") : null,
  };
}

function resolveMatchMode(
  meta: Record<string, unknown> | null | undefined,
  gameMode?: string | null,
): string | null {
  const rawMode =
    meta && typeof meta.matchMode === "string" && meta.matchMode.trim().length
      ? meta.matchMode.trim()
      : null;
  if (rawMode) return rawMode;
  if (gameMode && gameMode.trim().length) return gameMode.trim();
  const nestedGame =
    meta && typeof meta.game === "object" && meta.game
      ? ((meta.game as Record<string, unknown>).mode as string | undefined)
      : null;
  if (nestedGame && nestedGame.trim().length) return nestedGame.trim();
  return null;
}

function extractMemberCapsuleId(member: CapsuleLadderMember | null | undefined): string | null {
  const metadata = member?.metadata as Record<string, unknown> | null;
  const capsuleId =
    metadata && typeof metadata.capsuleId === "string" ? metadata.capsuleId.trim() : null;
  return capsuleId && capsuleId.length ? capsuleId : null;
}

function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed.length) return "??";
  const parts = trimmed.split(/\s+/).slice(0, 2);
  return parts
    .map((part) => part.charAt(0).toUpperCase())
    .join("")
    .padEnd(2, "?");
}

function sortStandings(members: CapsuleLadderMember[], scoringSystem?: string): CapsuleLadderMember[] {
  return [...members].sort((a, b) => {
    if (scoringSystem === "elo") {
      if (b.rating !== a.rating) return b.rating - a.rating;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return (a.losses ?? 0) - (b.losses ?? 0);
    }
    const rankA = a.rank ?? Number.MAX_SAFE_INTEGER;
    const rankB = b.rank ?? Number.MAX_SAFE_INTEGER;
    if (rankA !== rankB) return rankA - rankB;
    if (b.rating !== a.rating) return b.rating - a.rating;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return (a.losses ?? 0) - (b.losses ?? 0);
  });
}

function resolveTournamentFormat(
  detail: CapsuleLadderDetail | null | undefined,
): "single_elimination" | "double_elimination" | "round_robin" {
  const meta = detail?.meta && typeof detail.meta === "object" ? (detail.meta as Record<string, unknown>) : null;
  const metaFormat =
    typeof meta?.format === "string"
      ? meta.format
      : typeof meta?.tournamentFormat === "string"
        ? meta.tournamentFormat
        : null;
  const configMeta =
    detail?.config && typeof detail.config === "object"
      ? ((detail.config as { metadata?: unknown }).metadata as Record<string, unknown> | undefined)
      : undefined;
  const tournamentConfig =
    configMeta && typeof configMeta.tournament === "object"
      ? (configMeta.tournament as Record<string, unknown>)
      : null;
  const configFormat =
    tournamentConfig && typeof tournamentConfig.format === "string" ? tournamentConfig.format : null;
  const normalized = (metaFormat || configFormat || "").toLowerCase();
  if (normalized.includes("double")) return "double_elimination";
  if (normalized.includes("round")) return "round_robin";
  return "single_elimination";
}

export function CapsuleEventsSection({
  capsuleId,
  ladders,
  tournaments,
  loading,
  error,
  onRetry,
  previewOverrides,
}: CapsuleEventsSectionProps) {
  const isOnline = useNetworkStatus();
  const previewing = Boolean(previewOverrides);
  const ladderSummaries = React.useMemo(
    () => (previewOverrides ? [previewOverrides.summary] : ladders),
    [previewOverrides, ladders],
  );
  const tournamentSummaries = React.useMemo(() => tournaments, [tournaments]);
  const [activeNav, setActiveNav] = React.useState<NavId>("ladder");
  const [activeTab, setActiveTab] = React.useState<LadderTabId>("standings");
  const [selectedLadderId, setSelectedLadderId] = React.useState<string | null>(null);
  const [selectedTournamentId, setSelectedTournamentId] = React.useState<string | null>(null);
  const [reportStatus, setReportStatus] = React.useState<"idle" | "saving" | "saved">("idle");
  const [reportForm, setReportForm] = React.useState({
    ladderId: "",
    challengeId: "",
    challengerId: "",
    opponentId: "",
    outcome: "challenger",
    notes: "",
    proofUrl: "",
  });
  const [tournamentReportError, setTournamentReportError] = React.useState<string | null>(null);
  const [tournamentReportingMatchId, setTournamentReportingMatchId] = React.useState<string | null>(null);
  const [challengeForm, setChallengeForm] = React.useState({
    challengerId: "",
    opponentId: "",
    note: "",
  });
  const [challengeMessage, setChallengeMessage] = React.useState<string | null>(null);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [rosterOpen, setRosterOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [deleteStatus, setDeleteStatus] = React.useState<"idle" | "deleting">("idle");
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const ladderSelectRef = React.useRef<HTMLSelectElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const [pickerOpen, setPickerOpen] = React.useState(false);

  React.useEffect(() => {
    if (!ladderSummaries.length) {
      setSelectedLadderId(null);
      return;
    }
    setSelectedLadderId((prev) => {
      if (prev && ladderSummaries.some((ladder) => ladder.id === prev)) return prev;
      return ladderSummaries[0]?.id ?? null;
    });
  }, [ladderSummaries]);

  React.useEffect(() => {
    if (!tournamentSummaries.length) {
      setSelectedTournamentId(null);
      return;
    }
    setSelectedTournamentId((prev) => {
      if (prev && tournamentSummaries.some((entry) => entry.id === prev)) return prev;
      return tournamentSummaries[0]?.id ?? null;
    });
  }, [tournamentSummaries]);

  React.useEffect(() => {
    setReportForm((prev) => ({
      ...prev,
      ladderId: selectedLadderId ?? "",
      challengeId: "",
      challengerId: "",
      opponentId: "",
      proofUrl: "",
    }));
    setChallengeForm((prev) => ({ ...prev, challengerId: "", opponentId: "" }));
    setChallengeMessage(null);
    setReportStatus("idle");
  }, [selectedLadderId]);

  React.useEffect(() => {
    setTournamentReportError(null);
    setTournamentReportingMatchId(null);
  }, [selectedTournamentId]);

  React.useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(event.target as Node)) return;
      setMenuOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  const selectedLadderSummary = React.useMemo(
    () => ladderSummaries.find((ladder) => ladder.id === selectedLadderId) ?? null,
    [ladderSummaries, selectedLadderId],
  );
  const selectedTournamentSummary = React.useMemo(
    () => tournamentSummaries.find((entry) => entry.id === selectedTournamentId) ?? null,
    [selectedTournamentId, tournamentSummaries],
  );
  const selectedGameMeta = React.useMemo(
    () => (selectedLadderSummary ? formatGameMeta(selectedLadderSummary) : null),
    [selectedLadderSummary],
  );

  const {
    ladder: selectedLadderDetailRaw,
    members: ladderMembersRaw,
    loading: ladderDetailLoadingRaw,
    refreshing: _ladderDetailRefreshingRaw,
    error: ladderDetailErrorRaw,
    refresh: refreshLadderDetailRaw,
  } = useLadderDetail({ capsuleId, ladderId: selectedLadderId, disabled: previewing });

  const selectedLadderDetail = previewOverrides?.detail ?? selectedLadderDetailRaw;
  const ladderMembers = React.useMemo(
    () => (previewOverrides ? previewOverrides.members : ladderMembersRaw),
    [previewOverrides, ladderMembersRaw],
  );
  const ladderDetailLoading = previewOverrides ? false : ladderDetailLoadingRaw;
  const ladderDetailError = previewOverrides ? null : ladderDetailErrorRaw;
  const refreshLadderDetail = React.useMemo(
    () => (previewOverrides ? async () => {} : refreshLadderDetailRaw),
    [previewOverrides, refreshLadderDetailRaw],
  );
  const {
    ladder: selectedTournamentDetail,
    members: tournamentMembers,
    loading: tournamentDetailLoading,
    error: tournamentDetailError,
    refresh: refreshTournamentDetail,
  } = useLadderDetail({
    capsuleId,
    ladderId: selectedTournamentId,
    disabled: !selectedTournamentId || previewing,
  });
  const scoringSystem =
    (selectedLadderDetail?.config?.scoring as { system?: string } | undefined)?.system ?? "elo";
  const isSimpleLadder = scoringSystem === "simple";
  const isEloLadder = scoringSystem === "elo";
  const challengesSupported = isSimpleLadder || isEloLadder;
  const challengerLabel = isEloLadder ? "Player A" : "Challenger (lower rank)";
  const opponentLabel = isEloLadder ? "Player B" : "Opponent (higher rank)";
  const sortedStandings = React.useMemo(
    () => sortStandings(ladderMembers, scoringSystem),
    [ladderMembers, scoringSystem],
  );

  const {
    challenges,
    history,
    loading: challengesLoading,
    refreshing: challengesRefreshing,
    mutating: challengesMutating,
    error: challengesError,
    refresh: refreshChallenges,
    createChallenge,
    resolveChallenge,
    membersSnapshot: challengeMembersSnapshot,
  } = useLadderChallenges({ capsuleId, ladderId: selectedLadderId });
  const {
    challenges: tournamentChallenges,
    history: tournamentHistory,
    loading: tournamentChallengesLoading,
    refreshing: tournamentChallengesRefreshing,
    mutating: tournamentChallengesMutating,
    error: tournamentChallengesError,
    refresh: refreshTournamentChallenges,
    createChallenge: createTournamentChallenge,
    resolveChallenge: resolveTournamentChallenge,
    membersSnapshot: tournamentMembersSnapshot,
  } = useLadderChallenges({ capsuleId, ladderId: selectedTournamentId });

  const pendingChallenges = React.useMemo(
    () => challenges.filter((challenge) => challenge.status === "pending"),
    [challenges],
  );

  const recentHistory = React.useMemo(() => history.slice(0, 4), [history]);
  const tournamentFormat = React.useMemo(
    () => resolveTournamentFormat(selectedTournamentDetail),
    [selectedTournamentDetail],
  );
  const tournamentBracket: TournamentBracket = React.useMemo(() => {
    const memberList = tournamentMembers ?? [];
    const matchHistory = tournamentHistory ?? [];
    if (tournamentFormat === "double_elimination") {
      return buildDoubleEliminationBracket(memberList, matchHistory);
    }
    return buildSingleEliminationBracket(memberList, matchHistory);
  }, [tournamentFormat, tournamentHistory, tournamentMembers]);

  const overviewBlock = selectedLadderDetail?.sections?.overview ?? null;
  const rulesBlock = selectedLadderDetail?.sections?.rules ?? null;
  const shoutoutsBlock = selectedLadderDetail?.sections?.shoutouts ?? null;
  const rewardsBlock = selectedLadderDetail?.sections?.results ?? null;
  const schedule = selectedLadderDetail?.config?.schedule ?? null;
  const proofRequired = Boolean(
    (selectedLadderDetail?.config?.moderation as { proofRequired?: boolean } | undefined)?.proofRequired,
  );
  const ladderMatchMode = resolveMatchMode(
    selectedLadderDetail?.meta as Record<string, unknown> | null,
    (selectedLadderDetail?.game as { mode?: string } | undefined)?.mode ?? null,
  );
  const tournamentMatchMode = resolveMatchMode(
    selectedTournamentDetail?.meta as Record<string, unknown> | null,
    (selectedTournamentDetail?.game as { mode?: string } | undefined)?.mode ?? null,
  );
  const loadingTournamentState =
    tournamentChallengesLoading || tournamentChallengesRefreshing || tournamentChallengesMutating;
  const timelineItems = React.useMemo(() => {
    const items: Array<{ label: string; value: string }> = [];
    if (schedule?.cadence) items.push({ label: "Season length", value: String(schedule.cadence) });
    if (schedule?.kickoff) items.push({ label: "Cadence", value: String(schedule.kickoff) });
    if (schedule?.timezone) items.push({ label: "Timezone", value: String(schedule.timezone) });
    if (schedule?.playoffsAt) items.push({ label: "Playoffs", value: String(schedule.playoffsAt) });
    if (schedule?.finalsAt) items.push({ label: "Finals", value: String(schedule.finalsAt) });
    if (typeof schedule?.checkInWindowMinutes === "number") {
      items.push({
        label: "Check-in window",
        value: `${schedule.checkInWindowMinutes} minutes`,
      });
    }
    return items;
  }, [schedule]);

  const findMember = React.useCallback(
    (memberId: string) =>
      ladderMembers.find((member) => member.id === memberId) ||
      challengeMembersSnapshot.find((member) => member.id === memberId) ||
      null,
    [challengeMembersSnapshot, ladderMembers],
  );
  const findTournamentMember = React.useCallback(
    (memberId: string) =>
      tournamentMembers.find((member) => member.id === memberId) ||
      tournamentMembersSnapshot.find((member) => member.id === memberId) ||
      null,
    [tournamentMembers, tournamentMembersSnapshot],
  );
  const buildParticipantPayload = React.useCallback(
    (
      challengerId: string,
      opponentId: string,
      mode: string | null,
      lookup: (memberId: string) => CapsuleLadderMember | null,
    ): {
      participantType: LadderParticipantType;
      challengerCapsuleId?: string | null;
      opponentCapsuleId?: string | null;
    } => {
      const participantType: LadderParticipantType = mode === "capsule_vs_capsule" ? "capsule" : "member";
      if (participantType !== "capsule") return { participantType };
      const challengerCapsuleId = extractMemberCapsuleId(lookup(challengerId)) ?? null;
      const opponentCapsuleId = extractMemberCapsuleId(lookup(opponentId)) ?? null;
      return { participantType, challengerCapsuleId, opponentCapsuleId };
    },
    [],
  );

  const suggestChallengerId = React.useCallback(
    (opponentId: string) => {
      const opponent = ladderMembers.find((member) => member.id === opponentId);
      const opponentRank = opponent?.rank ?? Number.MAX_SAFE_INTEGER;
      const candidate = sortedStandings.find(
        (member) => member.id !== opponentId && (member.rank ?? Number.MAX_SAFE_INTEGER) > opponentRank,
      );
      return candidate?.id ?? "";
    },
    [ladderMembers, sortedStandings],
  );

  const handlePrepareChallenge = React.useCallback(
    (opponentId: string) => {
      const challengerId = challengeForm.challengerId || suggestChallengerId(opponentId);
      setChallengeForm((prev) => ({
        ...prev,
        opponentId,
        challengerId,
      }));
      setChallengeMessage(null);
      setActiveNav("ladder");
      setActiveTab("standings");
    },
    [challengeForm.challengerId, suggestChallengerId],
  );

  const handleSelectLadder = React.useCallback(
    (ladderId: string) => {
      setSelectedLadderId(ladderId);
      setActiveTab("standings");
      setMenuOpen(false);
      trackLadderEvent({
        event: "ladders.focus.change",
        capsuleId,
        ladderId,
        payload: { context: "ladder_shell" },
      });
    },
    [capsuleId],
  );

  const handleMenuSelectLadder = React.useCallback(() => {
    setMenuOpen(false);
    ladderSelectRef.current?.focus();
  }, []);

  const handleMenuReport = React.useCallback(() => {
    setMenuOpen(false);
    setActiveNav("report");
  }, []);

  const handleMenuRoster = React.useCallback(() => {
    setMenuOpen(false);
    setRosterOpen(true);
  }, []);

  const handleMenuDelete = React.useCallback(async () => {
    if (!selectedLadderId || !capsuleId || previewing) return;
    setMenuOpen(false);
    setDeleteError(null);
    trackLadderEvent({
      event: "ladders.delete.request",
      capsuleId,
      ladderId: selectedLadderId,
      payload: { context: "ladder_shell" },
    });
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        `Delete "${selectedLadderSummary?.name ?? "this ladder"}"? This cannot be undone.`,
      );
      if (!confirmed) return;
    }
    if (!isOnline) {
      setDeleteError("Reconnect before deleting ladders.");
      return;
    }

    try {
      setDeleteStatus("deleting");
      const response = await fetch(`/api/capsules/${capsuleId}/ladders/${selectedLadderId}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = payload?.message ?? response.statusText ?? "Unable to delete ladder.";
        throw new Error(message);
      }
      const remaining = ladderSummaries.filter((ladder) => ladder.id !== selectedLadderId);
      setSelectedLadderId(remaining[0]?.id ?? null);
      await onRetry();
    } catch (err) {
      setDeleteError((err as Error).message);
    } finally {
      setDeleteStatus("idle");
    }
  }, [
    capsuleId,
    isOnline,
    ladderSummaries,
    onRetry,
    previewing,
    selectedLadderId,
    selectedLadderSummary?.name,
  ]);

  const handleReportFieldChange = React.useCallback(
    (name: keyof typeof reportForm, value: string) => {
      setReportForm((prev) => ({ ...prev, [name]: value }));
      setReportStatus("idle");
    },
    [],
  );

  const handleSelectChallengeForReport = React.useCallback(
    (challengeId: string) => {
      const selected = challenges.find((challenge) => challenge.id === challengeId);
      if (!selected) {
        setReportForm((prev) => ({ ...prev, challengeId: "", challengerId: "", opponentId: "", proofUrl: "" }));
        return;
      }
      setReportForm((prev) => ({
        ...prev,
        challengeId,
        challengerId: selected.challengerId,
        opponentId: selected.opponentId,
        outcome: "challenger",
        proofUrl: "",
      }));
      setReportStatus("idle");
    },
    [challenges],
  );

  const handleChallengeFieldChange = React.useCallback(
    (name: keyof typeof challengeForm, value: string) => {
      setChallengeForm((prev) => ({ ...prev, [name]: value }));
      setChallengeMessage(null);
    },
    [],
  );

  const handleSubmitChallenge = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedLadderId) {
        setChallengeMessage("Pick a ladder to create a challenge.");
        return;
      }
      if (!challengeForm.challengerId || !challengeForm.opponentId) {
        setChallengeMessage("Select both a challenger and opponent.");
        return;
      }
      try {
        setChallengeMessage(null);
        const note = challengeForm.note.trim();
        const participantPayload = buildParticipantPayload(
          challengeForm.challengerId,
          challengeForm.opponentId,
          ladderMatchMode,
          findMember,
        );
        await createChallenge({
          challengerId: challengeForm.challengerId,
          opponentId: challengeForm.opponentId,
          note: note ? note : null,
          ...participantPayload,
        });
        trackLadderEvent({
          event: "ladders.match.report",
          capsuleId,
          ladderId: selectedLadderId,
          payload: { action: "challenge_created" },
        });
        setChallengeForm((prev) => ({ ...prev, note: "" }));
        setReportForm((prev) => ({
          ...prev,
          ladderId: selectedLadderId,
          challengerId: challengeForm.challengerId,
          opponentId: challengeForm.opponentId,
          challengeId: "",
        }));
      } catch (err) {
        setChallengeMessage((err as Error).message);
      }
    },
    [
      buildParticipantPayload,
      capsuleId,
      challengeForm.challengerId,
      challengeForm.note,
      challengeForm.opponentId,
      createChallenge,
      findMember,
      ladderMatchMode,
      selectedLadderId,
    ],
  );

  const handleReportSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!reportForm.ladderId) return;
      if (!reportForm.challengerId || !reportForm.opponentId) {
        setReportStatus("idle");
        setChallengeMessage("Pick both sides for this match.");
        return;
      }
      setReportStatus("saving");
      try {
        let challengeId = reportForm.challengeId;
        const trimmedNotes = reportForm.notes.trim();
        const trimmedProof = reportForm.proofUrl.trim();
        const participantPayload = buildParticipantPayload(
          reportForm.challengerId,
          reportForm.opponentId,
          ladderMatchMode,
          findMember,
        );
        if (proofRequired && !trimmedNotes && !trimmedProof) {
          setReportStatus("idle");
          setChallengeMessage("Add proof or notes to resolve this match.");
          return;
        }
        if (!challengeId) {
          const created = await createChallenge({
            challengerId: reportForm.challengerId,
            opponentId: reportForm.opponentId,
            note: trimmedNotes ? trimmedNotes : null,
            ...participantPayload,
          });
          challengeId = created.challenges[0]?.id ?? "";
        }
        if (!challengeId) {
          throw new Error("Unable to create a challenge for this match.");
        }
        await resolveChallenge(challengeId, {
          outcome: reportForm.outcome as "challenger" | "opponent" | "draw",
          note: trimmedNotes ? trimmedNotes : null,
          proofUrl: trimmedProof ? trimmedProof : null,
          ...participantPayload,
        });
        trackLadderEvent({
          event: "ladders.match.report",
          capsuleId,
          ladderId: reportForm.ladderId,
          payload: { outcome: reportForm.outcome, via: reportForm.challengeId ? "challenge" : "ad_hoc" },
        });
        await refreshLadderDetail();
        setReportStatus("saved");
        setTimeout(() => setReportStatus("idle"), 800);
      } catch (err) {
        setReportStatus("idle");
        setChallengeMessage((err as Error).message);
      }
    },
    [
      capsuleId,
      createChallenge,
      refreshLadderDetail,
      reportForm.challengeId,
      reportForm.challengerId,
      reportForm.ladderId,
      reportForm.notes,
      reportForm.proofUrl,
      reportForm.opponentId,
      reportForm.outcome,
      resolveChallenge,
      proofRequired,
      buildParticipantPayload,
      findMember,
      ladderMatchMode,
    ],
  );
  const handleReportTournamentMatch = React.useCallback(
    async (
      match: { id: string; a: CapsuleLadderMember | null; b: CapsuleLadderMember | null },
      winner: "a" | "b",
    ) => {
      if (!selectedTournamentId || !match.a || !match.b) return;
      const participantPayload = buildParticipantPayload(match.a.id, match.b.id, tournamentMatchMode, findTournamentMember);
      const tournamentPayload: Parameters<typeof createTournamentChallenge>[0] = {
        challengerId: match.a.id,
        opponentId: match.b.id,
        ...(participantPayload.participantType ? { participantType: participantPayload.participantType } : {}),
        ...(participantPayload.challengerCapsuleId !== undefined
          ? { challengerCapsuleId: participantPayload.challengerCapsuleId ?? null }
          : {}),
        ...(participantPayload.opponentCapsuleId !== undefined
          ? { opponentCapsuleId: participantPayload.opponentCapsuleId ?? null }
          : {}),
      };
      setTournamentReportError(null);
      setTournamentReportingMatchId(match.id);
      try {
        const existing = tournamentChallenges.find((challenge) => {
          const sides = new Set([challenge.challengerId, challenge.opponentId]);
          return sides.has(match.a!.id) && sides.has(match.b!.id) && challenge.status === "pending";
        });
        let challengeId = existing?.id ?? "";
        if (!challengeId) {
          const created = await createTournamentChallenge(tournamentPayload);
          challengeId = created.challenges[0]?.id ?? "";
        }
        if (!challengeId) {
          throw new Error("Unable to create a bracket match for this pairing.");
        }
        await resolveTournamentChallenge(challengeId, {
          outcome: winner === "a" ? "challenger" : "opponent",
          note: "Bracket result",
          ...(participantPayload.participantType ? { participantType: participantPayload.participantType } : {}),
          ...(participantPayload.challengerCapsuleId !== undefined
            ? { challengerCapsuleId: participantPayload.challengerCapsuleId ?? null }
            : {}),
          ...(participantPayload.opponentCapsuleId !== undefined
            ? { opponentCapsuleId: participantPayload.opponentCapsuleId ?? null }
            : {}),
        });
        await Promise.all([refreshTournamentDetail(), refreshTournamentChallenges()]);
      } catch (err) {
        setTournamentReportError((err as Error).message);
      } finally {
        setTournamentReportingMatchId(null);
      }
    },
    [
      buildParticipantPayload,
      createTournamentChallenge,
      findTournamentMember,
      refreshTournamentChallenges,
      refreshTournamentDetail,
      resolveTournamentChallenge,
      selectedTournamentId,
      tournamentChallenges,
      tournamentMatchMode,
    ],
  );

  if (loading) {
    return (
      <div className={styles.stateCard} aria-busy="true">
        <div className={styles.stateHeading}>Loading ladders...</div>
        <div className={styles.skeletonRow} />
        <div className={styles.skeletonRow} />
        <div className={styles.skeletonRow} />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.stateCard}>
        {!isOnline ? (
          <Alert tone="warning">
            <AlertTitle>Offline mode</AlertTitle>
            <AlertDescription>Reconnect to refresh ladder data.</AlertDescription>
          </Alert>
        ) : null}
        <Alert tone="danger">
          <AlertTitle>{"We couldn\u2019t load ladders."}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
          <AlertActions>
            <Button type="button" variant="secondary" onClick={onRetry} disabled={!isOnline}>
              Retry
            </Button>
          </AlertActions>
        </Alert>
      </div>
    );
  }

  if (!ladderSummaries.length) {
    return (
      <div className={styles.stateCard}>
        <div className={styles.stateHeading}>No ladders in this capsule</div>
        <p className={styles.stateBody}>
          This capsule doesn&apos;t have any ladders right now. Create one with Capsule AI to manage
          standings, match results, rules, and shoutouts here.
        </p>
      </div>
    );
  }

  const renderStandings = () => {
    if (ladderDetailError) {
      return (
        <Alert tone="danger">
          <AlertTitle>Unable to load standings</AlertTitle>
          <AlertDescription>{ladderDetailError}</AlertDescription>
        </Alert>
      );
    }

    if (ladderDetailLoading) {
      return (
        <div className={styles.standingsSkeleton} aria-busy="true">
          <div className={styles.skeletonRow} />
          <div className={styles.skeletonRow} />
          <div className={styles.skeletonRow} />
        </div>
      );
    }

    const challengePanel = (
      <div className={styles.challengeComposer}>
        <div className={styles.challengeHeader}>
          <div>
            <p className={styles.detailEyebrow}>
              {isEloLadder ? "Elo ladder" : isSimpleLadder ? "Simple ladder" : "Challenges locked"}
            </p>
            <h4>
              {challengesSupported
                ? isEloLadder
                  ? "Launch a rated match"
                  : "Issue a challenge"
                : "Challenges unavailable"}
            </h4>
            <p className={styles.challengeSub}>
              {isEloLadder
                ? "Report results to update Elo ratings and reshuffle standings automatically."
                : "Underdogs jump halfway up the ladder when they win. Queue a match and report it to auto-update ranks."}
            </p>
          </div>
          <div className={styles.challengeActions}>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={refreshChallenges}
              disabled={challengesLoading || challengesRefreshing}
            >
              {challengesRefreshing ? "Refreshing..." : "Refresh queue"}
            </Button>
          </div>
        </div>

        {challengesError ? (
          <Alert tone="danger">
            <AlertTitle>Challenge queue unavailable</AlertTitle>
            <AlertDescription>{challengesError}</AlertDescription>
          </Alert>
        ) : null}

        {!challengesSupported ? (
          <Alert tone="warning">
            <AlertTitle>Enable challenges</AlertTitle>
            <AlertDescription>
              Switch this ladder to the Simple or Elo format to enable challenges and automatic updates.
            </AlertDescription>
          </Alert>
        ) : (
          <form className={styles.challengeForm} onSubmit={handleSubmitChallenge}>
            <div className={styles.challengeGrid}>
              <label className={styles.reportField}>
                <span>{challengerLabel}</span>
                <select
                  value={challengeForm.challengerId}
                  onChange={(event) => handleChallengeFieldChange("challengerId", event.target.value)}
                  disabled={challengesMutating || !sortedStandings.length}
                  required
                >
                  <option value="" disabled>
                    Select challenger
                  </option>
                  {sortedStandings.map((member, index) => (
                    <option key={member.id} value={member.id}>
                      #{member.rank ?? index + 1} {member.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.reportField}>
                <span>{opponentLabel}</span>
                <select
                  value={challengeForm.opponentId}
                  onChange={(event) => handleChallengeFieldChange("opponentId", event.target.value)}
                  disabled={challengesMutating || !sortedStandings.length}
                  required
                >
                  <option value="" disabled>
                    Select opponent
                  </option>
                  {sortedStandings.map((member, index) => (
                    <option key={member.id} value={member.id}>
                      #{member.rank ?? index + 1} {member.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.reportField}>
                <span>Notes (optional)</span>
                <Input
                  value={challengeForm.note}
                  onChange={(event) => handleChallengeFieldChange("note", event.target.value)}
                  placeholder="Series length, proof links, or quick context"
                  disabled={challengesMutating}
                />
              </label>
              <div className={styles.challengeSubmit}>
                <Button
                  type="submit"
                  size="md"
                  variant="gradient"
                  disabled={
                    challengesMutating ||
                    !challengeForm.challengerId ||
                    !challengeForm.opponentId ||
                    !challengesSupported
                  }
                >
                  {challengesMutating ? "Saving..." : "Launch challenge"}
                </Button>
                {challengeMessage ? <p className={styles.challengeMessage}>{challengeMessage}</p> : null}
              </div>
            </div>
          </form>
        )}

        
      </div>
    );

    if (!sortedStandings.length) {
      return (
        <div className={styles.standingsTableWrap}>
          {challengePanel}
          <div className={styles.emptyStandings}>
            <p>No matches yet. Add players and start reporting results.</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setRosterOpen(true)}
            >
              Open roster manager
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className={styles.standingsTableWrap}>
        {challengePanel}
        <table className={styles.standingsTable}>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Team</th>
              <th scope="col">W-L</th>
              <th scope="col">Streak</th>
              {!isSimpleLadder ? <th scope="col">Rating</th> : null}
              <th scope="col" className={styles.rightCol}>
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedStandings.map((member, index) => {
              const accent = getIdentityAccent(member.displayName, index);
              const accentStyle = {
                "--identity-color": accent.primary,
                "--identity-glow": accent.glow,
                "--identity-border": accent.border,
                "--identity-surface": accent.surface,
                "--identity-text": accent.text,
              } as React.CSSProperties;
              const streak = member.streak ?? 0;
              const streakTone = streak > 0 ? styles.streakPositive : streak < 0 ? styles.streakNegative : styles.streakNeutral;
              return (
                <tr key={member.id}>
                  <td>
                    <span className={styles.rankBadge}>#{member.rank ?? index + 1}</span>
                  </td>
                  <td>
                    <div className={styles.playerCell}>
                      <span className={styles.avatar} style={accentStyle} aria-hidden>
                        {getInitials(member.displayName)}
                      </span>
                      <div>
                        <span className={styles.playerName}>{member.displayName}</span>
                        {member.handle ? (
                          <span className={styles.playerHandle}>@{member.handle}</span>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className={styles.recordCell}>
                      <strong>
                        {member.wins}-{member.losses}
                      </strong>
                      {member.draws ? <small>{member.draws} draws</small> : null}
                    </div>
                  </td>
                  <td>
                    <span className={`${styles.streakBadge} ${streakTone}`}>
                      {streak > 0 ? `+${streak}` : streak}
                    </span>
                  </td>
                  {!isSimpleLadder ? <td>{member.rating}</td> : null}
                  <td className={styles.rightCol}>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className={styles.challengeButton}
                      disabled={!challengesSupported || challengesMutating}
                      onClick={() => handlePrepareChallenge(member.id)}
                    >
                      Challenge
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderSectionText = (body?: string | null, bullets?: string[] | null, fallback?: string) => {
    if (!body && !bullets?.length) {
      return <p className={styles.sectionEmpty}>{fallback ?? "No content yet."}</p>;
    }
    return (
      <div className={styles.sectionBody}>
        {body ? <p>{body}</p> : null}
        {bullets?.length ? (
          <ul className={styles.sectionBullets}>
            {bullets.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  };

  const renderActiveChallenges = () => (
    <div className={styles.panelCard}>
      <div className={styles.challengeListHeader}>
        <div>
          <h3>Active challenges</h3>
          <p className={styles.challengeMeta}>
            Queue matches and log results to keep standings moving.
          </p>
        </div>
        <div className={styles.challengeActions}>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={refreshChallenges}
            disabled={challengesLoading || challengesRefreshing}
          >
            {challengesRefreshing ? "Refreshing..." : "Refresh queue"}
          </Button>
        </div>
      </div>
      {!challengesSupported ? (
        <Alert tone="warning">
          <AlertTitle>Enable challenges</AlertTitle>
          <AlertDescription>
            Switch this ladder to the Simple or Elo format to enable challenges and automatic updates.
          </AlertDescription>
        </Alert>
      ) : null}
      {challengesError ? (
        <Alert tone="danger">
          <AlertTitle>Challenge queue unavailable</AlertTitle>
          <AlertDescription>{challengesError}</AlertDescription>
        </Alert>
      ) : null}
      <ul className={styles.challengeList}>
        {pendingChallenges.length ? (
          pendingChallenges.map((challenge) => {
            const challenger = findMember(challenge.challengerId);
            const opponent = findMember(challenge.opponentId);
            return (
              <li key={challenge.id} className={styles.challengeListItem}>
                <div>
                  <p className={styles.challengeTitle}>
                    {challenger?.displayName ?? "Challenger"} vs {opponent?.displayName ?? "Opponent"}
                  </p>
                  <p className={styles.challengeMeta}>
                    Waiting on result - Started {formatRelativeTime(challenge.createdAt)}
                  </p>
                </div>
                <div className={styles.challengeRowActions}>
                  <Button
                    type="button"
                    size="xs"
                    variant="secondary"
                    onClick={() => {
                      handleSelectChallengeForReport(challenge.id);
                      setActiveNav("report");
                    }}
                  >
                    Report result
                  </Button>
                </div>
              </li>
            );
          })
        ) : (
          <li className={styles.sectionEmpty}>No pending challenges yet.</li>
        )}
      </ul>
    </div>
  );

  const renderRecentResults = () => (
    <div className={styles.panelCard}>
      <div className={styles.challengeListHeader}>
        <div>
          <h3>Recent results</h3>
          <p className={styles.challengeMeta}>Latest reported matches and ranking jumps.</p>
        </div>
        <span className={styles.challengeCount}>{recentHistory.length ? "Auto-applied" : "None yet"}</span>
      </div>
      <ul className={styles.challengeList}>
        {recentHistory.length ? (
          recentHistory.map((match) => {
            const challenger = findMember(match.challengerId);
            const opponent = findMember(match.opponentId);
            const challengerJump = match.rankChanges?.find((change) => change.memberId === match.challengerId);
            const challengerName = challenger?.displayName ?? "Challenger";
            const opponentName = opponent?.displayName ?? "Opponent";
            const summary =
              match.outcome === "draw"
                ? `${challengerName} drew with ${opponentName}`
                : match.outcome === "challenger"
                  ? `${challengerName} defeated ${opponentName}`
                  : `${opponentName} defeated ${challengerName}`;
            const resolvedLabel = match.resolvedAt ? formatRelativeTime(match.resolvedAt) : "Just now";
            const ratingChange =
              scoringSystem === "elo"
                ? match.ratingChanges?.find((change) => change.memberId === match.challengerId) ??
                  match.ratingChanges?.find((change) => change.memberId === match.opponentId)
                : null;
            const ratingDelta =
              ratingChange && typeof ratingChange.to === "number" && typeof ratingChange.from === "number"
                ? (ratingChange.delta ?? ratingChange.to - ratingChange.from)
                : null;
            return (
              <li key={match.id} className={styles.challengeListItem}>
                <div>
                  <p className={styles.challengeTitle}>{summary}</p>
                  <p className={styles.challengeMeta}>
                    {resolvedLabel}
                    {challengerJump ? ` - Moved to #${challengerJump.to}` : ""}
                    {ratingDelta !== null ? ` - ${ratingDelta >= 0 ? "+" : ""}${ratingDelta} rating` : ""}
                  </p>
                </div>
              </li>
            );
          })
        ) : (
          <li className={styles.sectionEmpty}>No results yet. Report a match to start the feed.</li>
        )}
      </ul>
    </div>
  );

  const renderReport = () => (
    <div className={styles.panelCard}>
      <div className={styles.reportHeader}>
        <div>
          <p className={styles.reportEyebrow}>Match result</p>
          <h3>Log a match</h3>
          <p className={styles.reportLead}>
            Capture a quick result so we can keep ladder standings and streaks in sync.
          </p>
        </div>
        {reportStatus === "saved" ? (
          <span className={styles.reportStatus} aria-live="polite">
            Standings updated for this challenge.
          </span>
        ) : null}
      </div>
      <form className={styles.reportForm} onSubmit={handleReportSubmit}>
        <div className={styles.reportRow}>
          <label className={styles.reportField}>
            <span>Ladder</span>
            <select
              value={reportForm.ladderId}
              onChange={(event) => handleReportFieldChange("ladderId", event.target.value)}
              required
            >
              <option value="" disabled>
                Select a ladder
              </option>
              {ladderSummaries.map((ladder) => (
                <option key={ladder.id} value={ladder.id}>
                  {ladder.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.reportField}>
            <span>Pick a challenge (optional)</span>
            <select
              value={reportForm.challengeId}
              onChange={(event) => handleSelectChallengeForReport(event.target.value)}
              disabled={!pendingChallenges.length}
            >
              <option value="">Ad-hoc result</option>
              {pendingChallenges.map((challenge) => {
                const challenger = findMember(challenge.challengerId);
                const opponent = findMember(challenge.opponentId);
                return (
                  <option key={challenge.id} value={challenge.id}>
                    {challenger?.displayName ?? "Challenger"} vs {opponent?.displayName ?? "Opponent"}
                  </option>
                );
              })}
            </select>
          </label>
        </div>
        <div className={styles.reportRow}>
          <label className={styles.reportField}>
            <span>{challengerLabel}</span>
            <select
              value={reportForm.challengerId}
              onChange={(event) => handleReportFieldChange("challengerId", event.target.value)}
              disabled={Boolean(reportForm.challengeId)}
              required
            >
              <option value="" disabled>
                Select challenger
              </option>
              {sortedStandings.map((member, index) => (
                <option key={member.id} value={member.id}>
                  #{member.rank ?? index + 1} {member.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.reportField}>
            <span>{opponentLabel}</span>
            <select
              value={reportForm.opponentId}
              onChange={(event) => handleReportFieldChange("opponentId", event.target.value)}
              disabled={Boolean(reportForm.challengeId)}
              required
            >
              <option value="" disabled>
                Select opponent
              </option>
              {sortedStandings.map((member, index) => (
                <option key={member.id} value={member.id}>
                  #{member.rank ?? index + 1} {member.displayName}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className={styles.reportRow}>
          <fieldset className={styles.reportOutcome}>
            <legend>Outcome</legend>
            <div className={styles.outcomePills}>
              {[
                { id: "challenger", label: "Challenger won" },
                { id: "opponent", label: "Opponent won" },
                { id: "draw", label: "Draw" },
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`${styles.outcomePill} ${reportForm.outcome === option.id ? styles.outcomePillActive : ""}`}
                  onClick={() => handleReportFieldChange("outcome", option.id)}
                  aria-pressed={reportForm.outcome === option.id}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
          <label className={styles.reportField} aria-label="Notes">
            <span>Notes (optional)</span>
            <textarea
              value={reportForm.notes}
              onChange={(event) => handleReportFieldChange("notes", event.target.value)}
              placeholder="Series score, proof links, or quick context."
              rows={3}
            />
          </label>
          <label className={styles.reportField} aria-label="Proof link">
            <span>Proof link{proofRequired ? " (required)" : ""}</span>
            <Input
              type="url"
              inputMode="url"
              value={reportForm.proofUrl}
              onChange={(event) => handleReportFieldChange("proofUrl", event.target.value)}
              placeholder={proofRequired ? "Add a link to match proof" : "Optional proof or VOD link"}
            />
            {proofRequired ? (
              <span className={styles.reportHint}>Proof or notes are required to resolve matches on this ladder.</span>
            ) : null}
          </label>
        </div>
        {challengeMessage ? (
          <p className={styles.challengeMessage} role="alert">
            {challengeMessage}
          </p>
        ) : null}
        <div className={styles.reportActions}>
          <Button
            type="submit"
            size="md"
            variant="gradient"
            className={styles.reportPrimaryButton}
            disabled={
              !reportForm.ladderId ||
              reportStatus === "saving" ||
              !reportForm.challengerId ||
              !reportForm.opponentId
            }
          >
            {reportStatus === "saving" ? "Saving match..." : "Save match result"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setActiveNav("ladder")}
            disabled={reportStatus === "saving"}
          >
            Back to ladder
          </Button>
        </div>
      </form>
    </div>
  );

  const renderSearch = () => (
    <div className={styles.panelCard}>
      <div className={styles.searchHeader}>
        <h3>Search ladders</h3>
        <p className={styles.sectionEmpty}>Search will surface ladders, teams, and challenges soon.</p>
      </div>
      <div className={styles.searchBar}>
        <Input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search ladders, players, or teams..."
        />
        <Button type="button" variant="secondary" size="sm">
          Go
        </Button>
      </div>
      <div className={styles.sectionBody}>
        <p>We’ll hook this to live ladder + roster search. For now, keep exploring the Ladder tab.</p>
      </div>
    </div>
  );

  const renderRoster = () => (
    <div className={styles.panelCard}>
      <div className={styles.searchHeader}>
        <h3>Manage roster</h3>
        <p className={styles.sectionEmpty}>
          Add players, update seeds, and keep standings in sync.
        </p>
      </div>
      <div className={styles.rosterActions}>
        <Button type="button" size="sm" onClick={() => setRosterOpen(true)} disabled={!selectedLadderSummary}>
          Open roster manager
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setActiveNav("ladder")}>
          Back to ladder
        </Button>
      </div>
      <div className={styles.sectionBody}>
        {selectedLadderSummary ? (
          <ul className={styles.rosterList}>
            {sortedStandings.slice(0, 8).map((member) => (
              <li key={member.id} className={styles.rosterListItem}>
                <span className={styles.playerName}>{member.displayName}</span>
                <span className={styles.playerHandle}>
                  {member.wins}-{member.losses} ({member.rating})
                </span>
              </li>
            ))}
            {!sortedStandings.length ? <li className={styles.sectionEmpty}>No members yet.</li> : null}
          </ul>
        ) : (
          <p className={styles.sectionEmpty}>Pick a ladder to manage its roster.</p>
        )}
      </div>
    </div>
  );

  const renderTournaments = () => {
    if (!tournamentSummaries.length) {
      return null;
    }
    if (tournamentDetailError) {
      return (
        <Alert tone="danger">
          <AlertTitle>Unable to load tournament</AlertTitle>
          <AlertDescription>{tournamentDetailError}</AlertDescription>
        </Alert>
      );
    }
    const hasBracket =
      tournamentBracket.type === "double"
        ? tournamentBracket.winners.some((round) => round.matches.length) ||
          tournamentBracket.losers.some((round) => round.matches.length) ||
          tournamentBracket.finals.some((round) => round.matches.length)
        : tournamentBracket.rounds.some((round) => round.matches.length);
    const renderMatchCard = (match: BracketMatch) => {
      const winnerId = match.winnerId;
      const reporting = tournamentReportingMatchId === match.id;
      const canReport = Boolean(match.a && match.b && match.status !== "complete");
      const aName = match.a?.displayName ?? match.aSource ?? (match.status === "bye" ? "Bye" : "TBD");
      const bName = match.b?.displayName ?? match.bSource ?? (match.status === "bye" ? "Bye" : "TBD");
      const aSeed = match.a?.seed ?? null;
      const bSeed = match.b?.seed ?? null;

      return (
        <div key={match.id} className={styles.bracketMatch}>
          <div className={styles.bracketRoundLabel}>
            Round {match.round} - Match {match.index + 1}
          </div>
          <div
            className={`${styles.bracketSeedRow} ${winnerId && winnerId === match.a?.id ? styles.bracketSeedRowWinner : ""}`}
          >
            <span className={styles.bracketSeed}>{aSeed ? `#${aSeed}` : "-"}</span>
            <span className={styles.bracketTeam}>{aName}</span>
            {winnerId && winnerId === match.a?.id ? (
              <span className={styles.bracketStatusPill}>Advances</span>
            ) : null}
          </div>
          <div
            className={`${styles.bracketSeedRow} ${winnerId && winnerId === match.b?.id ? styles.bracketSeedRowWinner : ""}`}
          >
            <span className={styles.bracketSeed}>{bSeed ? `#${bSeed}` : "-"}</span>
            <span className={styles.bracketTeam}>{bName}</span>
            {winnerId && winnerId === match.b?.id ? (
              <span className={styles.bracketStatusPill}>Advances</span>
            ) : null}
          </div>
          {match.history?.note ? <p className={styles.bracketNote}>{match.history.note}</p> : null}
          <div className={styles.bracketFooter}>
            <span className={styles.bracketStatusText}>
              {match.status === "complete"
                ? "Result saved"
                : match.status === "bye"
                  ? "Auto-advance"
                  : "Awaiting result"}
            </span>
            {canReport ? (
              <div className={styles.bracketActions}>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={reporting || loadingTournamentState}
                  onClick={() => handleReportTournamentMatch(match, "a")}
                >
                  {reporting ? "Saving..." : `${match.a?.displayName ?? "Side A"} wins`}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={reporting || loadingTournamentState}
                  onClick={() => handleReportTournamentMatch(match, "b")}
                >
                  {reporting ? "Saving..." : `${match.b?.displayName ?? "Side B"} wins`}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      );
    };

    const renderRoundSet = (rounds: BracketRound[], heading?: string) => {
      const hasRounds = rounds.some((round) => round.matches.length);
      if (!hasRounds) return null;
      return (
        <div className={styles.bracketRounds}>
          {heading ? <p className={styles.detailEyebrow}>{heading}</p> : null}
          {rounds.map((round) => (
            <div key={`round-${heading ?? ""}-${round.round}`} className={styles.bracketRound}>
              <div className={styles.bracketRoundHeader}>
                <span>{round.label ?? `Round ${round.round}`}</span>
              </div>
              <div className={styles.bracketGrid}>
                {round.matches.map((match) => renderMatchCard(match))}
              </div>
            </div>
          ))}
        </div>
      );
    };

    return (
      <div className={styles.panelCard}>
        <div className={styles.searchHeader}>
          <h3>Tournaments</h3>
          <div className={styles.tournamentSelector}>
            <select
              className={styles.ladderSelect}
              value={selectedTournamentId ?? ""}
              onChange={(event) => setSelectedTournamentId(event.target.value || null)}
            >
              {tournamentSummaries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
            {selectedTournamentSummary ? (
              <div className={styles.detailBadges}>
                <span className={`${styles.statusBadge} ${styles[`tone${statusTone(selectedTournamentSummary.status)}`]}`}>
                  {formatStatus(selectedTournamentSummary.status)}
                </span>
                <span className={styles.badgeSoft}>{formatVisibility(selectedTournamentSummary.visibility)}</span>
              </div>
            ) : null}
          </div>
        </div>
        {tournamentDetailLoading ? (
          <div className={styles.standingsSkeleton} aria-busy="true">
            <div className={styles.skeletonRow} />
            <div className={styles.skeletonRow} />
            <div className={styles.skeletonRow} />
          </div>
        ) : tournamentChallengesError ? (
          <Alert tone="danger">
            <AlertTitle>Bracket unavailable</AlertTitle>
            <AlertDescription>{tournamentChallengesError}</AlertDescription>
          </Alert>
        ) : hasBracket ? (
          <>
            {tournamentBracket.type === "double" ? (
              <>
                {renderRoundSet(tournamentBracket.winners, "Winners bracket")}
                {renderRoundSet(tournamentBracket.losers, "Elimination bracket")}
                {renderRoundSet(tournamentBracket.finals, "Finals")}
              </>
            ) : (
              renderRoundSet(tournamentBracket.rounds)
            )}
          </>
        ) : (
          <p className={styles.sectionEmpty}>Add at least two entrants to generate a bracket.</p>
        )}
        {tournamentReportError ? <p className={styles.challengeMessage}>{tournamentReportError}</p> : null}
      </div>
    );
  };
  return (
    <>
      <div className={`${styles.shell} ${previewing ? styles.shellPreview : ""}`}>
        {previewing ? null : (
          <aside className={styles.sideNav} aria-label="Ladder navigation">
            <div className={styles.sideNavHeader}>
              <span className={styles.sideNavTitle}>Ladder</span>
              <p className={styles.sideNavHint}>Jump between actions</p>
            </div>
            {(
              [
                { id: "ladder", label: "Ladder" },
                { id: "report", label: "Report match" },
                { id: "challenges", label: "Active challenges" },
                { id: "results", label: "Recent results" },
                { id: "search", label: "Search" },
                { id: "roster", label: "Manage roster" },
              ] satisfies Array<{ id: NavId; label: string }>
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                className={`${styles.navButton} ${activeNav === item.id ? styles.navButtonActive : ""}`}
                onClick={() => setActiveNav(item.id)}
                aria-pressed={activeNav === item.id}
              >
                {item.label}
              </button>
            ))}
          </aside>
        )}

        <section className={styles.mainPanel}>
          {deleteError ? (
            <Alert tone="danger">
              <AlertTitle>Unable to delete ladder</AlertTitle>
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          ) : null}
          {activeNav === "ladder" ? (
            <>
              <header className={styles.panelHeader}>
                <div className={styles.headerLeft}>
                  <h2 className={styles.headerTitle}>{selectedLadderSummary?.name ?? "Select a ladder"}</h2>
                  {selectedLadderSummary?.summary || selectedGameMeta?.meta ? (
                    <p className={styles.headerSubtitle}>
                      {selectedLadderSummary?.summary ?? selectedGameMeta?.meta}
                    </p>
                  ) : null}
                  {selectedGameMeta?.meta ? (
                    <p className={styles.gameMeta}>
                      {selectedGameMeta.title} • {selectedGameMeta.meta}
                    </p>
                  ) : null}
                  {selectedLadderSummary ? (
                    <p className={styles.updatedMeta}>
                      Updated{" "}
                      {selectedLadderSummary.updatedAt
                        ? formatRelativeTime(selectedLadderSummary.updatedAt)
                        : formatRelativeTime(selectedLadderSummary.createdAt)}
                    </p>
                    ) : null}
                </div>
                <div className={styles.menuWrap} ref={menuRef}>
                  <button
                    type="button"
                    className={styles.menuTrigger}
                    onClick={() => setMenuOpen((prev) => !prev)}
                    aria-expanded={menuOpen}
                    aria-haspopup="menu"
                    title="More actions"
                  >
                    ⋯
                  </button>
                  {menuOpen ? (
                    <div className={styles.menuSurface} role="menu">
                      <button type="button" className={styles.menuItem} onClick={handleMenuSelectLadder}>
                        Select ladder
                      </button>
                      <button type="button" className={styles.menuItem} onClick={handleMenuReport}>
                        Report match
                      </button>
                      <button type="button" className={styles.menuItem} onClick={handleMenuRoster}>
                        Manage roster
                      </button>
                      <button
                        type="button"
                        className={`${styles.menuItem} ${styles.menuDanger}`}
                        onClick={handleMenuDelete}
                        disabled={
                          !selectedLadderId ||
                          deleteStatus === "deleting" ||
                          !capsuleId ||
                          !isOnline ||
                          previewing
                        }
                      >
                        {deleteStatus === "deleting" ? "Deleting..." : "Delete ladder"}
                      </button>
                    </div>
                  ) : null}
                </div>
              </header>
              {pickerOpen ? (
                <div className={styles.pickerSurface}>
                  <div className={styles.pickerRow}>
                    <label className={styles.pickerLabel} htmlFor="ladder-picker">
                      Select ladder
                    </label>
                    <button
                      type="button"
                      className={styles.pickerClose}
                      onClick={() => setPickerOpen(false)}
                    >
                      ✕
                    </button>
                  </div>
                  <select
                    id="ladder-picker"
                    ref={ladderSelectRef}
                    value={selectedLadderId ?? ""}
                    onChange={(event) => {
                      handleSelectLadder(event.target.value);
                      setPickerOpen(false);
                    }}
                    className={styles.ladderSelect}
                  >
                    {ladderSummaries.map((ladder) => (
                      <option key={ladder.id} value={ladder.id}>
                        {ladder.name}
                      </option>
                    ))}
                  </select>
                  {selectedLadderSummary ? (
                    <div className={styles.detailBadges}>
                      <span className={`${styles.statusBadge} ${styles[`tone${statusTone(selectedLadderSummary.status)}`]}`}>
                        {formatStatus(selectedLadderSummary.status)}
                      </span>
                      <span className={styles.badgeSoft}>{formatVisibility(selectedLadderSummary.visibility)}</span>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className={styles.tabStrip}>
                <Tabs
                  value={activeTab}
                  onValueChange={(val) => setActiveTab(val as LadderTabId)}
                  variant="outline"
                  size="md"
                >
                  <TabsList className={styles.tabList}>
                    <TabsTrigger className={styles.tabTrigger} value="standings">
                      Standings
                    </TabsTrigger>
                    <TabsTrigger className={styles.tabTrigger} value="overview">
                      Overview
                    </TabsTrigger>
                    <TabsTrigger className={styles.tabTrigger} value="rules">
                      Rules
                    </TabsTrigger>
                    <TabsTrigger className={styles.tabTrigger} value="shoutouts">
                      Shoutouts
                    </TabsTrigger>
                    <TabsTrigger className={styles.tabTrigger} value="rewards">
                      Rewards
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="standings">
                    <div className={styles.standingsCard}>
                      <div className={styles.standingsHeader}>
                        <div>
                          <h3 className={styles.detailTitle}>Standings</h3>
                        </div>
                      </div>
                      {renderStandings()}
                    </div>
                  </TabsContent>
                  <TabsContent value="overview">
                    <div className={styles.detailCard}>
                      <h3 className={styles.detailTitle}>Overview</h3>
                      {renderSectionText(
                        overviewBlock?.body ?? selectedLadderSummary?.summary,
                        overviewBlock?.bulletPoints ?? null,
                        selectedLadderSummary?.summary ?? "Add an overview to set the tone for this ladder.",
                      )}
                      {timelineItems.length ? (
                        <div className={styles.timelineBlock}>
                          <h4 className={styles.timelineTitle}>Timeline</h4>
                          <ul className={styles.timelineList}>
                            {timelineItems.map((item) => (
                              <li key={`${item.label}-${item.value}`}>
                                <span className={styles.timelineLabel}>{item.label}</span>
                                <span className={styles.timelineValue}>{item.value}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  </TabsContent>
                  <TabsContent value="rules">
                    <div className={styles.detailCard}>
                      <h3 className={styles.detailTitle}>Rules</h3>
                      {renderSectionText(
                        rulesBlock?.body,
                        rulesBlock?.bulletPoints ?? null,
                        "Document how to report scores and resolve disputes.",
                      )}
                    </div>
                  </TabsContent>
                  <TabsContent value="shoutouts">
                    <div className={styles.detailCard}>
                      <h3 className={styles.detailTitle}>Shoutouts</h3>
                      {renderSectionText(
                        shoutoutsBlock?.body,
                        shoutoutsBlock?.bulletPoints ?? null,
                        "Call out MVPs, milestones, or highlight reels.",
                      )}
                    </div>
                  </TabsContent>
                  <TabsContent value="rewards">
                    <div className={styles.detailCard}>
                      <h3 className={styles.detailTitle}>Rewards</h3>
                      {renderSectionText(
                        rewardsBlock?.body,
                        rewardsBlock?.bulletPoints ?? null,
                        "Add rewards, payouts, or bragging rights here. We’ll tie this to season settings next.",
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </>
          ) : activeNav === "report" ? (
            renderReport()
          ) : activeNav === "challenges" ? (
            renderActiveChallenges()
          ) : activeNav === "results" ? (
            renderRecentResults()
          ) : activeNav === "search" ? (
            renderSearch()
          ) : (
            renderRoster()
          )}
        {renderTournaments()}
        </section>
      </div>

      <LadderRosterManager
        open={rosterOpen}
        capsuleId={selectedLadderSummary?.capsuleId ?? capsuleId ?? null}
        ladder={selectedLadderSummary}
        isSimpleLadder={isSimpleLadder}
        onClose={() => setRosterOpen(false)}
      />
    </>
  );
}
