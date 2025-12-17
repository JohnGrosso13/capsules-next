import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AssistantPrompter } from "@/components/create/ladders/components/AssistantPrompter";
import type { AssistantMessage } from "@/components/create/ladders/assistantTypes";
import styles from "@/components/create/ladders/LadderBuilder.module.css";
import { useAttachmentUpload } from "@/hooks/useAttachmentUpload";

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
  onToggleSize: (value: string) => void;
  onAskAiDraft: () => void;
  aiDraftBusy: boolean;
  onGenerateImage: () => void;
  imageBusy: boolean;
  onOpenMemoryPicker: () => void;
  onPlacementPrompt: (text: string) => Promise<{ message: string; warnings?: string[] } | null>;
  placementBusy: boolean;
  placementSummary: string;
  placementWarnings?: string[];
};

export function ProductStepContent({
  activeStep,
  form,
  template,
  capsuleName: _capsuleName,
  statusMessage,
  errorMessage,
  stepControls,
  onFieldChange,
  onToggleSize: _onToggleSize,
  onAskAiDraft,
  aiDraftBusy,
  onGenerateImage,
  imageBusy,
  onOpenMemoryPicker,
  onPlacementPrompt,
  placementBusy,
  placementSummary,
  placementWarnings,
}: ProductStepContentProps) {
  const [assistantDraft, setAssistantDraft] = React.useState("");
  const [assistantConversation, setAssistantConversation] = React.useState<AssistantMessage[]>(() => [
    {
      id: "ai-title-welcome",
      sender: "ai",
      text: "Tell me the vibe, game, who it's for, and what's at stake. I can help with a title, one-line summary, rules, or rewards-whatever you need.",
      timestamp: Date.now(),
    },
  ]);
  const [summaryAssistantDraft, setSummaryAssistantDraft] = React.useState("");
  const [summaryAssistantConversation, setSummaryAssistantConversation] = React.useState<AssistantMessage[]>(() => [
    {
      id: "ai-summary-welcome",
      sender: "ai",
      text: "Tell me the vibe, game, who it's for, and what's at stake. I can help with a title, one-line summary, rules, or rewards-whatever you need.",
      timestamp: Date.now(),
    },
  ]);
  const [pricingAssistantDraft, setPricingAssistantDraft] = React.useState("");
  const [pricingAssistantConversation, setPricingAssistantConversation] = React.useState<AssistantMessage[]>(() => [
    {
      id: "ai-pricing-welcome",
      sender: "ai",
      text: "What's your target price and margin? I can help you choose something fair for buyers that still hits your goals.",
      timestamp: Date.now(),
    },
  ]);
  const [designAssistantDraft, setDesignAssistantDraft] = React.useState("");
  const [designAssistantConversation, setDesignAssistantConversation] = React.useState<AssistantMessage[]>(() => [
    {
      id: "ai-design-welcome",
      sender: "ai",
      text: "Tell me where to place the art (front, back, sleeves), how big it should feel, and any bleed/centering tweaks. I'll move the mockup and Printful preview to match.",
      timestamp: Date.now(),
    },
  ]);

  const handleAssistantSend = React.useCallback(() => {
    const trimmed = assistantDraft.trim();
    if (!trimmed.length) return;
    const now = Date.now();
    const userMessage: AssistantMessage = { id: `user-${now}`, sender: "user", text: trimmed, timestamp: now };
    const aiFollowUp: AssistantMessage = {
      id: `ai-${Date.now()}`,
      sender: "ai",
      text: "Got it. I'll use that context to refine your title ideas.",
      timestamp: Date.now(),
    };
    setAssistantConversation((prev) => [...prev, userMessage, aiFollowUp]);
    setAssistantDraft("");
  }, [assistantDraft]);

  const handleSummaryAssistantSend = React.useCallback(() => {
    const trimmed = summaryAssistantDraft.trim();
    if (!trimmed.length) return;
    const now = Date.now();
    const userMessage: AssistantMessage = { id: `user-summary-${now}`, sender: "user", text: trimmed, timestamp: now };
    const aiFollowUp: AssistantMessage = {
      id: `ai-summary-${Date.now()}`,
      sender: "ai",
      text: "Understood. I'll use this to improve your product description and summary.",
      timestamp: Date.now(),
    };
    setSummaryAssistantConversation((prev) => [...prev, userMessage, aiFollowUp]);
    setSummaryAssistantDraft("");
  }, [summaryAssistantDraft]);

  const handleDesignAssistantSend = React.useCallback(async () => {
    const trimmed = designAssistantDraft.trim();
    if (!trimmed.length || placementBusy) return;
    const now = Date.now();
    const userMessage: AssistantMessage = { id: `user-design-${now}`, sender: "user", text: trimmed, timestamp: now };
    setDesignAssistantConversation((prev) => [...prev, userMessage]);
    setDesignAssistantDraft("");
    onFieldChange("designPrompt", trimmed);
    try {
      const result = await onPlacementPrompt(trimmed);
      const aiText =
        result?.message ??
        "Updated your placement. Let me know if you want it moved or resized.";
      const warningNote =
        result?.warnings && result.warnings.length
          ? ` Notes: ${result.warnings.join(" ")}`
          : "";
      const aiFollowUp: AssistantMessage = {
        id: `ai-design-${Date.now()}`,
        sender: "ai",
        text: `${aiText}${warningNote}`,
        timestamp: Date.now(),
      };
      setDesignAssistantConversation((prev) => [...prev, aiFollowUp]);
    } catch (error) {
      const aiFollowUp: AssistantMessage = {
        id: `ai-design-${Date.now()}`,
        sender: "ai",
        text:
          error instanceof Error
            ? error.message
            : "I couldn't adjust the placement. Try again in a moment.",
        timestamp: Date.now(),
      };
      setDesignAssistantConversation((prev) => [...prev, aiFollowUp]);
    }
  }, [designAssistantDraft, onFieldChange, onPlacementPrompt, placementBusy]);

  const handlePricingAssistantSend = React.useCallback(() => {
    const trimmed = pricingAssistantDraft.trim();
    if (!trimmed.length) return;
    const now = Date.now();
    const userMessage: AssistantMessage = { id: `user-pricing-${now}`, sender: "user", text: trimmed, timestamp: now };
    let aiText = "Got it. I'll keep that in mind as you set your price.";
    const match = trimmed.match(/(\d+(\.\d+)?)/);
    const amountText = match?.[1];
    if (amountText) {
      const parsed = Number.parseFloat(amountText);
      if (Number.isFinite(parsed)) {
        aiText = `Setting your price near ${parsed.toFixed(2)}. Adjust as needed.`;
        onFieldChange("price", parsed);
      }
    }
    const aiFollowUp: AssistantMessage = {
      id: `ai-pricing-${Date.now()}`,
      sender: "ai",
      text: aiText,
      timestamp: Date.now(),
    };
    setPricingAssistantConversation((prev) => [...prev, userMessage, aiFollowUp]);
    setPricingAssistantDraft("");
  }, [onFieldChange, pricingAssistantDraft]);

  const handleAssistantKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleAssistantSend();
      }
    },
    [handleAssistantSend],
  );

  const handleSummaryAssistantKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSummaryAssistantSend();
      }
    },
    [handleSummaryAssistantSend],
  );

  const handleDesignAssistantKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void handleDesignAssistantSend();
      }
    },
    [handleDesignAssistantSend],
  );

  const handlePricingAssistantKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handlePricingAssistantSend();
      }
    },
    [handlePricingAssistantSend],
  );

  const {
    fileInputRef: designFileInputRef,
    attachment: designAttachment,
    readyAttachment: designReadyAttachment,
    uploading: designAttachmentUploading,
    handleAttachClick: handleDesignUploadClick,
    handleAttachmentSelect: handleDesignAttachmentSelect,
  } = useAttachmentUpload();

  React.useEffect(() => {
    if (!designReadyAttachment?.url) return;
    onFieldChange("designUrl", designReadyAttachment.url);
  }, [designReadyAttachment, onFieldChange]);

  const designUploadStatus = React.useMemo(() => {
    if (designAttachmentUploading && designAttachment) {
      const percent =
        typeof designAttachment.progress === "number" && Number.isFinite(designAttachment.progress)
          ? Math.min(100, Math.max(0, Math.round(designAttachment.progress * 100)))
          : null;
      if (designAttachment.phase === "finalizing") return "Finalizing upload...";
      return percent && percent > 0 ? `Uploading... ${percent}%` : "Uploading image...";
    }
    if (designAttachment?.status === "error") {
      return designAttachment.error || "Upload failed. Try another file.";
    }
    if (designReadyAttachment?.name || designReadyAttachment?.url || form.designUrl?.trim()) {
      return "Image linked. Tell Capsule where to place it, then preview.";
    }
    return "Upload an image or pick a memory. Capsule will use it in your product preview.";
  }, [designAttachment, designAttachmentUploading, designReadyAttachment, form.designUrl]);

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
      <Card className={styles.namingPanel} variant="ghost">
        <CardHeader className={`${styles.namingHeader} ${styles.titleHeaderCenter}`}>
          <CardTitle className={`${styles.namingTitle} ${styles.namingTitleCenter}`}>Describe your product</CardTitle>
        </CardHeader>
        <CardContent className={styles.namingBody}>
          <div className={styles.assetActions}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleDesignUploadClick}
              loading={designAttachmentUploading}
              title="Upload a new PNG or JPEG from your device"
              data-primary-action="true"
            >
              Upload image
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onOpenMemoryPicker}>
              Use a memory
            </Button>
            <input
              ref={designFileInputRef}
              type="file"
              accept="image/*"
              onChange={handleDesignAttachmentSelect}
              style={{ display: "none" }}
            />
            <span className={styles.assetHint} aria-live="polite">
              {designUploadStatus}
            </span>
          </div>
          <div className={styles.namingOr}>
            <span>or chat with Capsule AI</span>
          </div>
          <AssistantPrompter
            placeholder="Example: Limited-run hoodie collab with embroidered logo, heavy weight, unisex fit..."
            conversation={designAssistantConversation}
            draft={designAssistantDraft}
            busy={placementBusy || imageBusy}
            onDraftChange={setDesignAssistantDraft}
            onKeyDown={handleDesignAssistantKeyDown}
            onSend={async () => {
              await handleDesignAssistantSend();
              if (!form.designUrl?.trim()) {
                onGenerateImage();
              }
            }}
          />
          <div className={styles.assetHint} aria-live="polite">
            <strong>Placement plan:</strong> {placementSummary}
            {placementWarnings?.length ? ` (${placementWarnings.join(" ")})` : ""}
          </div>
        </CardContent>
      </Card>
      {stepControls}
    </div>
  );

  const titleStep = (
    <div className={styles.cardContent}>
      <Card className={styles.namingPanel} variant="ghost">
        <CardHeader className={`${styles.namingHeader} ${styles.titleHeaderCenter}`}>
          <CardTitle className={`${styles.namingTitle} ${styles.namingTitleCenter}`}>Title</CardTitle>
        </CardHeader>
        <CardContent className={styles.namingBody}>
          <textarea
            className={styles.namingTextArea}
            placeholder="Give your product a title..."
            value={form.title}
            onChange={(event) => onFieldChange("title", event.target.value)}
            rows={2}
          />
          <div className={styles.namingOr}>
            <span>or chat with Capsule AI</span>
          </div>
          <AssistantPrompter
            placeholder="Ask for title ideas or anything you need help with..."
            conversation={assistantConversation}
            draft={assistantDraft}
            busy={false}
            onDraftChange={setAssistantDraft}
            onKeyDown={handleAssistantKeyDown}
            onSend={handleAssistantSend}
          />
        </CardContent>
      </Card>
      {stepControls}
    </div>
  );

  const detailsStep = (
    <div className={styles.cardContent}>
      <Card className={styles.namingPanel} variant="ghost">
        <CardHeader className={`${styles.namingHeader} ${styles.titleHeaderCenter}`}>
          <CardTitle className={`${styles.namingTitle} ${styles.namingTitleCenter}`}>Description</CardTitle>
        </CardHeader>
        <CardContent className={styles.namingBody}>
          <textarea
            className={styles.namingTextArea}
            placeholder="Write a description that sells the story, fit, and who it’s for..."
            value={form.summary}
            onChange={(event) => onFieldChange("summary", event.target.value)}
            rows={3}
          />
          <div className={styles.namingOr}>
            <span>or chat with Capsule AI</span>
          </div>
          <AssistantPrompter
            placeholder="Who is this for? What’s the vibe? Any shoutouts or causes to mention?"
            conversation={summaryAssistantConversation}
            draft={summaryAssistantDraft}
            busy={aiDraftBusy}
            onDraftChange={setSummaryAssistantDraft}
            onKeyDown={handleSummaryAssistantKeyDown}
            onSend={() => {
              handleSummaryAssistantSend();
              onAskAiDraft();
            }}
          />
        </CardContent>
      </Card>
      {stepControls}
    </div>
  );

  const pricingStep = (
    <div className={styles.cardContent}>
      <Card className={styles.namingPanel} variant="ghost">
        <CardHeader className={`${styles.namingHeader} ${styles.titleHeaderCenter}`}>
          <CardTitle className={`${styles.namingTitle} ${styles.namingTitleCenter}`}>Pricing</CardTitle>
        </CardHeader>
        <CardContent className={styles.namingBody}>
          <div className={styles.pricingInputShell}>
            <span className={styles.pricingCurrency}>USD</span>
            <input
              className={styles.pricingInput}
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              value={Number.isFinite(form.price) ? form.price.toFixed(2) : ""}
              onChange={(event) => onFieldChange("price", Number.parseFloat(event.target.value))}
            />
          </div>
          <div className={styles.namingOr}>
            <span>or chat with Capsule AI</span>
          </div>
          <AssistantPrompter
            placeholder="Share your target margin or competitor pricing and I'll suggest a price..."
            conversation={pricingAssistantConversation}
            draft={pricingAssistantDraft}
            busy={false}
            onDraftChange={setPricingAssistantDraft}
            onKeyDown={handlePricingAssistantKeyDown}
            onSend={handlePricingAssistantSend}
          />
        </CardContent>
      </Card>
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

  const body = (() => {
    switch (activeStep) {
      case "design":
        return designStep;
      case "title":
        return titleStep;
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
