import * as React from "react";

import { Button } from "@/components/ui/button";
import type { CapsuleLadderSummary } from "@/hooks/useCapsuleLadders";
import type { CapsuleLadderMember } from "@/types/ladders";
import styles from "../CapsuleEventsSection.module.css";

type LadderRosterPanelProps = {
  selectedLadder: CapsuleLadderSummary | null;
  sortedStandings: CapsuleLadderMember[];
  onOpenRoster: () => void;
  onBackToLadder: () => void;
};

export function LadderRosterPanel({
  selectedLadder,
  sortedStandings,
  onOpenRoster,
  onBackToLadder,
}: LadderRosterPanelProps) {
  return (
    <div className={styles.panelCard}>
      <div className={styles.searchHeader}>
        <h3>Manage roster</h3>
        <p className={styles.sectionEmpty}>Add players, update seeds, and keep standings in sync.</p>
      </div>
      <div className={styles.rosterActions}>
        <Button type="button" size="sm" onClick={onOpenRoster} disabled={!selectedLadder}>
          Open roster manager
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onBackToLadder}>
          Back to ladder
        </Button>
      </div>
      <div className={styles.sectionBody}>
        {selectedLadder ? (
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
}
