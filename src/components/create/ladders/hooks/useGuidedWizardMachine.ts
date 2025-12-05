import * as React from "react";

import type { GuidedStepId } from "../guidedConfig";
import type { LadderWizardStepId } from "../ladderWizardConfig";
import type { WizardLifecycleMetrics } from "../lifecycle";

type GuidedWizardMachineOptions = {
  initialStep: GuidedStepId;
  stepOrder: GuidedStepId[];
  stepMap: Partial<Record<GuidedStepId, LadderWizardStepId>>;
  lifecycleRef: React.MutableRefObject<WizardLifecycleMetrics>;
  validateStep: (stepId: LadderWizardStepId, context: "advance" | "jump") => boolean;
};

type GuidedWizardMachineState = {
  guidedStep: GuidedStepId;
  guidedVisited: Record<GuidedStepId, boolean>;
  selectStep: (stepId: GuidedStepId, reason?: "advance" | "jump", options?: { force?: boolean }) => boolean;
  reset: (stepId?: GuidedStepId) => void;
};

export function useGuidedWizardMachine({
  initialStep,
  stepOrder,
  stepMap,
  lifecycleRef,
  validateStep,
}: GuidedWizardMachineOptions): GuidedWizardMachineState {
  const [guidedStep, setGuidedStep] = React.useState<GuidedStepId>(initialStep);
  const [guidedVisited, setGuidedVisited] = React.useState<Record<GuidedStepId, boolean>>(() =>
    stepOrder.reduce((acc, id) => {
      acc[id] = id === initialStep;
      return acc;
    }, {} as Record<GuidedStepId, boolean>),
  );

  const registerVisit = React.useCallback(
    (stepId: GuidedStepId) => {
      const wizardStep = stepMap[stepId];
      if (!wizardStep) return;
      const lifecycle = lifecycleRef.current;
      const nextVisits = {
        ...lifecycle.stepVisits,
        [wizardStep]: (lifecycle.stepVisits[wizardStep] ?? 0) + 1,
      };
      const nextStepStartedAt = { ...lifecycle.stepStartedAt, [wizardStep]: Date.now() };
      // eslint-disable-next-line react-compiler/react-compiler
      lifecycleRef.current = {
        ...lifecycle,
        currentStepId: wizardStep,
        stepVisits: nextVisits,
        stepStartedAt: nextStepStartedAt,
      };
    },
    [lifecycleRef, stepMap],
  );

  React.useEffect(() => {
    registerVisit(initialStep);
  }, [initialStep, registerVisit]);

  const selectStep = React.useCallback(
    (stepId: GuidedStepId, reason: "advance" | "jump" = "jump", options?: { force?: boolean }) => {
      const nextIndex = stepOrder.indexOf(stepId);
      const currentIndex = stepOrder.indexOf(guidedStep);
      if (nextIndex === -1) return false;
      const isForward = nextIndex > currentIndex;
      if (isForward && !options?.force) {
        const guardStep = stepMap[guidedStep];
        if (guardStep && !validateStep(guardStep, reason)) {
          return false;
        }
      }
      setGuidedStep(stepId);
      setGuidedVisited((prev) => (prev[stepId] ? prev : { ...prev, [stepId]: true }));
      registerVisit(stepId);
      return true;
    },
    [guidedStep, registerVisit, stepMap, stepOrder, validateStep],
  );

  const reset = React.useCallback(
    (stepId: GuidedStepId = initialStep) => {
      setGuidedStep(stepId);
      setGuidedVisited(() =>
        stepOrder.reduce((acc, id) => {
          acc[id] = id === stepId;
          return acc;
        }, {} as Record<GuidedStepId, boolean>),
      );
      registerVisit(stepId);
    },
    [initialStep, registerVisit, stepOrder],
  );

  return { guidedStep, guidedVisited, selectStep, reset };
}
