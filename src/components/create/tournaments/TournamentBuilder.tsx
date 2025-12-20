"use client";

import * as React from "react";

import { CapsuleGate } from "@/components/capsule/CapsuleGate";
import { ChatStartOverlay } from "@/components/chat/ChatStartOverlay";
import type { CapsuleSummary } from "@/server/capsules/service";

import styles from "../ladders/LadderBuilder.module.css";
import TournamentWizardView from "./TournamentWizardView";
import { TournamentPreview } from "./components/TournamentPreview";
import { TournamentStatus } from "./components/TournamentStatus";
import { TournamentStepContent } from "./components/TournamentSteps";
import { TOURNAMENT_STEPS } from "./constants";
import { useTournamentWizard } from "./hooks/useTournamentWizard";
import type { TournamentStepId } from "./types";

export type TournamentBuilderProps = {
  capsules: CapsuleSummary[];
  initialCapsuleId?: string | null;
};

export function TournamentBuilder({ capsules, initialCapsuleId = null }: TournamentBuilderProps) {
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
    if (!exists) setSelectedCapsule(null);
  }, [capsules, selectedCapsule]);

  const handleCapsuleChange = React.useCallback((capsule: CapsuleSummary | null) => {
    setSelectedCapsule(capsule);
  }, []);

  const wizard = useTournamentWizard({ selectedCapsule });
  const { resetFormState } = wizard;

  React.useEffect(() => {
    resetFormState();
  }, [resetFormState, selectedCapsule]);

  const renderFormContent = (stepControls: React.ReactNode) => (
    <>
      <TournamentStatus error={wizard.errorMessage} status={wizard.statusMessage} />
      <TournamentStepContent
        activeStep={wizard.activeStep}
        form={wizard.form}
        participants={wizard.participants}
        generating={wizard.generating}
        capsuleName={wizard.previewModel.capsuleName}
        sectionsReady={wizard.previewModel.sections.length}
        aiPlan={wizard.aiPlan}
        onFormChange={wizard.handleFormChange}
        onGenerateDraft={wizard.handleGenerateDraft}
        onParticipantChange={wizard.handleParticipantChange}
        onParticipantSuggestion={wizard.handleParticipantSuggestion}
        onAddParticipant={wizard.addParticipant}
        onRemoveParticipant={wizard.removeParticipant}
        onInviteClick={() => wizard.setShowInvite(true)}
        stepControls={stepControls}
      />
    </>
  );

  const previewPanel = <TournamentPreview model={wizard.previewModel} />;

  if (!selectedCapsule) {
    return (
      <div className={styles.gateWrap}>
        <CapsuleGate
          capsules={capsuleList}
          defaultCapsuleId={initialCapsuleId ?? null}
          forceSelector
          autoActivate={false}
          selectorTitle="Pick a capsule for your tournament"
          selectorSubtitle="Your assistant will reference this community when crafting your bracket plan."
          onCapsuleChosen={handleCapsuleChange}
        />
      </div>
    );
  }

  const stepIndex = TOURNAMENT_STEPS.findIndex((step) => step.id === wizard.activeStep);
  const nextStepId =
    stepIndex >= 0 && stepIndex < TOURNAMENT_STEPS.length - 1
      ? (TOURNAMENT_STEPS[stepIndex + 1]?.id as TournamentStepId | undefined)
      : null;
  const nextStep = wizard.nextStep ?? (nextStepId ? TOURNAMENT_STEPS.find((step) => step.id === nextStepId) ?? null : null);

  return (
    <>
      <div className={styles.builderWrap}>
        <div className={styles.wizardPanel}>
          <div className={styles.panelGlow} aria-hidden />
          <TournamentWizardView
            steps={TOURNAMENT_STEPS}
            activeStep={wizard.activeStep}
            completionMap={wizard.completionMap}
            onStepSelect={wizard.handleStepSelect}
            previousStepId={wizard.previousStepId}
            onBack={wizard.handlePreviousStep}
            onNextStep={wizard.handleNextStep}
            nextStepTitle={nextStep ? nextStep.title : null}
            renderFormContent={renderFormContent}
            formContentRef={wizard.formContentRef}
            previewPanel={previewPanel}
            previewMode={false}
            isSaving={wizard.isSaving}
            publish={wizard.form.publish}
            onCreateTournament={wizard.createTournament}
            onCapsuleChange={() => handleCapsuleChange(null)}
            canSwitchCapsule={Boolean(selectedCapsule)}
            onReset={wizard.resetFormState}
          />
        </div>
      </div>
      <ChatStartOverlay
        open={wizard.showInvite}
        friends={wizard.friends ?? []}
        busy={false}
        onClose={() => wizard.setShowInvite(false)}
        onSubmit={wizard.handleInvite}
        mode="tournament"
      />
    </>
  );
}
