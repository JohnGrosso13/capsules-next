"use client";

import * as React from "react";

import { CapsuleGate } from "@/components/capsule/CapsuleGate";
import type { CapsuleSummary } from "@/server/capsules/service";

type AiStreamCapsuleGateProps = {
  capsules: CapsuleSummary[];
  selectedCapsule?: CapsuleSummary | null;
  onSelectionChange?: (capsule: CapsuleSummary | null) => void;
  selectorTitle?: React.ReactNode;
  selectorSubtitle?: React.ReactNode;
  showMemberships?: boolean;
  showFollowers?: boolean;
};

export function AiStreamCapsuleGate({
  capsules,
  selectedCapsule,
  onSelectionChange,
  selectorTitle = "Pick a space for streaming",
  selectorSubtitle = null,
  showMemberships = true,
  showFollowers = true,
}: AiStreamCapsuleGateProps) {
  const isControlled = typeof selectedCapsule !== "undefined";
  const [internalSelection, setInternalSelection] = React.useState<CapsuleSummary | null>(null);

  const resolvedSelection = isControlled ? selectedCapsule ?? null : internalSelection;

  React.useEffect(() => {
    if (isControlled) return;
    setInternalSelection(null);
  }, [capsules, isControlled]);

  const handleSelectionChange = React.useCallback(
    (capsule: CapsuleSummary | null) => {
      onSelectionChange?.(capsule);
      if (!isControlled) {
        setInternalSelection(capsule);
      }
    },
    [isControlled, onSelectionChange],
  );

  return (
    <CapsuleGate
      capsules={capsules}
      defaultCapsuleId={resolvedSelection?.id ?? null}
      forceSelector
      autoActivate={false}
      onCapsuleChosen={handleSelectionChange}
      selectorTitle={selectorTitle}
      selectorSubtitle={selectorSubtitle}
      showMemberships={showMemberships}
      showFollowers={showFollowers}
    />
  );
}
