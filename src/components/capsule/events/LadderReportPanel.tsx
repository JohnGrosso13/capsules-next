import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CapsuleLadderSummary } from "@/hooks/useCapsuleLadders";
import type { LadderChallenge, CapsuleLadderMember } from "@/types/ladders";
import styles from "../CapsuleEventsSection.module.css";

type ReportFormState = {
  ladderId: string;
  challengeId: string;
  challengerId: string;
  opponentId: string;
  outcome: "challenger" | "opponent" | "draw";
  notes: string;
  proofUrl: string;
};

type LadderReportPanelProps = {
  ladders: CapsuleLadderSummary[];
  sortedStandings: CapsuleLadderMember[];
  pendingChallenges: LadderChallenge[];
  reportForm: ReportFormState;
  reportStatus: "idle" | "saving" | "saved";
  challengeMessage: string | null;
  challengerLabel: string;
  opponentLabel: string;
  proofRequired: boolean;
  onFieldChange: (field: keyof ReportFormState, value: string) => void;
  onSelectChallenge: (challengeId: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onBackToLadder: () => void;
  findMember: (memberId: string) => CapsuleLadderMember | null;
};

export function LadderReportPanel({
  ladders,
  sortedStandings,
  pendingChallenges,
  reportForm,
  reportStatus,
  challengeMessage,
  challengerLabel,
  opponentLabel,
  proofRequired,
  onFieldChange,
  onSelectChallenge,
  onSubmit,
  onBackToLadder,
  findMember,
}: LadderReportPanelProps) {
  return (
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
      <form className={styles.reportForm} onSubmit={onSubmit}>
        <div className={styles.reportRow}>
          <label className={styles.reportField}>
            <span>Ladder</span>
            <select
              value={reportForm.ladderId}
              onChange={(event) => onFieldChange("ladderId", event.target.value)}
              required
            >
              <option value="" disabled>
                Select a ladder
              </option>
              {ladders.map((ladder) => (
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
              onChange={(event) => onSelectChallenge(event.target.value)}
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
              onChange={(event) => onFieldChange("challengerId", event.target.value)}
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
              onChange={(event) => onFieldChange("opponentId", event.target.value)}
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
                  onClick={() => onFieldChange("outcome", option.id)}
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
              onChange={(event) => onFieldChange("notes", event.target.value)}
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
              onChange={(event) => onFieldChange("proofUrl", event.target.value)}
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
          <Button type="button" variant="ghost" size="sm" onClick={onBackToLadder} disabled={reportStatus === "saving"}>
            Back to ladder
          </Button>
        </div>
      </form>
    </div>
  );
}
