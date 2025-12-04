import * as React from "react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ChatStartOverlay } from "@/components/chat/ChatStartOverlay";
import { useOptionalFriendsDataContext } from "@/components/providers/FriendsDataProvider";
import { getIdentityAccent } from "@/lib/identity/teams";
import type { CapsuleSearchResult, UserSearchResult } from "@/types/search";

import type { LadderMemberFormValues } from "../ladderFormState";
import styles from "../LadderBuilder.module.css";

type MemberSuggestion = {
  kind: "user" | "capsule";
  id: string;
  name: string;
  avatarUrl: string | null;
  subtitle: string | null;
  slug?: string | null;
};

export type RosterStepProps = {
  capsuleId: string | null;
  members: LadderMemberFormValues[];
  onMemberField: (index: number, field: keyof LadderMemberFormValues, value: string) => void;
  onAddMember: () => void;
  onAddMemberWithUser: (user: { id: string; name: string; avatarUrl?: string | null }) => void;
  onRemoveMember: (index: number) => void;
};

const MIN_NAME_QUERY = 2;
const SUGGESTION_LIMIT = 6;

type NameFieldProps = {
  index: number;
  member: LadderMemberFormValues;
  capsuleId: string | null;
  onChangeName: (value: string) => void;
  onSelectIdentity: (payload: {
    kind: "user" | "capsule";
    id: string;
    name: string;
    avatarUrl?: string | null;
    slug?: string | null;
  }) => void;
};

const NameField = ({ index, member, capsuleId, onChangeName, onSelectIdentity }: NameFieldProps) => {
  const [query, setQuery] = React.useState(member.displayName);
  const [suggestions, setSuggestions] = React.useState<MemberSuggestion[]>([]);
  const [open, setOpen] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    setQuery(member.displayName);
  }, [member.displayName]);

  React.useEffect(() => {
    const term = query.trim();
    if (term.length < MIN_NAME_QUERY) {
      abortRef.current?.abort();
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            q: term,
            limit: SUGGESTION_LIMIT,
            capsuleId,
            scopes: ["users", "capsules"],
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          setSuggestions([]);
          return;
        }
        const data = (await response.json().catch(() => null)) as
          | {
              sections?: Array<{
                type: string;
                items?: Array<UserSearchResult | CapsuleSearchResult>;
              }>;
            }
          | null;
        const sections = data?.sections ?? [];
        const userSection = sections.find((section) => section.type === "users");
        const capsuleSection = sections.find((section) => section.type === "capsules");
        const userItems: UserSearchResult[] = Array.isArray(userSection?.items)
          ? (userSection.items as UserSearchResult[])
          : [];
        const capsuleItems: CapsuleSearchResult[] = Array.isArray(capsuleSection?.items)
          ? (capsuleSection.items as CapsuleSearchResult[])
          : [];
        const nextSuggestions: MemberSuggestion[] = [
          ...userItems.slice(0, SUGGESTION_LIMIT).map((item) => ({
            kind: "user" as const,
            id: item.id,
            name: item.name,
            avatarUrl: item.avatarUrl,
            subtitle: item.subtitle,
          })),
          ...capsuleItems.slice(0, SUGGESTION_LIMIT).map((item) => ({
            kind: "capsule" as const,
            id: item.id,
            name: item.name,
            avatarUrl: item.logoUrl,
            subtitle: item.subtitle ?? item.slug ?? null,
            slug: item.slug,
          })),
        ].slice(0, SUGGESTION_LIMIT);
        setSuggestions(nextSuggestions);
      } catch {
        setSuggestions([]);
      }
    }, 120);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [capsuleId, query]);

  const handleFocus = () => {
    abortRef.current?.abort();
    setSuggestions([]);
    setOpen(true);
  };

  const handleSelect = (suggestion: MemberSuggestion) => {
    onSelectIdentity({
      kind: suggestion.kind,
      id: suggestion.id,
      name: suggestion.name,
      avatarUrl: suggestion.avatarUrl ?? null,
      slug: suggestion.slug ?? null,
    });
    setQuery(suggestion.name);
    setOpen(false);
  };

  return (
    <div className={styles.memberField}>
      <span
        className={styles.memberAvatar}
        data-has-image={Boolean(member.avatarUrl)}
        data-kind={member.capsuleId ? "capsule" : "user"}
        style={
          (() => {
            const accent = getIdentityAccent(member.displayName || `Seed ${index + 1}`, index);
            return {
              "--identity-color": accent.primary,
              "--identity-glow": accent.glow,
              "--identity-border": accent.border,
              "--identity-surface": accent.surface,
              "--identity-text": accent.text,
            } as React.CSSProperties;
          })()
        }
      >
        {member.avatarUrl ? (
          <Image
            src={member.avatarUrl}
            alt=""
            width={32}
            height={32}
            className={styles.memberAvatarImage}
            sizes="32px"
          />
        ) : null}
        <span className={styles.memberAvatarText}>
          {getIdentityAccent(member.displayName || `Seed ${index + 1}`, index).initials}
        </span>
      </span>
      <div className={styles.memberSuggestWrap}>
        <Input
          id={`member-name-${index}`}
          value={query}
          onFocus={handleFocus}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          className={styles.memberNameInput}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            onChangeName(value);
          }}
          placeholder="Search by name"
        />
        {open && suggestions.length > 0 ? (
          <div className={styles.memberSuggestList} role="listbox" aria-label="Suggested users">
            {suggestions.map((suggestion) => {
              const hasAvatar = Boolean(suggestion.avatarUrl);
              const accent = getIdentityAccent(suggestion.name, index);
              const style = {
                "--identity-color": accent.primary,
                "--identity-glow": accent.glow,
                "--identity-border": accent.border,
                "--identity-surface": accent.surface,
                "--identity-text": accent.text,
              } as React.CSSProperties;
              return (
                <button
                  key={suggestion.id}
                  type="button"
                  className={styles.memberSuggestItem}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleSelect(suggestion)}
                >
                  <span
                    className={styles.memberSuggestAvatar}
                    data-has-image={hasAvatar}
                    data-kind={suggestion.kind}
                    style={style}
                    aria-hidden="true"
                  >
                    {hasAvatar ? (
                      <Image
                        src={suggestion.avatarUrl as string}
                        alt=""
                        width={28}
                        height={28}
                        sizes="28px"
                      />
                    ) : (
                      <span>{accent.initials}</span>
                    )}
                  </span>
                  <span className={styles.memberSuggestText}>
                    <span className={styles.memberSuggestName}>{suggestion.name}</span>
                    {suggestion.subtitle ? (
                      <span className={styles.memberSuggestMeta}>{suggestion.subtitle}</span>
                    ) : (
                      <span className={styles.memberSuggestMeta}>
                        {suggestion.kind === "capsule" ? "Capsule" : "User"}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export const RosterStep = React.memo(function RosterStep({
  capsuleId,
  members,
  onMemberField,
  onAddMember,
  onAddMemberWithUser,
  onRemoveMember,
}: RosterStepProps) {
  const friendsContext = useOptionalFriendsDataContext();
  const [showInvite, setShowInvite] = React.useState(false);
  const [expandedIndex, setExpandedIndex] = React.useState<number | null>(null);
  const [inviteBusy, setInviteBusy] = React.useState(false);
  const [inviteError, setInviteError] = React.useState<string | null>(null);

  const handleInvite = React.useCallback(
    async (userIds: string[]) => {
      setInviteError(null);
      const friendMap = new Map<string, { id: string; name: string; avatarUrl: string | null }>();
      (friendsContext?.friends ?? []).forEach((friend) => {
        if (friend.userId) {
          friendMap.set(friend.userId, {
            id: friend.userId,
            name: friend.name ?? friend.userId,
            avatarUrl: friend.avatar ?? null,
          });
        }
      });
      const uniqueIds = Array.from(new Set(userIds));
      const selected = uniqueIds
        .map((id) => friendMap.get(id))
        .filter((friend): friend is { id: string; name: string; avatarUrl: string | null } => Boolean(friend));

      if (!selected.length) {
        setShowInvite(false);
        return;
      }

      setInviteBusy(true);
      selected.forEach((friend) => onAddMemberWithUser(friend));
      if (capsuleId) {
        try {
          await Promise.all(
            selected.map(async (friend) => {
              const response = await fetch(`/api/capsules/${capsuleId}/membership`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "invite_member", targetUserId: friend.id }),
              });
              if (!response.ok) {
                const payload = await response.json().catch(() => null);
                const message =
                  payload?.message ?? payload?.error?.message ?? response.statusText ?? "Unable to send invite.";
                throw new Error(message);
              }
            }),
          );
          setShowInvite(false);
        } catch (error) {
          setInviteError((error as Error).message || "Unable to send one or more invites.");
        } finally {
          setInviteBusy(false);
        }
      } else {
        setInviteBusy(false);
        setShowInvite(false);
      }
    },
    [capsuleId, friendsContext?.friends, onAddMemberWithUser],
  );

  React.useEffect(() => {
    if (!showInvite) {
      setInviteError(null);
      setInviteBusy(false);
    }
  }, [showInvite]);

  return (
    <Card className={styles.formCard} variant="ghost">
      <CardHeader className={styles.formCardHeader}>
        <CardTitle className={styles.formCardTitle}>Roster seeds & stats</CardTitle>
      </CardHeader>
      <CardContent className={styles.formCardContent}>
        <p className={styles.fieldHint}>
          <abbr
            className={styles.helperAbbr}
            title="ELO updates player skill after every match. Keep new ladders near 1200 and adjust with K-factor for larger swings."
          >
            ELO
          </abbr>{" "}
          feeds highlight badges alongside{" "}
          <abbr className={styles.helperAbbr} title="Streak counts consecutive wins so you can spotlight hot runs.">
            streak
          </abbr>{" "}
          momentum.
        </p>
        <div className={styles.membersTableWrap}>
          <table className={styles.membersTable}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Seed</th>
                <th>Rating</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {members.map((member, index) => {
                const accent = getIdentityAccent(member.displayName || `Seed ${index + 1}`, index);
                const accentStyle = {
                  "--identity-color": accent.primary,
                  "--identity-glow": accent.glow,
                  "--identity-border": accent.border,
                  "--identity-surface": accent.surface,
                  "--identity-text": accent.text,
                } as React.CSSProperties;
                return (
                  <React.Fragment key={member.id ?? `member-${index}`}>
                    <tr>
                      <td>
                        <NameField
                          index={index}
                          member={member}
                          capsuleId={capsuleId}
                          onChangeName={(value) => {
                            onMemberField(index, "displayName", value);
                            onMemberField(index, "userId", "");
                            onMemberField(index, "capsuleId", "");
                            onMemberField(index, "capsuleSlug", "");
                            onMemberField(index, "avatarUrl", "");
                          }}
                          onSelectIdentity={(selection) => {
                            onMemberField(index, "displayName", selection.name);
                            onMemberField(index, "avatarUrl", selection.avatarUrl ?? "");
                            if (selection.kind === "user") {
                              onMemberField(index, "userId", selection.id);
                              onMemberField(index, "capsuleId", "");
                              onMemberField(index, "capsuleSlug", "");
                            } else {
                              onMemberField(index, "userId", "");
                              onMemberField(index, "capsuleId", selection.id);
                              onMemberField(index, "capsuleSlug", selection.slug ?? "");
                            }
                          }}
                        />
                      </td>
                      <td>
                        <Input
                          id={`member-seed-${index}`}
                          value={member.seed}
                          className={styles.memberNumberInput}
                          onChange={(event) => onMemberField(index, "seed", event.target.value)}
                        />
                      </td>
                      <td>
                        <Input
                          id={`member-rating-${index}`}
                          value={member.rating}
                          className={styles.memberNumberInput}
                          onChange={(event) => onMemberField(index, "rating", event.target.value)}
                        />
                      </td>
                      <td className={styles.memberActions}>
                        <span className={styles.memberChip} style={accentStyle}>
                          Seed {member.seed || index + 1}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedIndex(expandedIndex === index ? null : index)}
                        >
                          {expandedIndex === index ? "Hide stats" : "Edit stats"}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => onRemoveMember(index)}>
                          Remove
                        </Button>
                      </td>
                    </tr>
                    {expandedIndex === index ? (
                      <tr className={styles.memberAdvancedRow}>
                        <td colSpan={4}>
                          <div className={styles.memberAdvanced}>
                            <div className={styles.memberAdvancedFields}>
                              <div className={styles.memberAdvancedField}>
                                <label className={styles.label} htmlFor={`member-wins-${index}`}>
                                  Wins
                                </label>
                                <Input
                                  id={`member-wins-${index}`}
                                  value={member.wins}
                                  className={styles.memberNumberInput}
                                  onChange={(event) => onMemberField(index, "wins", event.target.value)}
                                />
                              </div>
                              <div className={styles.memberAdvancedField}>
                                <label className={styles.label} htmlFor={`member-losses-${index}`}>
                                  Losses
                                </label>
                                <Input
                                  id={`member-losses-${index}`}
                                  value={member.losses}
                                  className={styles.memberNumberInput}
                                  onChange={(event) => onMemberField(index, "losses", event.target.value)}
                                />
                              </div>
                              <div className={styles.memberAdvancedField}>
                                <label className={styles.label} htmlFor={`member-draws-${index}`}>
                                  Draws
                                </label>
                                <Input
                                  id={`member-draws-${index}`}
                                  value={member.draws}
                                  className={styles.memberNumberInput}
                                  onChange={(event) => onMemberField(index, "draws", event.target.value)}
                                />
                              </div>
                              <div className={styles.memberAdvancedField}>
                                <label className={styles.label} htmlFor={`member-streak-${index}`}>
                                  Streak
                                </label>
                                <Input
                                  id={`member-streak-${index}`}
                                  value={member.streak}
                                  className={styles.memberNumberInput}
                                  onChange={(event) => onMemberField(index, "streak", event.target.value)}
                                />
                              </div>
                            </div>
                            <p className={styles.memberAdvancedHint}>
                              Optional: set starting records for returning seasons or migrated ladders. Leave blank for
                              new ladders.
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className={styles.memberActionsRow}>
          <Button
            type="button"
            variant="secondary"
            className={styles.memberActionButton}
            onClick={onAddMember}
          >
            Add member
          </Button>
          <Button
            type="button"
            variant="secondary"
            className={styles.memberInviteButton}
            onClick={() => setShowInvite(true)}
          >
            Invite
          </Button>
        </div>
      </CardContent>
      <ChatStartOverlay
        open={showInvite}
        friends={friendsContext?.friends ?? []}
        busy={inviteBusy}
        error={inviteError}
        onClose={() => setShowInvite(false)}
        onSubmit={handleInvite}
        mode="ladder"
      />
    </Card>
  );
});
