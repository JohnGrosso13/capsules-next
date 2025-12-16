import * as React from "react";

import { Button } from "@/components/ui/button";
import { WizardLayout, type WizardLayoutStep } from "@/components/create/ladders/components/WizardLayout";
import styles from "@/components/create/ladders/LadderBuilder.module.css";

import type { ProductStepId } from "./types";

type ProductWizardViewProps = {
  steps: WizardLayoutStep<ProductStepId>[];
  activeStep: ProductStepId;
  completionMap: Record<ProductStepId, boolean>;
  onStepSelect: (id: ProductStepId) => void;
  previousStepId: ProductStepId | null;
  onBack: () => void;
  onNextStep: () => void;
  nextStepTitle: string | null;
  renderFormContent: (stepControls: React.ReactNode) => React.ReactNode;
  formContentRef: React.RefObject<HTMLDivElement | null>;
  previewPanel: React.ReactNode;
  previewOverlayPanel?: React.ReactNode;
  previewMode?: boolean;
  isSaving: boolean;
  publish: boolean;
  onSaveProduct: () => void;
  onReset: () => void;
};

const ProductWizardView = React.memo(function ProductWizardView({
  steps,
  activeStep,
  completionMap,
  onStepSelect,
  previousStepId,
  onBack,
  onNextStep,
  nextStepTitle,
  renderFormContent,
  formContentRef,
  previewPanel,
  previewOverlayPanel,
  previewMode = false,
  isSaving,
  publish,
  onSaveProduct,
  onReset,
}: ProductWizardViewProps) {
  const [showOptions, setShowOptions] = React.useState(false);
  const [showPreviewOverlay, setShowPreviewOverlay] = React.useState(false);
  const optionsRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!showOptions) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (optionsRef.current && optionsRef.current.contains(target)) return;
      setShowOptions(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowOptions(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown, true);
    window.addEventListener("touchstart", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown, true);
      window.removeEventListener("touchstart", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [showOptions]);

  const stepControls = (
    <div className={styles.stepControls} aria-label="Step controls">
      <div className={styles.stepControlsStart}>
        <Button type="button" variant="ghost" onClick={onBack} disabled={!previousStepId}>
          Back
        </Button>
        <div className={styles.moreActions} ref={optionsRef}>
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
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onReset();
                  setShowOptions(false);
                }}
              >
                Reset product
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div className={styles.stepControlsEnd}>
        {activeStep !== "review" ? (
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
          <Button type="button" onClick={onSaveProduct} disabled={isSaving}>
            {isSaving ? "Saving product..." : publish ? "Publish product" : "Save product draft"}
          </Button>
        )}
      </div>
    </div>
  );

  const formContent = renderFormContent(stepControls);
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
        previewPanel={previewPanel}
        showPreview={previewMode}
      />
      {showPreviewOverlay ? (
        <div className={styles.mobileSheet} role="dialog" aria-modal="true" aria-label="Product preview">
          <div className={styles.mobileSheetBackdrop} onClick={() => setShowPreviewOverlay(false)} />
          <div className={`${styles.mobileSheetBody} ${styles.desktopPreviewSheet}`}>
            <div className={styles.mobileSheetHeader}>
              <span className={styles.mobileSheetTitle}>Product preview</span>
              <button
                type="button"
                className={styles.mobileSheetClose}
                onClick={() => setShowPreviewOverlay(false)}
                aria-label="Close product preview"
              >
                Close
              </button>
            </div>
            <div className={[styles.mobileSheetContent, styles.mobilePreviewContent].filter(Boolean).join(" ")}>
              {previewOverlayPanel ?? previewPanel}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
});

export default ProductWizardView;
