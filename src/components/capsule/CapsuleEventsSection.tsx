
"use client";

import * as React from "react";
import Link from "next/link";

import { LadderRosterManager } from "@/components/capsule/LadderRosterManager";
import {
  Alert,
  AlertActions,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CapsuleLadderSummary } from "@/hooks/useCapsuleLadders";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { formatRelativeTime } from "@/lib/composer/sidebar-types";
import { trackLadderEvent } from "@/lib/telemetry/ladders";
import { getIdentityAccent } from "@/lib/identity/teams";
import styles from "./CapsuleEventsSection.module.css";

type CapsuleEventsSectionProps = {
  capsuleId: string | null;
  ladders: CapsuleLadderSummary[];
  tournaments: CapsuleLadderSummary[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
};

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

type StatusFilterId = "all" | "active" | "draft" | "archived";

const STATUS_FILTERS: Array<{ id: StatusFilterId; label: string }> = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "draft", label: "Drafts" },
  { id: "archived", label: "Archived" },
];

type SortId = "updated" | "name" | "status";

type SortDirection = "asc" | "desc";

const SORT_OPTIONS: Array<{ id: SortId; label: string }> = [
  { id: "updated", label: "Newest" },
  { id: "name", label: "Name" },
  { id: "status", label: "Status" },
];

function formatVisibility(visibility: CapsuleLadderSummary["visibility"]): string {
  if (visibility === "capsule") return "Capsule";
  if (visibility === "private") return "Private";
  return "Public";
}

function formatGameMeta(ladder: CapsuleLadderSummary): { title: string; meta: string | null } {
  const meta = ladder.meta && typeof ladder.meta === "object" ? (ladder.meta as Record<string, unknown>) : null;
  const game = meta && typeof meta.game === "object" ? (meta.game as Record<string, unknown>) : null;
  const fallbackTitle =
    typeof meta?.gameTitle === "string" && meta.gameTitle.trim().length
      ? (meta.gameTitle as string)
      : ladder.name;
  const title = typeof game?.title === "string" && game.title.trim().length ? game.title : fallbackTitle || "Untitled ladder";
  const metaParts = [game?.mode, game?.platform, game?.region]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length);
  return {
    title,
    meta: metaParts.length ? metaParts.join(" \u2022 ") : null,
  };
}

type LadderMetaSnapshot = {
  rosterCount: number | null;
  nextEventAt: string | null;
};

function parseNumeric(meta: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const raw = meta[key];
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string" && raw.trim().length) {
      const parsed = Number.parseInt(raw.trim(), 10);
      if (Number.isFinite(parsed)) return parsed;
    }
    if (raw && typeof raw === "object") {
      const nestedCount =
        typeof (raw as Record<string, unknown>).count === "number"
          ? ((raw as Record<string, unknown>).count as number)
          : undefined;
      if (typeof nestedCount === "number" && Number.isFinite(nestedCount)) {
        return nestedCount;
      }
    }
  }
  return null;
}

function extractLadderMeta(ladder: CapsuleLadderSummary): LadderMetaSnapshot {
  const meta = ladder.meta && typeof ladder.meta === "object" ? (ladder.meta as Record<string, unknown>) : null;
  if (!meta) return { rosterCount: null, nextEventAt: null };
  const rosterCount = parseNumeric(meta, ["rosterCount", "membersCount", "roster_count", "memberCount"]);
  const nextEvent =
    typeof meta.nextEventAt === "string"
      ? meta.nextEventAt
      : typeof meta.nextMatchAt === "string"
        ? meta.nextMatchAt
        : typeof meta.nextScheduledAt === "string"
          ? meta.nextScheduledAt
          : null;
  return {
    rosterCount: rosterCount ?? null,
    nextEventAt: nextEvent,
  };
}

type TournamentMetaSnapshot = {
  formatLabel: string;
  participants: number | null;
  startsAt: string | null;
};

function extractTournamentMeta(tournament: CapsuleLadderSummary): TournamentMetaSnapshot {
  const meta = tournament.meta && typeof tournament.meta === "object" ? (tournament.meta as Record<string, unknown>) : {};
  const formatRaw =
    typeof meta.formatLabel === "string"
      ? (meta.formatLabel as string)
      : typeof meta.format === "string"
        ? (meta.format as string)
        : null;
  const formatLabel = formatRaw ? formatRaw.replace(/_/g, " ") : "Bracket";
  const participants = parseNumeric(meta, ["teamsCount", "playersCount", "entrants", "participantCount"]);
  const scheduleInfo = meta.schedule && typeof meta.schedule === "object" ? (meta.schedule as Record<string, unknown>) : null;
  const startsAt =
    typeof meta.startsAt === "string"
      ? (meta.startsAt as string)
      : scheduleInfo && typeof scheduleInfo.start === "string"
        ? (scheduleInfo.start as string)
        : null;
  return { formatLabel, participants: participants ?? null, startsAt };
}

export function CapsuleEventsSection({ capsuleId, ladders, tournaments, loading, error, onRetry }: CapsuleEventsSectionProps) {
  const isOnline = useNetworkStatus();
  const [statusFilter, setStatusFilter] = React.useState<StatusFilterId>("all");
  const [sortBy, setSortBy] = React.useState<SortId>("updated");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("desc");
  const [query, setQuery] = React.useState("");
  const [activeRosterLadder, setActiveRosterLadder] = React.useState<CapsuleLadderSummary | null>(null);
  const INITIAL_LADDER_BATCH = 200;
  const INITIAL_TOURNAMENT_BATCH = 100;
  const [ladderRenderCount, setLadderRenderCount] = React.useState<number>(INITIAL_LADDER_BATCH);
  const [tournamentRenderCount, setTournamentRenderCount] = React.useState<number>(INITIAL_TOURNAMENT_BATCH);
  const [sortAnnouncement, setSortAnnouncement] = React.useState<string>("");
  const [sortPulse, setSortPulse] = React.useState<boolean>(false);

  React.useEffect(() => {
    setLadderRenderCount(INITIAL_LADDER_BATCH);
  }, [statusFilter, query, sortBy, sortDirection, ladders]);

  React.useEffect(() => {
    setTournamentRenderCount(INITIAL_TOURNAMENT_BATCH);
  }, [tournaments]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const label = SORT_OPTIONS.find((option) => option.id === sortBy)?.label ?? "Newest";
    setSortAnnouncement(`Sorted by ${label}, ${sortDirection === "asc" ? "ascending" : "descending"}.`);
    setSortPulse(true);
    const timer = window.setTimeout(() => setSortPulse(false), 320);
    return () => window.clearTimeout(timer);
  }, [sortBy, sortDirection]);

  const ladderStats = React.useMemo(() => {
    const counts = {
      total: ladders.length,
      active: 0,
      draft: 0,
      archived: 0,
      rosterTotal: 0,
      rosterSources: 0,
      upcoming: 0,
    };
    ladders.forEach((ladder) => {
      if (ladder.status === "active") counts.active += 1;
      if (ladder.status === "draft") counts.draft += 1;
      if (ladder.status === "archived") counts.archived += 1;
      const meta = extractLadderMeta(ladder);
      if (typeof meta.rosterCount === "number") {
        counts.rosterTotal += meta.rosterCount;
        counts.rosterSources += 1;
      }
      if (meta.nextEventAt) counts.upcoming += 1;
    });
    return counts;
  }, [ladders]);

  const filteredLadders = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const byStatus =
      statusFilter === "all" ? ladders : ladders.filter((ladder) => ladder.status === statusFilter);
    const searched = normalizedQuery.length
      ? byStatus.filter((ladder) => {
          const haystack = `${ladder.name} ${ladder.summary || ""}`.toLowerCase();
          return haystack.includes(normalizedQuery);
        })
      : byStatus;

    const sorted = [...searched].sort((a, b) => {
      if (sortBy === "name") {
        const compare = a.name.localeCompare(b.name);
        return sortDirection === "asc" ? compare : -compare;
      }
      if (sortBy === "status") {
        const order: Record<CapsuleLadderSummary["status"], number> = { active: 0, draft: 1, archived: 2 };
        const compare = order[a.status] - order[b.status] || b.updatedAt.localeCompare(a.updatedAt);
        return sortDirection === "asc" ? compare : -compare;
      }
      const aTime = Number(new Date(a.updatedAt || a.createdAt));
      const bTime = Number(new Date(b.updatedAt || b.createdAt));
      const compare = bTime - aTime;
      return sortDirection === "asc" ? -compare : compare;
    });
    return sorted;
  }, [ladders, query, sortBy, sortDirection, statusFilter]);

  const tournamentsSorted = React.useMemo(() => {
    return [...tournaments].sort((a, b) => {
      const aMeta = extractTournamentMeta(a);
      const bMeta = extractTournamentMeta(b);
      const aTime = Number(new Date(aMeta.startsAt || a.updatedAt || a.createdAt));
      const bTime = Number(new Date(bMeta.startsAt || b.updatedAt || b.createdAt));
      return aTime - bTime;
    });
  }, [tournaments]);

  const laddersVisible = React.useMemo(
    () => filteredLadders.slice(0, ladderRenderCount),
    [filteredLadders, ladderRenderCount],
  );
  const ladderHasMore = filteredLadders.length > ladderRenderCount;
  const tournamentsVisible = React.useMemo(
    () => tournamentsSorted.slice(0, tournamentRenderCount),
    [tournamentsSorted, tournamentRenderCount],
  );
  const tournamentsHasMore = tournamentsSorted.length > tournamentRenderCount;

  const handleFilterChange = React.useCallback(
    (id: StatusFilterId) => {
      setStatusFilter(id);
      trackLadderEvent({
        event: "ladders.filter.change",
        capsuleId,
        payload: { filter: id },
      });
    },
    [capsuleId],
  );

  const applySort = React.useCallback(
    (id: SortId, direction: SortDirection) => {
      setSortBy(id);
      setSortDirection(direction);
      trackLadderEvent({
        event: "ladders.sort.change",
        capsuleId,
        payload: { sortBy: id, direction },
      });
    },
    [capsuleId],
  );

  const handleSortToggle = React.useCallback(
    (id: SortId) => {
      if (sortBy === id) {
        applySort(id, sortDirection === "asc" ? "desc" : "asc");
      } else {
        applySort(id, id === "updated" ? "desc" : "asc");
      }
    },
    [applySort, sortBy, sortDirection],
  );

  const handleLoadMoreLadders = React.useCallback(() => {
    if (!ladderHasMore) return;
    setLadderRenderCount((prev) => {
      const next = Math.min(prev + INITIAL_LADDER_BATCH, filteredLadders.length);
      if (next !== prev) {
        trackLadderEvent({
          event: "ladders.load_more",
          capsuleId,
          payload: { context: "ladders", previous: prev, next },
        });
      }
      return next;
    });
  }, [capsuleId, filteredLadders.length, ladderHasMore]);

  const handleLoadMoreTournaments = React.useCallback(() => {
    if (!tournamentsHasMore) return;
    setTournamentRenderCount((prev) => {
      const next = Math.min(prev + INITIAL_TOURNAMENT_BATCH, tournamentsSorted.length);
      if (next !== prev) {
        trackLadderEvent({
          event: "ladders.load_more",
          capsuleId,
          payload: { context: "tournaments", previous: prev, next },
        });
      }
      return next;
    });
  }, [capsuleId, tournamentsHasMore, tournamentsSorted.length]);

  const handleRetryClick = React.useCallback(() => {
    trackLadderEvent({
      event: "ladders.retry.click",
      capsuleId,
      payload: { context: "events_list" },
    });
    onRetry();
  }, [capsuleId, onRetry]);

  const handleResetFilters = React.useCallback(() => {
    setStatusFilter("all");
    trackLadderEvent({
      event: "ladders.filter.change",
      capsuleId,
      payload: { filter: "all", reason: "reset" },
    });
  }, [capsuleId]);

  React.useEffect(() => {
    if (error) {
      trackLadderEvent({
        event: "ladders.error.surface",
        capsuleId,
        payload: { context: "events_list", message: error },
      });
    }
  }, [capsuleId, error]);

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
          <AlertTitle>{"We couldn't load ladders."}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
          <AlertActions>
        <Button type="button" variant="secondary" onClick={handleRetryClick} disabled={!isOnline}>
          Retry
        </Button>
          </AlertActions>
        </Alert>
      </div>
    );
  }

  if (!ladders.length && !tournaments.length) {
    const baseHref = "/create/ladders";
    const ladderHref = capsuleId ? `${baseHref}?capsuleId=${capsuleId}` : baseHref;
    const tournamentHref = capsuleId
      ? `${baseHref}?capsuleId=${capsuleId}&variant=tournament`
      : `${baseHref}?variant=tournament`;
    return (
      <div className={styles.stateCard}>
        <div className={styles.stateHeading}>No ladders or tournaments yet</div>
        <p className={styles.stateBody}>
          {
            "Spin up a ladder or bracketed tournament with Capsule AI. We'll surface active events here so members can join and follow along."
          }
        </p>
        <div className={styles.emptyActions}>
          <Button asChild>
            <Link href={ladderHref}>Create a ladder</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href={tournamentHref}>Launch a tournament</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.listWrap}>
      <span className={styles.srOnly} aria-live="polite">
        {sortAnnouncement}
      </span>
      {!isOnline ? (
        <Alert tone="warning" className={styles.offlineBanner}>
          <AlertTitle>Offline mode</AlertTitle>
          <AlertDescription>Viewing cached ladders. Reconnect to fetch the latest standings.</AlertDescription>
        </Alert>
      ) : null}

      <section className={styles.sectionShell}>
        <header className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Capsule ladders</h2>
            <p className={styles.sectionSubtitle}>
              Track standings, share schedules, and give members a rally point for competition.
            </p>
          </div>
          <div className={styles.headerActions}>
            <div className={styles.searchWrap}>
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search ladders"
                aria-label="Search ladders"
                type="search"
                className={styles.searchInput}
              />
            </div>
            <div className={styles.filterGroup} role="radiogroup" aria-label="Filter ladders by status">
              {STATUS_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  className={`${styles.filterButton} ${statusFilter === filter.id ? styles.filterButtonActive : ""}`}
                  onClick={() => handleFilterChange(filter.id)}
                  aria-pressed={statusFilter === filter.id}
                >
                  <span>{filter.label}</span>
                  <span className={styles.filterCount}>
                    {filter.id === "all"
                      ? ladderStats.total
                      : filter.id === "active"
                        ? ladderStats.active
                        : filter.id === "draft"
                          ? ladderStats.draft
                          : ladderStats.archived}
                  </span>
                </button>
              ))}
            </div>
            <div className={styles.sortWrap}>
              <div className={styles.sortSelectWrap}>
                <select
                  id="ladder-sort"
                  className={styles.sortSelect}
                  value={sortBy}
                  aria-label="Sort ladders"
                  onChange={(event) => setSortBy(event.target.value as SortId)}
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={styles.sortDirectionBtn}
                  onClick={() => setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))}
                  aria-label={`Toggle sort direction (currently ${sortDirection === "asc" ? "ascending" : "descending"})`}
                >
                  {sortDirection === "asc" ? "?" : "?"}
                </button>
              </div>
            </div>
            <Button asChild size="sm">
              <Link href={capsuleId ? `/create/ladders?capsuleId=${capsuleId}` : "/create/ladders"}>Create ladder</Link>
            </Button>
          </div>
        </header>

        <div className={styles.summaryStats}>
          <div className={styles.statCard}>
            <span>Total ladders</span>
            <strong>{ladderStats.total}</strong>
          </div>
          <div className={styles.statCard}>
            <span>Active</span>
            <strong>{ladderStats.active}</strong>
          </div>
          <div className={styles.statCard}>
            <span>Drafts</span>
            <strong>{ladderStats.draft}</strong>
          </div>
          <div className={styles.statCard}>
            <span>Participants</span>
            <strong>{ladderStats.rosterSources ? ladderStats.rosterTotal : "n/a"}</strong>
          </div>
          <div className={styles.statCard}>
            <span>Upcoming</span>
            <strong>{ladderStats.upcoming}</strong>
          </div>
        </div>

        {filteredLadders.length ? (
          <div className={`${styles.ladderTableWrap} ${sortPulse ? styles.sortPulse : ""}`}>
            <table className={styles.ladderTable}>
              <thead>
                <tr>
                  <th scope="col">Ladder</th>
                  <th scope="col">
                    <button
                      type="button"
                      className={styles.sortableHeader}
                      onClick={() => handleSortToggle("name")}
                      aria-pressed={sortBy === "name"}
                    >
                      Game
                    </button>
                  </th>
                  <th scope="col">
                    <button
                      type="button"
                      className={styles.sortableHeader}
                      onClick={() => handleSortToggle("status")}
                      aria-pressed={sortBy === "status"}
                    >
                      Status
                    </button>
                  </th>
                  <th scope="col">Visibility</th>
                  <th scope="col">Roster</th>
                  <th scope="col">Next match</th>
                  <th scope="col">
                    <button
                      type="button"
                      className={styles.sortableHeader}
                      onClick={() => handleSortToggle("updated")}
                      aria-pressed={sortBy === "updated"}
                    >
                      Updated
                    </button>
                  </th>
                  <th scope="col" className={styles.actionsCol}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {laddersVisible.map((ladder, ladderIndex) => {
                  const { title: gameTitle, meta: gameMeta } = formatGameMeta(ladder);
                  const updatedLabel = ladder.updatedAt
                    ? formatRelativeTime(ladder.updatedAt)
                    : formatRelativeTime(ladder.createdAt);
                  const ladderMeta = extractLadderMeta(ladder);
                  const manageHref = `/create/ladders?capsuleId=${ladder.capsuleId ?? capsuleId ?? ""}`;
                  const accent = getIdentityAccent(ladder.name, ladderIndex);
                  const accentStyle = {
                    "--identity-color": accent.primary,
                    "--identity-glow": accent.glow,
                    "--identity-border": accent.border,
                    "--identity-surface": accent.surface,
                    "--identity-text": accent.text,
                  } as React.CSSProperties;
                  return (
                    <tr key={ladder.id}>
                      <th scope="row">
                        <div className={styles.tablePrimary}>
                          <div className={styles.tableHeadingRow}>
                            <span className={styles.identityChip} style={accentStyle}>
                              <span className={styles.identityDot} />
                              {accent.initials}
                            </span>
                            <span className={styles.ladderName}>{ladder.name}</span>
                          </div>
                          {ladder.summary ? <p className={styles.ladderSummary}>{ladder.summary}</p> : null}
                        </div>
                      </th>
                      <td>
                        <div className={styles.tableMeta}>
                          <span>{gameTitle}</span>
                          {gameMeta ? <span>{gameMeta}</span> : null}
                        </div>
                      </td>
                      <td>
                        <span className={`${styles.statusBadge} ${styles[`tone${statusTone(ladder.status)}`]}`}>
                          {formatStatus(ladder.status)}
                        </span>
                      </td>
                      <td>
                        <span className={styles.badgeSoft}>{formatVisibility(ladder.visibility)}</span>
                      </td>
                      <td>{ladderMeta.rosterCount !== null ? ladderMeta.rosterCount : "n/a"}</td>
                      <td>{ladderMeta.nextEventAt ? `In ${formatRelativeTime(ladderMeta.nextEventAt)}` : "n/a"}</td>
                      <td>{`Updated ${updatedLabel}`}</td>
                      <td className={styles.actionsCol}>
                        <Button variant="secondary" size="sm" onClick={() => setActiveRosterLadder(ladder)}>
                          Manage roster
                        </Button>
                        <Button asChild variant="ghost" size="sm">
                          <Link href={manageHref}>Edit details</Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {ladderHasMore ? (
              <div className={styles.chunkActions}>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={handleLoadMoreLadders}
                >
                  Show more ladders ({filteredLadders.length - laddersVisible.length} remaining)
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className={styles.emptyFiltered}>
            <p>No ladders match this filter yet.</p>
            <Button type="button" variant="secondary" size="sm" onClick={handleResetFilters}>
              Reset filters
            </Button>
          </div>
        )}
      </section>

      {tournaments.length ? (
        <section className={styles.sectionShell}>
          <header className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Tournaments</h2>
              <p className={styles.sectionSubtitle}>
                Showcase bracket play, seeding, and finals for your competitive capsule events.
              </p>
            </div>
            <Button asChild size="sm">
              <Link href={capsuleId ? `/create/ladders?capsuleId=${capsuleId}&variant=tournament` : "/create/ladders?variant=tournament"}>
                Create tournament
              </Link>
            </Button>
          </header>

          <div className={styles.ladderTableWrap}>
            <table className={styles.ladderTable}>
              <thead>
                <tr>
                  <th scope="col">Tournament</th>
                  <th scope="col">Format</th>
                  <th scope="col">Entrants</th>
                  <th scope="col">Status</th>
                  <th scope="col">Visibility</th>
                  <th scope="col">Schedule</th>
                  <th scope="col" className={styles.actionsCol}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {tournamentsVisible.map((tournament, tournamentIndex) => {
                  const updatedLabel = tournament.updatedAt
                    ? formatRelativeTime(tournament.updatedAt)
                    : formatRelativeTime(tournament.createdAt);
                  const manageHref = `/create/ladders?capsuleId=${tournament.capsuleId ?? capsuleId ?? ""}&variant=tournament&focus=${tournament.id}`;
                  const tournamentMeta = extractTournamentMeta(tournament);
                  const accent = getIdentityAccent(tournament.name, tournamentIndex);
                  const accentStyle = {
                    "--identity-color": accent.primary,
                    "--identity-glow": accent.glow,
                    "--identity-border": accent.border,
                    "--identity-surface": accent.surface,
                    "--identity-text": accent.text,
                  } as React.CSSProperties;

                  return (
                    <tr key={tournament.id}>
                      <th scope="row">
                        <div className={styles.tablePrimary}>
                          <div className={styles.tableHeadingRow}>
                            <span className={styles.identityChip} style={accentStyle}>
                              <span className={styles.identityDot} />
                              {accent.initials}
                            </span>
                            <span className={styles.ladderName}>{tournament.name}</span>
                          </div>
                          {tournament.summary ? (
                            <p className={styles.ladderSummary}>{tournament.summary}</p>
                          ) : null}
                        </div>
                      </th>
                      <td>{tournamentMeta.formatLabel}</td>
                      <td>{tournamentMeta.participants !== null ? tournamentMeta.participants : "n/a"}</td>
                      <td>
                        <span className={`${styles.statusBadge} ${styles[`tone${statusTone(tournament.status)}`]}`}>
                          {formatStatus(tournament.status)}
                        </span>
                      </td>
                      <td>
                        <span className={styles.badgeSoft}>{formatVisibility(tournament.visibility)}</span>
                      </td>
                      <td>
                        {tournamentMeta.startsAt
                          ? `Starts ${formatRelativeTime(tournamentMeta.startsAt)}`
                          : `Updated ${updatedLabel}`}
                      </td>
                      <td className={styles.actionsCol}>
                        <Button asChild variant="secondary" size="sm">
                          <Link href={manageHref}>Manage</Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {tournamentsHasMore ? (
              <div className={styles.chunkActions}>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={handleLoadMoreTournaments}
                >
                  Show more tournaments ({tournamentsSorted.length - tournamentsVisible.length} remaining)
                </Button>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <LadderRosterManager
        open={Boolean(activeRosterLadder)}
        capsuleId={activeRosterLadder?.capsuleId ?? capsuleId ?? null}
        ladder={activeRosterLadder}
        onClose={() => setActiveRosterLadder(null)}
      />
    </div>
  );
}
