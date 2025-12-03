"use client";
import * as React from "react";
import { CapsuleGate } from "@/components/capsule/CapsuleGate";
import type { CapsuleSummary } from "@/server/capsules/service";

import styles from "./LadderBuilder.module.css";
import { LadderWizardController } from "./LadderWizardController";

export type LadderBuilderProps = {
  capsules: CapsuleSummary[];
  initialCapsuleId?: string | null;
  previewMode?: boolean;
};

export function LadderBuilder({ capsules, initialCapsuleId = null, previewMode = false }: LadderBuilderProps) {
  const [capsuleList, setCapsuleList] = React.useState<CapsuleSummary[]>(capsules);
  const [selectedCapsule, setSelectedCapsule] = React.useState<CapsuleSummary | null>(() => {
    if (!initialCapsuleId) return null;
    return capsules.find((capsule) => capsule.id === initialCapsuleId) ?? null;
  });

  React.useEffect(() => {
    setCapsuleList(capsules);
  }, [capsules]);

  React.useEffect(() => {
    if (!selectedCapsule) return;
    const exists = capsules.some((capsule) => capsule.id === selectedCapsule.id);
    if (!exists) {
      setSelectedCapsule(null);
    }
  }, [capsules, selectedCapsule]);

  const handleCapsuleChange = React.useCallback((capsule: CapsuleSummary | null) => {
    setSelectedCapsule(capsule);
  }, []);

  if (!selectedCapsule) {
    return (
      <div className={styles.gateWrap}>
        <CapsuleGate
          capsules={capsuleList}
          defaultCapsuleId={initialCapsuleId ?? null}
          forceSelector
          autoActivate={false}
          selectorTitle="Pick a capsule for your ladder"
          selectorSubtitle="We'll use this capsule's community profile when drafting copy and formats."
          onCapsuleChosen={handleCapsuleChange}
        />
      </div>
    );
  }

  return (
    <LadderWizardController
      capsule={selectedCapsule}
      capsuleList={capsuleList}
      previewMode={previewMode}
      onCapsuleChange={handleCapsuleChange}
    />
  );
}
