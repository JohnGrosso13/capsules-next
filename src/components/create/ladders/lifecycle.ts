import { LADDER_WIZARD_STEP_ORDER, type LadderWizardStepId } from "./ladderWizardConfig";

export type WizardLifecycleMetrics = {
  wizardStartedAt: number;
  stepVisits: Record<LadderWizardStepId, number>;
  stepStartedAt: Record<LadderWizardStepId, number>;
  completedSteps: Set<LadderWizardStepId>;
  currentStepId: LadderWizardStepId;
  firstChallengeAt: number | null;
  blueprintApplied: boolean;
  publishAttempts: number;
};

export const createWizardLifecycleState = (
  initialStep: LadderWizardStepId,
): WizardLifecycleMetrics => {
  const startedAt = Date.now();
  const visits = {} as Record<LadderWizardStepId, number>;
  const stepStartedAt = {} as Record<LadderWizardStepId, number>;
  LADDER_WIZARD_STEP_ORDER.forEach((id) => {
    visits[id] = 0;
    stepStartedAt[id] = startedAt;
  });
  return {
    wizardStartedAt: startedAt,
    stepVisits: visits,
    stepStartedAt,
    completedSteps: new Set<LadderWizardStepId>(),
    currentStepId: initialStep,
    firstChallengeAt: null,
    blueprintApplied: false,
    publishAttempts: 0,
  };
};

export const msSince = (start: number, end: number = Date.now()): number => {
  return Math.max(0, Math.round(end - start));
};
