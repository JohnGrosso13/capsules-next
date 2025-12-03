import * as React from "react";

import { Button } from "@/components/ui/button";

import { WizardLayout, type WizardLayoutStep } from "../ladders/components/WizardLayout";
import styles from "../ladders/LadderBuilder.module.css";
import type { TournamentStepId } from "./types";

type TournamentWizardViewProps = {
  steps: WizardLayoutStep<TournamentStepId>[];
  activeStep: TournamentStepId;
  completionMap: Record<TournamentStepId, boolean>;
  onStepSelect: (id: TournamentStepId) => void;
  previousStepId: TournamentStepId | null;
  onBack: () => void;
  onNextStep: () => void;
  nextStepTitle: string | null;
  formContent: React.ReactNode;
  formContentRef: React.RefObject<HTMLDivElement | null>;
  previewPanel: React.ReactNode;
  previewMode?: boolean;
  isSaving: boolean;
  publish: boolean;
  onCreateTournament: () => void;
  onCapsuleChange: () => void;
  canSwitchCapsule: boolean;
  onReset: () => void;
};

const TournamentWizardView = React.memo(function TournamentWizardView({
  steps,
  activeStep,
  completionMap,
  onStepSelect,
  previousStepId,
  onBack,
  onNextStep,
  nextStepTitle,
  formContent,
  formContentRef,
  previewPanel,
  previewMode = false,
  isSaving,
  publish,
  onCreateTournament,
  onCapsuleChange,
  canSwitchCapsule,
  onReset,
}: TournamentWizardViewProps) {
  const [showOptions, setShowOptions] = React.useState(false);
  const [showPreviewOverlay, setShowPreviewOverlay] = React.useState(false);

  const controlsStart = (
    <>
      <Button type="button" variant="ghost" onClick={onBack} disabled={!previousStepId}>
        Back
      </Button>
      <Button
        type="button"
        variant="ghost"
        onClick={() => setShowOptions((prev) => !prev)}
        aria-expanded={showOptions}
      >
        Options
      </Button>
      {showOptions ? (
        <div className={styles.moreMenu} role="menu">
          {canSwitchCapsule ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onCapsuleChange();
                setShowOptions(false);
              }}
            >
              Switch capsule
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onReset();
              setShowOptions(false);
            }}
          >
            Reset tournament
          </button>
        </div>
      ) : null}
    </>
  );

  const controlsEnd =
    activeStep !== "review" ? (
      <>
        <Button
          type="button"
          variant="secondary"
          className={styles.previewButton}
          onClick={() => setShowPreviewOverlay(true)}
        >
          Preview
        </Button>
        <Button
          type="button"
          variant="secondary"
          className={styles.stepperNextButton}
          onClick={onNextStep}
          disabled={!nextStepTitle}
        >
          {nextStepTitle ? `Next: ${nextStepTitle}` : "Next"}
        </Button>
      </>
    ) : (
      <Button type="button" onClick={onCreateTournament} disabled={isSaving}>
        {isSaving ? "Saving tournament..." : publish ? "Publish tournament" : "Save tournament draft"}
      </Button>
    );

  return (
    <>
      <WizardLayout
        stepperLabel="Setup"
        steps={steps}
        activeStepId={activeStep}
        completionMap={completionMap}
        onStepSelect={onStepSelect}
        formContentRef={formContentRef}
        formContent={formContent}
        controlsStart={controlsStart}
        controlsEnd={controlsEnd}
        previewPanel={previewPanel}
        showPreview={previewMode}
      />
      {showPreviewOverlay ? (
        <div className={styles.mobileSheet} role="dialog" aria-modal="true" aria-label="Tournament preview">
          <div className={styles.mobileSheetBackdrop} onClick={() => setShowPreviewOverlay(false)} />
          <div className={`${styles.mobileSheetBody} ${styles.desktopPreviewSheet}`}>
            <div className={styles.mobileSheetHeader}>
              <span className={styles.mobileSheetTitle}>Tournament preview</span>
              <button
                type="button"
                className={styles.mobileSheetClose}
                onClick={() => setShowPreviewOverlay(false)}
                aria-label="Close tournament preview"
              >
                Close
              </button>
            </div>
            <div className={[styles.mobileSheetContent, styles.mobilePreviewContent].filter(Boolean).join(" ")}>
              {previewPanel}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
});

export default TournamentWizardView;
