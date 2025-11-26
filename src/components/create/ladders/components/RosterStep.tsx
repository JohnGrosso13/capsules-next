import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ChatStartOverlay } from "@/components/chat/ChatStartOverlay";
import { useOptionalFriendsDataContext } from "@/components/providers/FriendsDataProvider";
import { getIdentityAccent } from "@/lib/identity/teams";
import type { UserSearchResult } from "@/types/search";

import type { LadderMemberFormValues } from "../ladderFormState";
import styles from "../LadderBuilder.module.css";

type MemberSuggestion = Pick<UserSearchResult, "id" | "name" | "avatarUrl" | "subtitle">;

export type RosterStepProps = {
  members: LadderMemberFormValues[];
  onMemberField: (index: number, field: keyof LadderMemberFormValues, value: string) => void;
  onAddMember: () => void;
  onAddMemberWithUser: (user: { id: string; name: string }) => void;
  onRemoveMember: (index: number) => void;
};

const MIN_NAME_QUERY = 2;
const SUGGESTION_LIMIT = 6;

type NameFieldProps = {
  index: number;
  member: LadderMemberFormValues;
  onChangeName: (value: string) => void;
  onSelectUser: (user: { id: string; name: string }) => void;
};

const NameField = ({ index, member, onChangeName, onSelectUser }: NameFieldProps) => {
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
          body: JSON.stringify({ q: term, limit: SUGGESTION_LIMIT }),
          signal: controller.signal,
        });
        if (!response.ok) {
          setSuggestions([]);
          return;
        }
        const data = (await response.json().catch(() => null)) as
          | { sections?: Array<{ type: string; items?: UserSearchResult[] }> }
          | null;
        const userSection = data?.sections?.find((section) => section.type === "users");
        const hits = Array.isArray(userSection?.items) ? (userSection?.items as UserSearchResult[]) : [];
        setSuggestions(
          hits.slice(0, SUGGESTION_LIMIT).map((item) => ({
            id: item.id,
            name: item.name,
            avatarUrl: item.avatarUrl,
            subtitle: item.subtitle,
          })),
        );
      } catch {
        setSuggestions([]);
      }
    }, 120);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const handleSelect = (suggestion: MemberSuggestion) => {
    onSelectUser({ id: suggestion.id, name: suggestion.name });
    setQuery(suggestion.name);
    setOpen(false);
  };

  return (
    <div className={styles.memberField}>
      <span
        className={styles.memberAvatar}
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
        <span className={styles.memberAvatarText}>
          {getIdentityAccent(member.displayName || `Seed ${index + 1}`, index).initials}
        </span>
      </span>
      <div className={styles.memberSuggestWrap}>
        <Input
          id={`member-name-${index}`}
          value={query}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            onChangeName(value);
          }}
          placeholder="Search by name"
        />
        {open && suggestions.length > 0 ? (
          <div className={styles.memberSuggestList} role="listbox" aria-label="Suggested users">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                type="button"
                className={styles.memberSuggestItem}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelect(suggestion)}
              >
                <span className={styles.memberSuggestName}>{suggestion.name}</span>
                {suggestion.subtitle ? (
                  <span className={styles.memberSuggestMeta}>{suggestion.subtitle}</span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export const RosterStep = React.memo(function RosterStep({
  members,
  onMemberField,
  onAddMember,
  onAddMemberWithUser,
  onRemoveMember,
}: RosterStepProps) {
  const friendsContext = useOptionalFriendsDataContext();
  const [showInvite, setShowInvite] = React.useState(false);
  const [expandedIndex, setExpandedIndex] = React.useState<number | null>(null);

  const handleInvite = React.useCallback(
    async (userIds: string[]) => {
      const friendMap = new Map<string, { id: string; name: string }>();
      (friendsContext?.friends ?? []).forEach((friend) => {
        if (friend.userId) {
          friendMap.set(friend.userId, { id: friend.userId, name: friend.name ?? friend.userId });
        }
      });
      userIds.forEach((id) => {
        const friend = friendMap.get(id);
        if (friend) {
          onAddMemberWithUser(friend);
        }
      });
      setShowInvite(false);
    },
    [friendsContext?.friends, onAddMemberWithUser],
  );

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
                          onChangeName={(value) => {
                            onMemberField(index, "displayName", value);
                            onMemberField(index, "userId", "");
                          }}
                          onSelectUser={(user) => {
                            onMemberField(index, "displayName", user.name);
                            onMemberField(index, "userId", user.id);
                          }}
                        />
                      </td>
                      <td>
                        <Input
                          id={`member-seed-${index}`}
                          value={member.seed}
                          onChange={(event) => onMemberField(index, "seed", event.target.value)}
                        />
                      </td>
                      <td>
                        <Input
                          id={`member-rating-${index}`}
                          value={member.rating}
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
        busy={false}
        onClose={() => setShowInvite(false)}
        onSubmit={handleInvite}
        mode="ladder"
      />
    </Card>
  );
});
