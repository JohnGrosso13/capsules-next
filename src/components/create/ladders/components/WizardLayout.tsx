import * as React from "react";

import styles from "../LadderBuilder.module.css";

export type WizardLayoutStep<StepId extends string> = {
  id: StepId;
  title: string;
  subtitle: string;
};

export type WizardLayoutProps<StepId extends string> = {
  stepperLabel: string;
  steps: WizardLayoutStep<StepId>[];
  activeStepId: StepId;
  completionMap: Partial<Record<StepId, boolean>>;
  onStepSelect?: (stepId: StepId) => void;
  toastStack?: React.ReactNode;
  formContent: React.ReactNode;
  formContentRef?: React.RefObject<HTMLDivElement | null>;
  stepStackClassName?: string | undefined;
  controlsStart?: React.ReactNode;
  controlsEnd?: React.ReactNode;
  previewPanel: React.ReactNode;
};

export function WizardLayout<StepId extends string>({
  stepperLabel,
  steps,
  activeStepId,
  completionMap,
  onStepSelect,
  toastStack,
  formContentRef,
  stepStackClassName = "",
  formContent,
  controlsStart,
  controlsEnd,
  previewPanel,
}: WizardLayoutProps<StepId>) {
  return (
    <div className={styles.pageGrid}>
      <aside className={styles.stepperCol}>
        <div className={styles.stepperShell}>
          <div className={styles.stepperHeading}>
            <span className={styles.stepperLabel}>{stepperLabel}</span>
          </div>
          <ol className={styles.stepList} role="list">
            {steps.map((step, index) => {
              const isActive = step.id === activeStepId;
              const isComplete = Boolean(completionMap[step.id]);
              const state = isActive ? "active" : isComplete ? "complete" : "idle";
              const statusLabel = isActive ? " (current)" : isComplete ? " (completed)" : "";
              return (
                <li key={step.id}>
                  <button
                    type="button"
                    onClick={() => onStepSelect?.(step.id)}
                    className={styles.stepItem}
                    data-state={state}
                    aria-current={isActive ? "step" : undefined}
                    aria-label={`Step ${index + 1}: ${step.title}${statusLabel}`}
                    disabled={!onStepSelect}
                  >
                    <span className={styles.stepBullet} data-state={state} aria-hidden />
                    <span className={styles.stepCopy}>
                      <span className={styles.stepTitle}>{step.title}</span>
                      <span className={styles.stepSubtitle}>{step.subtitle}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </aside>
      <div className={styles.formCol}>
        {toastStack}
        <div
          ref={formContentRef}
          className={[styles.stepStack, stepStackClassName].filter(Boolean).join(" ")}
          aria-live="polite"
          role="region"
          tabIndex={-1}
        >
          {formContent}
        </div>
        <div className={styles.stepControls} aria-label="Step controls">
          <div className={styles.stepControlsStart}>{controlsStart}</div>
          {controlsEnd}
        </div>
      </div>
      <aside className={styles.previewCol}>
        <div className={styles.previewShell}>{previewPanel}</div>
      </aside>
    </div>
  );
}
