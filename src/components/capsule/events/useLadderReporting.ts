import * as React from "react";

import { trackLadderEvent } from "@/lib/telemetry/ladders";
import type { CapsuleLadderMember, LadderChallenge } from "@/types/ladders";
import { buildParticipantPayload } from "./participants";

type LadderChallengeApi = ReturnType<typeof import("@/hooks/useLadderChallenges").useLadderChallenges>;

type ReportFormState = {
  ladderId: string;
  challengeId: string;
  challengerId: string;
  opponentId: string;
  outcome: "challenger" | "opponent" | "draw";
  notes: string;
  proofUrl: string;
};

type UseLadderReportingOptions = {
  capsuleId: string | null;
  ladderId: string | null;
  ladderMatchMode: string | null;
  proofRequired: boolean;
  challenges: LadderChallenge[];
  createChallenge: LadderChallengeApi["createChallenge"];
  resolveChallenge: LadderChallengeApi["resolveChallenge"];
  refreshLadderDetail: () => Promise<void>;
  findMember: (memberId: string) => CapsuleLadderMember | null;
  onTrack?: typeof trackLadderEvent;
};

export function useLadderReporting(options: UseLadderReportingOptions) {
  const {
    capsuleId,
    ladderId,
    ladderMatchMode,
    proofRequired,
    challenges,
    createChallenge,
    resolveChallenge,
    refreshLadderDetail,
    findMember,
    onTrack,
  } = options;
  const [reportStatus, setReportStatus] = React.useState<"idle" | "saving" | "saved">("idle");
  const [challengeMessage, setChallengeMessage] = React.useState<string | null>(null);
  const [reportForm, setReportForm] = React.useState<ReportFormState>({
    ladderId: ladderId ?? "",
    challengeId: "",
    challengerId: "",
    opponentId: "",
    outcome: "challenger",
    notes: "",
    proofUrl: "",
  });
  const pendingChallenges = React.useMemo(
    () => challenges.filter((challenge) => challenge.status === "pending"),
    [challenges],
  );
  const track = onTrack ?? trackLadderEvent;

  React.useEffect(() => {
    setReportForm((prev) => ({
      ...prev,
      ladderId: ladderId ?? "",
      challengeId: "",
      challengerId: "",
      opponentId: "",
      proofUrl: "",
    }));
    setChallengeMessage(null);
    setReportStatus("idle");
  }, [ladderId]);

  const handleReportFieldChange = React.useCallback((name: keyof ReportFormState, value: string) => {
    setReportForm((prev) => ({ ...prev, [name]: value }));
    setReportStatus("idle");
    setChallengeMessage(null);
  }, []);

  const handleSelectChallengeForReport = React.useCallback(
    (challengeId: string) => {
      const selected = challenges.find((challenge) => challenge.id === challengeId);
      if (!selected) {
        setReportForm((prev) => ({
          ...prev,
          challengeId: "",
          challengerId: "",
          opponentId: "",
          proofUrl: "",
        }));
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

  const updateReportForm = React.useCallback((updates: Partial<ReportFormState>) => {
    setReportForm((prev) => ({ ...prev, ...updates }));
    setReportStatus("idle");
    setChallengeMessage(null);
  }, []);

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
          outcome: reportForm.outcome,
          note: trimmedNotes ? trimmedNotes : null,
          proofUrl: trimmedProof ? trimmedProof : null,
          ...participantPayload,
        });
        track({
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
      findMember,
      ladderMatchMode,
      proofRequired,
      refreshLadderDetail,
      reportForm.challengeId,
      reportForm.challengerId,
      reportForm.ladderId,
      reportForm.notes,
      reportForm.opponentId,
      reportForm.outcome,
      reportForm.proofUrl,
      resolveChallenge,
      track,
    ],
  );

  return {
    reportForm,
    reportStatus,
    challengeMessage,
    pendingChallenges,
    setChallengeMessage,
    handleReportFieldChange,
    handleSelectChallengeForReport,
    updateReportForm,
    handleReportSubmit,
  };
}
