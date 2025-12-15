import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import styles from "@/components/create/ladders/LadderBuilder.module.css";

import type { ProductFormState, ProductStepId } from "./types";
import type { ProductTemplate } from "./templates";

type ProductStepContentProps = {
  activeStep: ProductStepId;
  form: ProductFormState;
  template: ProductTemplate;
  capsuleName: string;
  statusMessage: string | null;
  errorMessage: string | null;
  stepControls: React.ReactNode;
  onFieldChange: <K extends keyof ProductFormState>(field: K, value: ProductFormState[K]) => void;
  onToggleColor: (value: string) => void;
  onToggleSize: (value: string) => void;
  onAskAiDraft: () => void;
  aiDraftBusy: boolean;
  onGenerateImage: () => void;
  imageBusy: boolean;
  onOpenMemoryPicker: () => void;
};

function renderChips(options: string[], selected: string[], onToggle: (value: string) => void) {
  return (
    <div className={styles.pillGroup}>
      {options.map((value) => {
        const isActive = selected.includes(value);
        return (
          <button
            key={value}
            type="button"
            className={styles.pillButton}
            data-state={isActive ? "active" : undefined}
            onClick={() => onToggle(value)}
            aria-pressed={isActive}
          >
            {value}
          </button>
        );
      })}
    </div>
  );
}

export function ProductStepContent({
  activeStep,
  form,
  template,
  capsuleName,
  statusMessage,
  errorMessage,
  stepControls,
  onFieldChange,
  onToggleColor,
  onToggleSize,
  onAskAiDraft,
  aiDraftBusy,
  onGenerateImage,
  imageBusy,
  onOpenMemoryPicker,
}: ProductStepContentProps) {
  const renderStatus = () => {
    if (statusMessage) {
      return (
        <Alert tone="success" className={styles.toastCard}>
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>{statusMessage}</AlertDescription>
        </Alert>
      );
    }
    if (errorMessage) {
      return (
        <Alert tone="danger" className={styles.toastCard}>
          <AlertTitle>Unable to save</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      );
    }
    return null;
  };

  const designStep = (
    <div className={styles.cardContent}>
      <div className={styles.stepHero}>
        <span className={styles.stepHeroLabel}>Design surface</span>
        <h2 className={styles.stepHeroTitle}>{template.label}</h2>
        <p className={styles.stepHeroSubtitle}>
          Upload or link your art, pick colors/sizes, and set the rough placement. Capsule will keep this aligned with Printful.
        </p>
      </div>
      <div className={styles.sectionGrid}>
        <div className={styles.sectionCard}>
          <div className={styles.sectionLabel}>
            <span className={styles.label}>Design image URL</span>
            <span className={styles.fieldHint}>Paste a hosted image URL (Memory asset or CDN). This is what we send to Printful.</span>
          </div>
          <input
            type="url"
            className={styles.memberNameInput}
            placeholder="https://..."
            value={form.designUrl}
            onChange={(event) => onFieldChange("designUrl", event.target.value)}
          />
          <div className={styles.guidedActionBar} style={{ marginTop: 8 }}>
            <button
              type="button"
              className={styles.pillButton}
              onClick={onOpenMemoryPicker}
            >
              Browse memories
            </button>
            <span className={styles.guidedHint}>Pick an existing upload or capsule asset.</span>
          </div>
          <div className={styles.guidedActionBar} style={{ marginTop: 10 }}>
            <button
              type="button"
              className={styles.pillButton}
              onClick={onGenerateImage}
              disabled={imageBusy}
            >
              {imageBusy ? "Generating art with Capsule AI..." : "Generate art with Capsule AI"}
            </button>
            <span className={styles.guidedHint}>Use your prompt below to create a print-ready graphic.</span>
          </div>
          <label className={styles.label} htmlFor="design-notes">
            Design notes (optional)
          </label>
          <textarea
            id="design-notes"
            className={styles.textarea}
            placeholder="Tell Capsule AI what to tweak or how to place the art."
            value={form.designPrompt}
            onChange={(event) => onFieldChange("designPrompt", event.target.value)}
          />
        </div>
        <div className={styles.sectionCard}>
          <div className={styles.sectionLabel}>
            <span className={styles.label}>Colors</span>
            <span className={styles.fieldHint}>Turn on the colorways you want to sell.</span>
          </div>
          {template.colors?.length ? renderChips(form.availableColors, form.selectedColors, onToggleColor) : <p className={styles.fieldHint}>This product has a single color.</p>}
          <div className={styles.sectionLabel} style={{ marginTop: 12 }}>
            <span className={styles.label}>Sizes</span>
            <span className={styles.fieldHint}>Toggle the sizes you’ll publish.</span>
          </div>
          {template.sizes?.length ? renderChips(form.availableSizes, form.selectedSizes, onToggleSize) : <p className={styles.fieldHint}>One-size product.</p>}
        </div>
        <div className={styles.sectionCard}>
          <div className={styles.sectionLabel}>
            <span className={styles.label}>Placement quick tweaks</span>
            <span className={styles.fieldHint}>Dial in how large the graphic should sit in the print area.</span>
          </div>
          <label className={styles.label} htmlFor="placement-scale">
            Scale
          </label>
          <input
            id="placement-scale"
            type="range"
            min="0.4"
            max="1.2"
            step="0.02"
            value={form.mockScale}
            onChange={(event) => onFieldChange("mockScale", Number(event.target.value))}
          />
          <div className={styles.fieldRow}>
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="placement-x">
                Offset X
              </label>
              <input
                id="placement-x"
                type="number"
                className={styles.memberNumberInput}
                value={form.mockOffsetX}
                onChange={(event) => onFieldChange("mockOffsetX", Number(event.target.value))}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="placement-y">
                Offset Y
              </label>
              <input
                id="placement-y"
                type="number"
                className={styles.memberNumberInput}
                value={form.mockOffsetY}
                onChange={(event) => onFieldChange("mockOffsetY", Number(event.target.value))}
              />
            </div>
          </div>
          <p className={styles.fieldHint}>
            Capsule will normalize these values to the Printful print area when you publish.
          </p>
        </div>
      </div>
      {stepControls}
    </div>
  );

  const detailsStep = (
    <div className={styles.cardContent}>
      <div className={styles.stepHero}>
        <span className={styles.stepHeroLabel}>Storefront copy</span>
        <h2 className={styles.stepHeroTitle}>Tell shoppers what this is</h2>
        <p className={styles.stepHeroSubtitle}>
          Capsule AI can punch this up later, but start with a clear title and a short summary for your {template.label.toLowerCase()}.
        </p>
      </div>
      <div className={styles.sectionGrid}>
        <div className={styles.sectionCard}>
          <label className={styles.label} htmlFor="product-title">
            Title
          </label>
          <input
            id="product-title"
            className={styles.memberNameInput}
            placeholder={`${template.label} for ${capsuleName}`}
            value={form.title}
            onChange={(event) => onFieldChange("title", event.target.value)}
          />
          <label className={styles.label} htmlFor="product-summary" style={{ marginTop: 12 }}>
            Summary
          </label>
          <textarea
            id="product-summary"
            className={styles.textarea}
            placeholder="What makes this design special? Fit, fabric, story, or who it supports."
            value={form.summary}
            onChange={(event) => onFieldChange("summary", event.target.value)}
          />
          <div className={styles.guidedActionBar} style={{ marginTop: 8 }}>
            <button
              type="button"
              className={styles.pillButton}
              onClick={onAskAiDraft}
              disabled={aiDraftBusy}
            >
              {aiDraftBusy ? "Capsule AI drafting..." : "Ask Capsule AI to draft copy"}
            </button>
            <span className={styles.guidedHint}>Capsule can propose a title and summary from your design notes.</span>
          </div>
        </div>
        <div className={styles.sectionCard}>
          <div className={styles.sectionLabel}>
            <span className={styles.label}>Template</span>
            <span className={styles.fieldHint}>Base: {template.base ?? "Printful base product"}</span>
          </div>
          <p className={styles.fieldHint}>
            Colors: {form.availableColors.length ? form.availableColors.join(", ") : "Single color"}
          </p>
          <p className={styles.fieldHint}>
            Sizes: {form.availableSizes.length ? form.availableSizes.join(", ") : "One size"}
          </p>
          <p className={styles.fieldHint}>
            Capsule: {capsuleName}
          </p>
        </div>
      </div>
      {stepControls}
    </div>
  );

  const pricingStep = (
    <div className={styles.cardContent}>
      <div className={styles.stepHero}>
        <span className={styles.stepHeroLabel}>Pricing</span>
        <h2 className={styles.stepHeroTitle}>Set your margin</h2>
        <p className={styles.stepHeroSubtitle}>
          One price for all variants. You can refine per-variant pricing later in the store dashboard.
        </p>
      </div>
      <div className={styles.sectionGrid}>
        <div className={styles.sectionCard}>
          <label className={styles.label} htmlFor="product-price">
            Price
          </label>
          <input
            id="product-price"
            type="number"
            min="0"
            step="0.5"
            className={styles.memberNumberInput}
            value={form.price}
            onChange={(event) => onFieldChange("price", Number(event.target.value))}
          />
          <label className={styles.label} htmlFor="product-currency" style={{ marginTop: 12 }}>
            Currency
          </label>
          <select
            id="product-currency"
            className={styles.select}
            value={form.currency}
            onChange={(event) => onFieldChange("currency", event.target.value)}
          >
            <option value="usd">USD</option>
          </select>
        </div>
        <div className={styles.sectionCard}>
          <div className={styles.fieldGroup}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={form.publish}
                onChange={(event) => onFieldChange("publish", event.target.checked)}
              />
              Publish immediately
            </label>
            <span className={styles.fieldHint}>Keep off to save as draft in your store.</span>
          </div>
          <div className={styles.fieldGroup} style={{ marginTop: 12 }}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(event) => onFieldChange("featured", event.target.checked)}
              />
              Feature on storefront
            </label>
            <span className={styles.fieldHint}>Show this near the top of your Capsule store.</span>
          </div>
        </div>
      </div>
      {stepControls}
    </div>
  );

  const reviewStep = (
    <div className={styles.cardContent}>
      <div className={styles.stepHero}>
        <span className={styles.stepHeroLabel}>Review</span>
        <h2 className={styles.stepHeroTitle}>Ready to publish?</h2>
        <p className={styles.stepHeroSubtitle}>
          Double-check the design URL, colors/sizes, and pricing. Capsule will sync these variants to your Printful-backed store.
        </p>
      </div>
      <div className={styles.sectionGrid}>
        <div className={styles.sectionCard}>
          <strong>{form.title.trim() || template.label}</strong>
          <p className={styles.fieldHint}>{form.summary.trim() || "No summary yet."}</p>
          <p className={styles.fieldHint}>Price: {form.currency.toUpperCase()} {form.price.toFixed(2)}</p>
          <p className={styles.fieldHint}>Colors: {form.selectedColors.length ? form.selectedColors.join(", ") : "Default"}</p>
          <p className={styles.fieldHint}>Sizes: {form.selectedSizes.length ? form.selectedSizes.join(", ") : "Default"}</p>
          <p className={styles.fieldHint}>Publish: {form.publish ? "On" : "Draft"}</p>
          <p className={styles.fieldHint}>Featured: {form.featured ? "Yes" : "No"}</p>
          <p className={styles.fieldHint}>Design image: {form.designUrl ? "Linked" : "Missing"}</p>
        </div>
      </div>
      {stepControls}
    </div>
  );

  const body = (() => {
    switch (activeStep) {
      case "design":
        return designStep;
      case "details":
        return detailsStep;
      case "pricing":
        return pricingStep;
      case "review":
        return reviewStep;
      default:
        return designStep;
    }
  })();

  return (
    <>
      {renderStatus()}
      {body}
    </>
  );
}
