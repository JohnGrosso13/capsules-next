"use client";

import * as React from "react";

import {
  Alert,
  AlertActions,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLadderMembers } from "@/hooks/useLadderMembers";
import { trackLadderEvent } from "@/lib/telemetry/ladders";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import type { CapsuleLadderMember } from "@/types/ladders";
import type { CapsuleLadderSummary } from "@/hooks/useCapsuleLadders";

import styles from "./LadderRosterManager.module.css";



type LadderRosterManagerProps = {
  open: boolean;
  capsuleId: string | null;
  ladder: CapsuleLadderSummary | null;
  isSimpleLadder?: boolean;
  onClose: () => void;
};

type MemberDraft = {
  displayName: string;
  handle: string;
  seed: string;
  rating: string;
  wins: string;
  losses: string;
  draws: string;
  streak: string;
};

const DEFAULT_MEMBER_DRAFT: MemberDraft = {
  displayName: "",
  handle: "",
  seed: "",
  rating: "1200",
  wins: "0",
  losses: "0",
  draws: "0",
  streak: "0",
};

function toMemberDraft(member: CapsuleLadderMember): MemberDraft {
  return {
    displayName: member.displayName,
    handle: member.handle ?? "",
    seed: member.seed === null || member.seed === undefined ? "" : String(member.seed),
    rating: String(member.rating ?? 1200),
    wins: String(member.wins ?? 0),
    losses: String(member.losses ?? 0),
    draws: String(member.draws ?? 0),
    streak: String(member.streak ?? 0),
  };
}

function parseNumberField(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed.length) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

export function LadderRosterManager({
  open,
  capsuleId,
  ladder,
  isSimpleLadder = false,
  onClose,
}: LadderRosterManagerProps) {
  const ladderId = ladder?.id ?? null;
  const { members, loading, error, refreshing, mutating, addMembers, updateMember, removeMember, refresh } =
    useLadderMembers({ capsuleId, ladderId });
  const isOnline = useNetworkStatus();
  const disableMutations = mutating || !isOnline;

  const [newMember, setNewMember] = React.useState<MemberDraft>(DEFAULT_MEMBER_DRAFT);
  const [editing, setEditing] = React.useState<Record<string, MemberDraft>>({});
  const [localError, setLocalError] = React.useState<string | null>(null);
  const activeError = localError ?? error;

  React.useEffect(() => {
    if (!open) {
      setNewMember(DEFAULT_MEMBER_DRAFT);
      setEditing({});
      setLocalError(null);
    }
  }, [open]);

  React.useEffect(() => {
    if (isOnline) {
      setLocalError(null);
    }
  }, [isOnline]);

  React.useEffect(() => {
    if (error) {
      trackLadderEvent({
        event: "ladders.error.surface",
        capsuleId,
        ladderId,
        payload: { context: "roster_load", message: error },
      });
    }
  }, [capsuleId, ladderId, error]);
  const handleDraftChange = React.useCallback((name: keyof MemberDraft, value: string) => {
    setNewMember((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleEditingChange = React.useCallback(
    (memberId: string, name: keyof MemberDraft, value: string) => {
      setEditing((prev) => ({ ...prev, [memberId]: { ...(prev[memberId] ?? DEFAULT_MEMBER_DRAFT), [name]: value } }));
    },
    [],
  );

  const startEditing = React.useCallback((member: CapsuleLadderMember) => {
    setEditing((prev) => ({ ...prev, [member.id]: toMemberDraft(member) }));
    setLocalError(null);
  }, []);

  const cancelEditing = React.useCallback((memberId: string) => {
    setEditing((prev) => {
      const next = { ...prev };
      delete next[memberId];
      return next;
    });
    setLocalError(null);
  }, []);

  const submitNewMember = React.useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!ladderId) return;
      if (!isOnline) {
        setLocalError("Reconnect to add roster members.");
        return;
      }
      if (!newMember.displayName.trim()) {
        setLocalError("Enter a display name for the new member.");
        return;
      }
      try {
        setLocalError(null);
        await addMembers([
          {
            displayName: newMember.displayName.trim(),
            handle: newMember.handle.trim() || null,
            seed: parseNumberField(newMember.seed),
            rating: parseNumberField(newMember.rating) ?? 1200,
            wins: parseNumberField(newMember.wins) ?? 0,
            losses: parseNumberField(newMember.losses) ?? 0,
            draws: parseNumberField(newMember.draws) ?? 0,
            streak: parseNumberField(newMember.streak) ?? 0,
          },
        ]);
        setNewMember(DEFAULT_MEMBER_DRAFT);
        trackLadderEvent({
          event: "ladders.roster.change",
          capsuleId,
          ladderId,
          payload: { action: "add", status: "success", count: 1 },
        });
      } catch (err) {
        setLocalError((err as Error).message);
        trackLadderEvent({
          event: "ladders.roster.change",
          capsuleId,
          ladderId,
          payload: { action: "add", status: "error", message: (err as Error).message },
        });
      }
    },
    [addMembers, capsuleId, isOnline, ladderId, newMember],
  );

  const submitEdit = React.useCallback(
    async (memberId: string) => {
      const draft = editing[memberId];
      if (!draft) return;
      if (!isOnline) {
        setLocalError("Reconnect to update roster members.");
        return;
      }
      if (!draft.displayName.trim()) {
        setLocalError("Display name cannot be empty.");
        return;
      }
      try {
        setLocalError(null);
        const seed = parseNumberField(draft.seed);
        const rating = parseNumberField(draft.rating);
        const wins = parseNumberField(draft.wins);
        const losses = parseNumberField(draft.losses);
        const draws = parseNumberField(draft.draws);
        const streak = parseNumberField(draft.streak);
        await updateMember(memberId, {
          displayName: draft.displayName.trim(),
          handle: draft.handle.trim() ? draft.handle.trim() : null,
          seed,
          rating,
          wins,
          losses,
          draws,
          streak,
        });
        cancelEditing(memberId);
        trackLadderEvent({
          event: "ladders.roster.change",
          capsuleId,
          ladderId,
          payload: { action: "update", status: "success" },
        });
      } catch (err) {
        setLocalError((err as Error).message);
        trackLadderEvent({
          event: "ladders.roster.change",
          capsuleId,
          ladderId,
          payload: { action: "update", status: "error", message: (err as Error).message },
        });
      }
    },
    [capsuleId, cancelEditing, editing, isOnline, ladderId, updateMember],
  );

  const handleRemove = React.useCallback(
    async (memberId: string) => {
      if (!isOnline) {
        setLocalError("Reconnect to update roster members.");
        return;
      }
      try {
        setLocalError(null);
        await removeMember(memberId);
        trackLadderEvent({
          event: "ladders.roster.change",
          capsuleId,
          ladderId,
          payload: { action: "remove", status: "success" },
        });
      } catch (err) {
        setLocalError((err as Error).message);
        trackLadderEvent({
          event: "ladders.roster.change",
          capsuleId,
          ladderId,
          payload: { action: "remove", status: "error", message: (err as Error).message },
        });
      }
    },
    [capsuleId, isOnline, ladderId, removeMember],
  );

  const handleRefresh = React.useCallback(() => {
    trackLadderEvent({
      event: "ladders.retry.click",
      capsuleId,
      ladderId,
      payload: { context: "roster" },
    });
    refresh();
  }, [capsuleId, ladderId, refresh]);

  if (!open || !ladder || !capsuleId || !ladderId) {
    return null;
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="roster-manager-title">
      <div className={styles.dialog}>
        <header className={styles.header}>
          <div className={styles.titleRow}>
            <div>
              <h2 id="roster-manager-title" className={styles.title}>
                {ladder.name} roster
              </h2>
              <p className={styles.subtitle}>Invite players, edit seeds, and keep the ladder lineup up to date.</p>
            </div>
            <button type="button" className={styles.closeBtn} onClick={onClose} disabled={mutating}>
              Close
            </button>
          </div>
        </header>

        {(activeError || !isOnline) ? (
          <div className={styles.stateBanner}>
            {!isOnline ? (
              <Alert tone="warning">
                <AlertTitle>Offline mode</AlertTitle>
                <AlertDescription>Reconnect to update ladder rosters. Viewing is still available.</AlertDescription>
              </Alert>
            ) : null}
            {activeError ? (
              <Alert tone="danger">
                <AlertTitle>Unable to update roster</AlertTitle>
                <AlertDescription>{activeError}</AlertDescription>
                <AlertActions>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={handleRefresh}
                    disabled={loading || refreshing}
                  >
                    Retry
                  </Button>
                </AlertActions>
              </Alert>
            ) : null}
          </div>
        ) : null}

        <div className={styles.body}>
          <div className={styles.rosterTableWrap}>
            {loading ? (
              <div className={styles.loadingSkeleton} aria-busy="true">
                <div className={styles.skeletonRow} />
                <div className={styles.skeletonRow} />
                <div className={styles.skeletonRow} />
                <div className={styles.skeletonRow} />
              </div>
            ) : members.length ? (
              <table className={styles.rosterTable}>
                <thead>
                  <tr>
                    <th scope="col">Member</th>
                    <th scope="col">Seed</th>
                    {!isSimpleLadder ? <th scope="col">Rating</th> : null}
                    <th scope="col">Record</th>
                    <th scope="col" className={styles.actionsCol}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => {
                    const draft = editing[member.id];
                    const record = `${member.wins}-${member.losses}${member.draws ? `-${member.draws}` : ""}`;
                    return (
                      <tr key={member.id}>
                        <td>
                          {draft ? (
                            <div className={styles.inlineForm}>
                              <Input
                                className={styles.input}
                                value={draft.displayName}
                                disabled={disableMutations}
                                onChange={(event) => handleEditingChange(member.id, "displayName", event.target.value)}
                                placeholder="Display name"
                              />
                              <Input
                                className={styles.input}
                                value={draft.handle}
                                disabled={disableMutations}
                                onChange={(event) => handleEditingChange(member.id, "handle", event.target.value)}
                                placeholder="@handle"
                              />
                              <Input
                                className={styles.input}
                                value={draft.seed}
                                disabled={disableMutations}
                                onChange={(event) => handleEditingChange(member.id, "seed", event.target.value)}
                                placeholder="Seed"
                              />
                              {!isSimpleLadder ? (
                                <Input
                                  className={styles.input}
                                  value={draft.rating}
                                  disabled={disableMutations}
                                  onChange={(event) => handleEditingChange(member.id, "rating", event.target.value)}
                                  placeholder="Rating"
                                />
                              ) : null}
                            </div>
                          ) : (
                            <div>
                              <span className={styles.memberName}>{member.displayName}</span>
                              {member.handle ? <div className={styles.memberHandle}>@{member.handle}</div> : null}
                              <div className={styles.memberMeta}>
                                <span>ID: {member.id.slice(0, 6)}</span>
                                {member.userId ? <span className={styles.chip}>Linked account</span> : null}
                              </div>
                            </div>
                          )}
                        </td>
                        <td>{draft ? null : member.seed ?? "\u2014"}</td>
                        {!isSimpleLadder ? <td>{draft ? null : member.rating}</td> : null}
                        <td>{draft ? null : record}</td>
                        <td className={styles.actionCell}>
                          {draft ? (
                            <div className={styles.inlineFormControls}>
                              <button type="button" onClick={() => submitEdit(member.id)} disabled={disableMutations}>
                                Save
                              </button>
                              <button type="button" onClick={() => cancelEditing(member.id)} disabled={mutating}>
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className={styles.inlineControls}>
                              <button type="button" onClick={() => startEditing(member)} disabled={disableMutations}>
                                Edit
                              </button>
                              <button type="button" onClick={() => handleRemove(member.id)} disabled={disableMutations}>
                                Remove
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className={styles.emptyState}>No members yet. Invite or add competitors to populate the ladder.</div>
            )}
          </div>

          <aside className={styles.formPanel}>
            <div>
              <h3>Add member</h3>
              <p className={styles.subtitle}>Create a roster entry with optional seed and stats.</p>
            </div>
            <form className={styles.formGrid} onSubmit={submitNewMember}>
              <fieldset className={styles.formFieldset} disabled={disableMutations}>
                <Input
                  className={styles.input}
                  value={newMember.displayName}
                  onChange={(event) => handleDraftChange("displayName", event.target.value)}
                  placeholder="Display name"
                />
                <Input
                  className={styles.input}
                  value={newMember.handle}
                  onChange={(event) => handleDraftChange("handle", event.target.value)}
                  placeholder="@handle (optional)"
                />
                <Input
                  className={styles.input}
                  value={newMember.seed}
                  onChange={(event) => handleDraftChange("seed", event.target.value)}
                  placeholder="Seed"
                />
                {!isSimpleLadder ? (
                  <Input
                    className={styles.input}
                    value={newMember.rating}
                    onChange={(event) => handleDraftChange("rating", event.target.value)}
                    placeholder="Rating"
                  />
                ) : null}
                <Input
                  className={styles.input}
                  value={newMember.wins}
                  onChange={(event) => handleDraftChange("wins", event.target.value)}
                  placeholder="Wins"
                />
                <Input
                  className={styles.input}
                  value={newMember.losses}
                  onChange={(event) => handleDraftChange("losses", event.target.value)}
                  placeholder="Losses"
                />
                <Input
                  className={styles.input}
                  value={newMember.draws}
                  onChange={(event) => handleDraftChange("draws", event.target.value)}
                  placeholder="Draws"
                />
                <Input
                  className={styles.input}
                  value={newMember.streak}
                  onChange={(event) => handleDraftChange("streak", event.target.value)}
                  placeholder="Streak"
                />
                <Button type="submit" size="sm" disabled={disableMutations}>
                  Add to roster
                </Button>
              </fieldset>
            </form>
            <div className={styles.footer}>
              <span>{members.length ? `${members.length} members in this ladder.` : "No members yet."}</span>
              <Button type="button" variant="secondary" size="sm" onClick={refresh} disabled={refreshing || loading}>
                Refresh roster
              </Button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
