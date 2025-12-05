import * as React from "react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { CapsuleLadderSummary } from "@/hooks/useCapsuleLadders";
import type { BracketMatch, BracketRound, TournamentBracket } from "@/lib/ladders/bracket";
import styles from "../CapsuleEventsSection.module.css";

type TournamentBracketPanelProps = {
  tournamentSummaries: CapsuleLadderSummary[];
  selectedTournamentId: string | null;
  selectedTournamentSummary: CapsuleLadderSummary | null;
  tournamentDetailError: string | null;
  tournamentDetailLoading: boolean;
  tournamentChallengesError: string | null;
  tournamentReportError: string | null;
  bracket: TournamentBracket;
  reportingMatchId: string | null;
  loadingTournamentState: boolean;
  onSelectTournament: (tournamentId: string | null) => void;
  onReportMatch: (match: BracketMatch, winner: "a" | "b") => void;
  formatStatus: (status: CapsuleLadderSummary["status"]) => string;
  statusTone: (status: CapsuleLadderSummary["status"]) => "success" | "neutral" | "warn";
  formatVisibility: (visibility: CapsuleLadderSummary["visibility"]) => string;
};

export function TournamentBracketPanel({
  tournamentSummaries,
  selectedTournamentId,
  selectedTournamentSummary,
  tournamentDetailError,
  tournamentDetailLoading,
  tournamentChallengesError,
  tournamentReportError,
  bracket,
  reportingMatchId,
  loadingTournamentState,
  onSelectTournament,
  onReportMatch,
  formatStatus,
  statusTone,
  formatVisibility,
}: TournamentBracketPanelProps) {
  if (!tournamentSummaries.length) return null;
  if (tournamentDetailError) {
    return (
      <Alert tone="danger">
        <AlertTitle>Unable to load tournament</AlertTitle>
        <AlertDescription>{tournamentDetailError}</AlertDescription>
      </Alert>
    );
  }
  const hasBracket =
    bracket.type === "double"
      ? bracket.winners.some((round) => round.matches.length) ||
        bracket.losers.some((round) => round.matches.length) ||
        bracket.finals.some((round) => round.matches.length)
      : bracket.rounds.some((round) => round.matches.length);

  const renderMatchCard = (match: BracketMatch) => {
    const winnerId = match.winnerId;
    const reporting = reportingMatchId === match.id;
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
          {winnerId && winnerId === match.a?.id ? <span className={styles.bracketStatusPill}>Advances</span> : null}
        </div>
        <div
          className={`${styles.bracketSeedRow} ${winnerId && winnerId === match.b?.id ? styles.bracketSeedRowWinner : ""}`}
        >
          <span className={styles.bracketSeed}>{bSeed ? `#${bSeed}` : "-"}</span>
          <span className={styles.bracketTeam}>{bName}</span>
          {winnerId && winnerId === match.b?.id ? <span className={styles.bracketStatusPill}>Advances</span> : null}
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
                onClick={() => onReportMatch(match, "a")}
              >
                {reporting ? "Saving..." : `${match.a?.displayName ?? "Side A"} wins`}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={reporting || loadingTournamentState}
                onClick={() => onReportMatch(match, "b")}
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
            <div className={styles.bracketGrid}>{round.matches.map((match) => renderMatchCard(match))}</div>
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
            onChange={(event) => onSelectTournament(event.target.value || null)}
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
          {bracket.type === "double" ? (
            <>
              {renderRoundSet(bracket.winners, "Winners bracket")}
              {renderRoundSet(bracket.losers, "Elimination bracket")}
              {renderRoundSet(bracket.finals, "Finals")}
            </>
          ) : (
            renderRoundSet(bracket.rounds)
          )}
        </>
      ) : (
        <p className={styles.sectionEmpty}>Add at least two entrants to generate a bracket.</p>
      )}
      {tournamentReportError ? <p className={styles.challengeMessage}>{tournamentReportError}</p> : null}
    </div>
  );
}
