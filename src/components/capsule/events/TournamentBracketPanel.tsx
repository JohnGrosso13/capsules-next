import * as React from "react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { CapsuleLadderSummary } from "@/hooks/useCapsuleLadders";
import type { CapsuleLadderMember, LadderMatchRecord } from "@/types/ladders";
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
  members: CapsuleLadderMember[];
  history: LadderMatchRecord[];
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
  members,
  history,
  reportingMatchId,
  loadingTournamentState,
  onSelectTournament,
  onReportMatch,
  formatStatus,
  statusTone,
  formatVisibility,
}: TournamentBracketPanelProps) {
  const roundRobinStandings = React.useMemo(() => {
    if (bracket.type !== "round_robin" || !members.length) return [];
    const stats = new Map<
      string,
      {
        memberId: string;
        name: string;
        wins: number;
        draws: number;
        losses: number;
        matches: number;
        points: number;
        rating: number;
      }
    >();

    members.forEach((member) => {
      stats.set(member.id, {
        memberId: member.id,
        name: member.displayName,
        wins: 0,
        draws: 0,
        losses: 0,
        matches: 0,
        points: 0,
        rating: member.rating,
      });
    });

    history.forEach((record) => {
      const a = stats.get(record.challengerId);
      const b = stats.get(record.opponentId);
      if (!a || !b) return;
      a.matches += 1;
      b.matches += 1;
      if (record.outcome === "draw") {
        a.draws += 1;
        b.draws += 1;
        a.points += 1;
        b.points += 1;
      } else if (record.outcome === "challenger") {
        a.wins += 1;
        b.losses += 1;
        a.points += 3;
      } else if (record.outcome === "opponent") {
        b.wins += 1;
        a.losses += 1;
        b.points += 3;
      }
    });

    return Array.from(stats.values()).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.rating !== a.rating) return b.rating - a.rating;
      return a.name.localeCompare(b.name);
    });
  }, [bracket.type, history, members]);

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
          {bracket.type === "round_robin" && roundRobinStandings.length ? (
            <div className={styles.standingsCard}>
              <div className={styles.standingsHeader}>
                <div>
                  <h3 className={styles.detailTitle}>Round robin standings</h3>
                </div>
              </div>
              <table className={styles.standingsTable}>
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Entrant</th>
                    <th scope="col">MP</th>
                    <th scope="col">W</th>
                    <th scope="col">D</th>
                    <th scope="col">L</th>
                    <th scope="col">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {roundRobinStandings.map((row, index) => (
                    <tr key={row.memberId}>
                      <td>
                        <span className={styles.rankBadge}>#{index + 1}</span>
                      </td>
                      <td>{row.name}</td>
                      <td>{row.matches}</td>
                      <td>{row.wins}</td>
                      <td>{row.draws}</td>
                      <td>{row.losses}</td>
                      <td>{row.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : (
        <p className={styles.sectionEmpty}>Add at least two entrants to generate a bracket.</p>
      )}
      {tournamentReportError ? <p className={styles.challengeMessage}>{tournamentReportError}</p> : null}
    </div>
  );
}
