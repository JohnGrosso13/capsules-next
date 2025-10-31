"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { useCapsuleHistory } from "@/hooks/useCapsuleHistory";
import CapsuleHistoryPromptSettings from "@/components/capsule/CapsuleHistoryPromptSettings";

import styles from "./capsules-section.module.css";

type CapsuleAiSettingsPanelProps = {
  capsuleId: string;
  capsuleName: string | null;
  onClose: () => void;
};

export function CapsuleAiSettingsPanel({
  capsuleId,
  capsuleName,
  onClose,
}: CapsuleAiSettingsPanelProps) {
  const { snapshot, loading, error, refresh } = useCapsuleHistory(capsuleId);

  const heading = capsuleName?.trim().length ? capsuleName : "This capsule";

  return (
    <div className={styles.aiPanel}>
      <div className={styles.aiPanelHeader}>
        <div>
          <h4 className={styles.aiPanelTitle}>{heading} · AI Summary Settings</h4>
          <p className={styles.aiPanelSubtitle}>
            Tune tone, guidelines, and reusable templates for Capsule summaries.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
      <div className={styles.aiPanelBody}>
        {loading && !snapshot ? (
          <div className={styles.aiPanelStatus}>Loading prompt memory...</div>
        ) : null}
        {error ? (
          <div className={styles.aiPanelError}>
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={() => refresh(true)}>
              Retry
            </Button>
          </div>
        ) : null}
        {snapshot ? (
          <CapsuleHistoryPromptSettings
            capsuleId={capsuleId}
            promptMemory={snapshot.promptMemory}
            templates={snapshot.templates}
            onRefresh={refresh}
          />
        ) : null}
      </div>
    </div>
  );
}

export default CapsuleAiSettingsPanel;
