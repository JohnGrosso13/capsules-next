import * as React from "react";
import { CaretLeft } from "@phosphor-icons/react/dist/ssr";

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
  showPreview?: boolean;
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
  controlsStart: _controlsStart,
  controlsEnd: _controlsEnd,
  previewPanel,
  showPreview = false,
}: WizardLayoutProps<StepId>) {
  const [showMobilePreview, setShowMobilePreview] = React.useState(false);
  const [showMobileStepper, setShowMobileStepper] = React.useState(false);
  const [stepperCollapsed, setStepperCollapsed] = React.useState(false);
  const activeStep = React.useMemo(
    () => steps.find((step) => step.id === activeStepId),
    [activeStepId, steps],
  );
  const renderStepList = (onSelect?: (stepId: StepId) => void) => (
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
              onClick={() => {
                onStepSelect?.(step.id);
                onSelect?.(step.id);
              }}
              className={styles.stepItem}
              data-state={state}
              aria-current={isActive ? "step" : undefined}
              aria-label={`Step ${index + 1}: ${step.title}${statusLabel}`}
              disabled={!onStepSelect}
            >
              <span className={styles.stepBullet} data-state={state} aria-hidden />
              <span className={styles.stepCopy}>
                <span className={styles.stepTitle}>{step.title}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const isTight = window.innerWidth < 1600;
    if (isTight) {
      setStepperCollapsed(true);
    }
  }, []);

  const gridClassNames = [styles.pageGrid];
  if (!stepperCollapsed) {
    gridClassNames.push(styles.gridNoPreview);
  }
  if (stepperCollapsed) {
    gridClassNames.push(styles.gridSoloForm);
  }

  return (
    <>
      <div className={styles.mobileBar} aria-label="Mobile ladder builder actions">
        <button
          type="button"
          className={styles.mobileAction}
          onClick={() => setShowMobileStepper(true)}
          aria-label="Open guided progress menu"
        >
          <span className={styles.mobileActionTitle}>Guided progress</span>
          <span className={styles.mobileActionHint}>{activeStep?.title ?? "Choose a step"}</span>
        </button>
        <button
          type="button"
          className={styles.mobileAction}
          onClick={() => setShowMobilePreview(true)}
          aria-label="Open ladder preview"
        >
          <span className={styles.mobileActionTitle}>Preview</span>
          <span className={styles.mobileActionHint}>Open the ladder summary</span>
        </button>
      </div>
      <div className={gridClassNames.join(" ")}>
        {!stepperCollapsed ? (
          <aside className={styles.stepperCol}>
            <div className={styles.stepperShell}>
              <div className={styles.stepperHeading}>
                <span className={styles.stepperLabel}>{stepperLabel}</span>
                 <button
                   type="button"
                   className={styles.stepperCollapse}
                   onClick={() => setStepperCollapsed(true)}
                   aria-label="Collapse guided steps"
                 >
                  <CaretLeft size={16} weight="bold" aria-hidden="true" />
                 </button>
              </div>
              {renderStepList()}
            </div>
          </aside>
        ) : null}
        <div className={styles.formCol}>
          {toastStack}
          {showPreview ? (
            <div className={`${styles.formShell} ${styles.builderFlipIn}`} aria-label="Ladder preview">
              <div className={styles.previewShell}>{previewPanel}</div>
            </div>
          ) : (
            <div className={`${styles.formShell} ${styles.builderFlipIn}`}>
              <div
                ref={formContentRef}
                className={[styles.stepStack, stepStackClassName].filter(Boolean).join(" ")}
                aria-live="polite"
                role="region"
                tabIndex={-1}
              >
                {formContent}
              </div>
            </div>
          )}
        </div>
      </div>
      {showMobileStepper ? (
        <div className={styles.mobileSheet} role="dialog" aria-modal="true" aria-label="Guided progress menu">
          <div className={styles.mobileSheetBackdrop} onClick={() => setShowMobileStepper(false)} />
          <div className={styles.mobileSheetBody}>
            <div className={styles.mobileSheetHeader}>
              <span className={styles.mobileSheetTitle}>Guided progress</span>
              <button
                type="button"
                className={styles.mobileSheetClose}
                onClick={() => setShowMobileStepper(false)}
                aria-label="Close guided progress menu"
              >
                Close
              </button>
            </div>
            <div className={styles.mobileSheetContent}>{renderStepList(() => setShowMobileStepper(false))}</div>
          </div>
        </div>
      ) : null}
      {showMobilePreview ? (
        <div className={styles.mobileSheet} role="dialog" aria-modal="true" aria-label="Ladder preview panel">
          <div className={styles.mobileSheetBackdrop} onClick={() => setShowMobilePreview(false)} />
          <div className={styles.mobileSheetBody}>
            <div className={styles.mobileSheetHeader}>
              <span className={styles.mobileSheetTitle}>Ladder preview</span>
              <button
                type="button"
                className={styles.mobileSheetClose}
                onClick={() => setShowMobilePreview(false)}
                aria-label="Back to ladder builder"
              >
                Back to builder
              </button>
            </div>
            <div
              className={[styles.mobileSheetContent, styles.mobilePreviewContent].filter(Boolean).join(" ")}
              role="region"
              aria-label="Ladder preview content"
            >
              {previewPanel}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
