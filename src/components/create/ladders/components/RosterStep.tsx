import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getIdentityAccent } from "@/lib/identity/teams";

import type { LadderMemberFormValues } from "../ladderFormState";
import styles from "../LadderBuilder.module.css";

export type RosterStepProps = {
  members: LadderMemberFormValues[];
  onMemberField: (index: number, field: keyof LadderMemberFormValues, value: string) => void;
  onAddMember: () => void;
  onRemoveMember: (index: number) => void;
};

export const RosterStep = React.memo(function RosterStep({
  members,
  onMemberField,
  onAddMember,
  onRemoveMember,
}: RosterStepProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Roster seeds & stats</CardTitle>
      </CardHeader>
      <CardContent className={styles.cardContent}>
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
                <th>Handle</th>
                <th>Seed</th>
                <th>Rating</th>
                <th>W</th>
                <th>L</th>
                <th>Draw</th>
                <th>Streak</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {members.map((member, index) => {
                const accent = getIdentityAccent(member.displayName || member.handle || `Seed ${index + 1}`, index);
                const accentStyle = {
                  "--identity-color": accent.primary,
                  "--identity-glow": accent.glow,
                  "--identity-border": accent.border,
                  "--identity-surface": accent.surface,
                  "--identity-text": accent.text,
                } as React.CSSProperties;
                return (
                  <tr key={member.id ?? `member-${index}`}>
                    <td>
                      <div className={styles.memberField}>
                        <span className={styles.memberAvatar} style={accentStyle}>
                          <span className={styles.memberAvatarText}>{accent.initials}</span>
                        </span>
                        <Input
                          id={`member-name-${index}`}
                          value={member.displayName}
                          onChange={(event) => onMemberField(index, "displayName", event.target.value)}
                          placeholder="Player name"
                        />
                      </div>
                    </td>
                    <td>
                      <Input
                        id={`member-handle-${index}`}
                        value={member.handle}
                        onChange={(event) => onMemberField(index, "handle", event.target.value)}
                        placeholder="@handle"
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
                    <td>
                      <Input
                        id={`member-wins-${index}`}
                        value={member.wins}
                        onChange={(event) => onMemberField(index, "wins", event.target.value)}
                      />
                    </td>
                    <td>
                      <Input
                        id={`member-losses-${index}`}
                        value={member.losses}
                        onChange={(event) => onMemberField(index, "losses", event.target.value)}
                      />
                    </td>
                    <td>
                      <Input
                        id={`member-draws-${index}`}
                        value={member.draws}
                        onChange={(event) => onMemberField(index, "draws", event.target.value)}
                      />
                    </td>
                    <td>
                      <Input
                        id={`member-streak-${index}`}
                        value={member.streak}
                        onChange={(event) => onMemberField(index, "streak", event.target.value)}
                      />
                    </td>
                    <td className={styles.memberActions}>
                      <span className={styles.memberChip} style={accentStyle}>
                        Seed {member.seed || index + 1}
                      </span>
                      <Button type="button" variant="ghost" size="sm" onClick={() => onRemoveMember(index)}>
                        Remove
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Button type="button" variant="secondary" onClick={onAddMember}>
          Add member
        </Button>
      </CardContent>
    </Card>
  );
});
