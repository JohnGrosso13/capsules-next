import * as React from "react";

import styles from "../../ladders/LadderBuilder.module.css";
import type { TournamentPreviewModel } from "../types";

type TournamentPreviewProps = {
  model: TournamentPreviewModel;
};

export const TournamentPreview = React.memo(function TournamentPreview({ model }: TournamentPreviewProps) {
  return (
    <div className={styles.previewEmbed}>
      <div className={styles.previewCard}>
        <div className={styles.previewHeader}>
          <div>
            <span className={styles.previewLabel}>Tournament preview</span>
            <h3 className={styles.previewTitle}>{model.title}</h3>
            {model.summary ? <p className={styles.previewSummary}>{model.summary}</p> : null}
          </div>
          <div className={styles.previewMeta}>
            <div className={styles.previewMetaBlock}>
              <span className={styles.previewMetaLabel}>Capsule</span>
              <span className={styles.previewMetaValue}>{model.capsuleName}</span>
            </div>
            <div className={styles.previewMetaBlock}>
              <span className={styles.previewMetaLabel}>Format</span>
              <span className={styles.previewMetaValue}>{model.format}</span>
              <span className={styles.previewMetaHint}>{model.registration}</span>
            </div>
            <div className={styles.previewMetaBlock}>
              <span className={styles.previewMetaLabel}>Kickoff</span>
              <span className={styles.previewMetaValue}>{model.kickoff}</span>
            </div>
          </div>
        </div>
        <div className={styles.previewSections}>
          {model.sections.map((section) => (
            <div key={section.id} className={styles.previewSection}>
              <h4>{section.title}</h4>
              <p>{section.body}</p>
            </div>
          ))}
        </div>
        <div className={styles.previewRoster}>
          <div className={styles.previewHeader}>
            <div>
              <span className={styles.previewLabel}>Roster</span>
              <h3 className={styles.previewTitle}>Top entrants</h3>
            </div>
          </div>
          <ul>
            {model.participants.length ? (
              model.participants.slice(0, 12).map((participant, index) => {
                const initials =
                  participant.name
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((part) => part.charAt(0).toUpperCase())
                    .join("") || "??";
                return (
                  <li key={`${participant.name}-${index}`} className={styles.previewRosterItem}>
                    <span className={styles.previewAvatar}>
                      <span className={styles.previewAvatarText}>{initials}</span>
                    </span>
                    <div className={styles.previewMemberMeta}>
                      <span className={styles.previewMemberName}>{participant.name}</span>
                      <span className={styles.previewMemberStats}>
                        Seed {participant.seed}
                        {participant.handle ? ` | ${participant.handle}` : ""}
                      </span>
                    </div>
                    <span className={styles.previewTeamChip}>#{participant.seed}</span>
                  </li>
                );
              })
            ) : (
              <li className={styles.previewEmpty}>Add entrants to preview seeds.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
});
