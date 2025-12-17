"use client";

import * as React from "react";

import type { CapsuleSummary } from "@/server/capsules/service";
import { ComposerMemoryPicker } from "@/components/composer/components/ComposerMemoryPicker";
import styles from "@/components/create/ladders/LadderBuilder.module.css";

import { ProductPreview } from "./ProductPreview";
import ProductWizardView from "./ProductWizardView";
import { PRODUCT_STEPS } from "./constants";
import { useProductWizard } from "./hooks/useProductWizard";
import { ProductStepContent } from "./ProductSteps";
import type { ProductTemplate } from "./templates";
import type { ProductStepId } from "./types";

type ProductBuilderProps = {
  capsule: CapsuleSummary;
  template: ProductTemplate;
};

function clampScale(value: number) {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0.4), 1.4) : 1;
}

function clampOffset(value: number) {
  return Number.isFinite(value) ? Math.min(Math.max(value, -1), 1) : 0;
}

export function ProductBuilder({ capsule, template }: ProductBuilderProps) {
  const wizard = useProductWizard({
    capsuleId: capsule.id,
    capsuleName: capsule.name ?? "Capsule store",
    template,
  });

  const stepIndex = PRODUCT_STEPS.findIndex((step) => step.id === wizard.activeStep);
  const nextStepId =
    stepIndex >= 0 && stepIndex < PRODUCT_STEPS.length - 1
      ? (PRODUCT_STEPS[stepIndex + 1]?.id as ProductStepId | undefined)
      : null;
  const nextStep = wizard.nextStep ?? (nextStepId ? PRODUCT_STEPS.find((step) => step.id === nextStepId) ?? null : null);
  const handlePlacementChange = React.useCallback(
    (value: { scale?: number; offsetX?: number; offsetY?: number }) => {
      const change: { scale?: number; offsetX?: number; offsetY?: number } = {};
      if (typeof value.scale === "number") change.scale = clampScale(value.scale);
      if (typeof value.offsetX === "number") change.offsetX = clampOffset(value.offsetX);
      if (typeof value.offsetY === "number") change.offsetY = clampOffset(value.offsetY);
      wizard.adjustPlacementPlan(change);
    },
    [wizard],
  );

  const renderFormContent = (stepControls: React.ReactNode) => (
    <>
      <ProductStepContent
        activeStep={wizard.activeStep}
        form={wizard.form}
        template={template}
        capsuleName={capsule.name ?? "Capsule store"}
        statusMessage={wizard.statusMessage}
        errorMessage={wizard.errorMessage}
        stepControls={stepControls}
        onFieldChange={wizard.updateFormField}
        onToggleSize={(value) => wizard.toggleSelection("selectedSizes", value)}
        onAskAiDraft={wizard.requestAiDraft}
        aiDraftBusy={wizard.aiDraftBusy}
        onGenerateImage={wizard.generateDesignImage}
        imageBusy={wizard.imageBusy}
        onOpenMemoryPicker={wizard.memory.openPicker}
        onPlacementPrompt={wizard.interpretPlacementPrompt}
        placementBusy={wizard.placementBusy}
        placementSummary={wizard.previewModel.placement.summary.text}
        placementWarnings={wizard.previewModel.placement.summary.warnings}
      />
    </>
  );

  const previewPanel = (
    <ProductPreview
      model={wizard.previewModel}
      template={template}
      variant="panel"
      onPlacementChange={handlePlacementChange}
    />
  );
  const previewOverlayPanel = (
    <ProductPreview
      model={wizard.previewModel}
      template={template}
      variant="overlay"
      onPlacementChange={handlePlacementChange}
    />
  );

  return (
    <div className={styles.builderWrap}>
      <div className={styles.wizardPanel}>
        <div className={styles.panelGlow} aria-hidden />
        <ProductWizardView
          steps={PRODUCT_STEPS}
          activeStep={wizard.activeStep}
          completionMap={wizard.completionMap}
          onStepSelect={wizard.handleStepSelect}
          previousStepId={wizard.previousStepId ?? null}
          onBack={wizard.handlePreviousStep}
          onNextStep={wizard.handleNextStep}
          nextStepTitle={nextStep ? nextStep.title : null}
          renderFormContent={renderFormContent}
          formContentRef={wizard.formContentRef}
          previewPanel={previewPanel}
          previewOverlayPanel={previewOverlayPanel}
          previewMode={false}
          isSaving={wizard.isSaving}
          publish={wizard.form.publish}
          onSaveProduct={wizard.createProduct}
          onReset={wizard.resetFormState}
        />
      </div>
      <ComposerMemoryPicker
        open={wizard.memory.open}
        activeTab={wizard.memory.tab}
        onTabChange={wizard.memory.setTab}
        uploads={wizard.memory.uploads}
        uploadsLoading={wizard.memory.uploadsLoading}
        uploadsError={wizard.memory.uploadsError}
        uploadsHasMore={wizard.memory.uploadsHasMore}
        onLoadMoreUploads={wizard.memory.loadMoreUploads}
        assets={wizard.memory.assets}
        assetsLoading={wizard.memory.assetsLoading}
        assetsError={wizard.memory.assetsError}
        assetsHasMore={wizard.memory.assetsHasMore}
        onLoadMoreAssets={wizard.memory.loadMoreAssets}
        searchEnabled
        searchPageSize={24}
        onSearch={wizard.memory.searchMemories}
        onSelect={wizard.memory.onSelect}
        onClose={wizard.memory.closePicker}
      />
    </div>
  );
}
