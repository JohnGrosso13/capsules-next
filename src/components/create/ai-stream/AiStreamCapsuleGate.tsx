"use client";

import * as React from "react";

import { CapsuleGate } from "@/components/capsule/CapsuleGate";
import { Button } from "@/components/ui/button";
import type { CapsuleSummary } from "@/server/capsules/service";

import styles from "./ai-stream-capsule-gate.module.css";

type AiStreamCapsuleGateProps = {
  capsules: CapsuleSummary[];
  defaultCapsuleId?: string | null;
};

function resolveRoleLabel(capsule: CapsuleSummary): string {
  if (capsule.ownership === "owner") return "Owner";
  if (capsule.role && capsule.role.trim().length) {
    return capsule.role[0]?.toUpperCase() + capsule.role.slice(1);
  }
  return "Member";
}

export function AiStreamCapsuleGate({ capsules, defaultCapsuleId }: AiStreamCapsuleGateProps) {
  const initialSelection = React.useMemo(() => {
    if (capsules.length === 1) return capsules[0] ?? null;
    if (defaultCapsuleId) {
      return capsules.find((capsule) => capsule.id === defaultCapsuleId) ?? null;
    }
    return null;
  }, [capsules, defaultCapsuleId]);

  const [selectedCapsule, setSelectedCapsule] = React.useState(initialSelection);

  React.useEffect(() => {
    setSelectedCapsule(initialSelection);
  }, [initialSelection]);

  const hasCapsules = capsules.length > 0;

  return (
    <div className={styles.layout}>
      <div className={styles.selector}>
        <CapsuleGate
          capsules={capsules}
          defaultCapsuleId={defaultCapsuleId}
          forceSelector
          autoActivate={false}
          onCapsuleChosen={setSelectedCapsule}
        />
      </div>
      <aside className={styles.sidebar} aria-live="polite">
        <h2 className={styles.sidebarTitle}>Choose your stream destination</h2>
        <p className={styles.sidebarText}>
          AI Stream Studio needs to know which Capsule to publish overlays, chat automations, and
          recordings to. Pick the space you want to prep before we layer on controls, scenes, and
          simulcast settings.
        </p>

        {hasCapsules ? (
          selectedCapsule ? (
            <div className={styles.selectionCard}>
              <span className={styles.selectionHeading}>Selected Capsule</span>
              <h3 className={styles.selectionName}>{selectedCapsule.name}</h3>
              <div className={styles.selectionMeta}>
                <div className={styles.metaRow}>
                  <span className={styles.metaLabel}>Role</span>
                  <span className={styles.metaValue}>{resolveRoleLabel(selectedCapsule)}</span>
                </div>
                {selectedCapsule.slug ? (
                  <div className={styles.metaRow}>
                    <span className={styles.metaLabel}>Slug</span>
                    <span className={styles.metaValue}>{selectedCapsule.slug}</span>
                  </div>
                ) : null}
              </div>
              <Button variant="gradient" size="sm" className={styles.ctaButton} disabled>
                Studio setup coming soon
              </Button>
            </div>
          ) : (
            <div className={styles.emptyState}>
              Pick a Capsule from the list to preview stream controls, AI production automations, and
              OBS integrations.
            </div>
          )
        ) : (
          <div className={styles.emptyState}>
            You don&apos;t have any Capsules yet. Create one to start configuring AI Stream Studio.
          </div>
        )}
      </aside>
    </div>
  );
}
