import * as React from "react";

import type { CapsuleSummary } from "@/server/capsules/service";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CapsuleEventsSection } from "@/components/capsule/CapsuleEventsSection";

import { AiPlanCard } from "./components/AiPlanCard";
import { GuidedStepContent } from "./components/GuidedStepContent";
import { ReviewOverviewCard } from "./components/ReviewOverviewCard";
import { WizardLayout } from "./components/WizardLayout";
import type { GuidedStepId } from "./guidedConfig";
import { GUIDED_STEP_DEFINITIONS, GUIDED_STEP_MAP, GUIDED_STEP_ORDER } from "./guidedConfig";
import type { LadderBuilderFormState } from "./builderState";
import type { LadderPreviewSnapshot } from "./LadderBuilder";
import type {
  LadderGameFormValues,
  LadderMemberFormValues,
  LadderRegistrationFormValues,
  LadderScheduleFormValues,
  LadderScoringFormValues,
  LadderSectionFormValues,
  SectionKey,
} from "./ladderFormState";
import type { AssistantMessage } from "./assistantTypes";
import styles from "./LadderBuilder.module.css";

type WizardPreviewModel = ReturnType<typeof import("./ladderWizardConfig").buildWizardPreviewModel>;
import type { LadderToast } from "./hooks/useToastNotifications";

type LadderWizardViewProps = {
  guidedStep: GuidedStepId;
  guidedCompletion: Record<GuidedStepId, boolean>;
  guidedSummaryIdeas: ReturnType<typeof import("./guidedConfig").buildGuidedSummaryIdeas>;
  onStepSelect: (stepId: GuidedStepId) => void;
  formContentRef: React.RefObject<HTMLDivElement | null>;
  selectedCapsuleId: string | null;
  selectedCapsuleName: string | null;
  form: LadderBuilderFormState;
  members: LadderMemberFormValues[];
  previewModel: WizardPreviewModel;
  previewSnapshot: LadderPreviewSnapshot;
  aiPlan: { reasoning?: string | null; prompt?: string | null; suggestions?: Array<{ id: string; title: string; summary: string; section?: string | null }> } | null;
  toasts: LadderToast[];
  onDismissToast: (id: string) => void;
  assistantConversation: AssistantMessage[];
  assistantDraft: string;
  assistantBusy: boolean;
  onAssistantDraftChange: (value: string) => void;
  onAssistantKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onAssistantSend: () => void;
  onFormField: (field: "name" | "summary" | "visibility" | "publish", value: string | boolean) => void;
  onRegistrationChange: (field: keyof LadderRegistrationFormValues, value: string) => void;
  onGameChange: (field: keyof LadderGameFormValues, value: string) => void;
  onScoringChange: (field: keyof LadderScoringFormValues, value: string) => void;
  onScheduleChange: (field: keyof LadderScheduleFormValues, value: string) => void;
  onSectionChange: (key: SectionKey, field: keyof LadderSectionFormValues, value: string) => void;
  onMemberField: (index: number, field: keyof LadderMemberFormValues, value: string) => void;
  onAddMember: () => void;
  onAddMemberWithUser: (user: { id: string; name: string; avatarUrl?: string | null }) => void;
  onRemoveMember: (index: number) => void;
  onDiscardDraft: () => void;
  canDiscardDraft: boolean;
  onCreateLadder: () => void;
  onCapsuleChange: (capsule: CapsuleSummary | null) => void;
  previewMode?: boolean;
  isSaving: boolean;
  isOnline: boolean;
};

const LadderWizardView = React.memo(function LadderWizardView({
  guidedStep,
  guidedCompletion,
  guidedSummaryIdeas,
  onStepSelect,
  formContentRef,
  selectedCapsuleId,
  selectedCapsuleName,
  form,
  members,
  previewModel,
  previewSnapshot,
  aiPlan,
  toasts,
  onDismissToast,
  assistantConversation,
  assistantDraft,
  assistantBusy,
  onAssistantDraftChange,
  onAssistantKeyDown,
  onAssistantSend,
  onFormField,
  onRegistrationChange,
  onGameChange,
  onScoringChange,
  onScheduleChange,
  onSectionChange,
  onMemberField,
  onAddMember,
  onAddMemberWithUser,
  onRemoveMember,
  onDiscardDraft,
  canDiscardDraft,
  onCreateLadder,
  onCapsuleChange,
  previewMode = false,
  isSaving,
  isOnline,
}: LadderWizardViewProps) {
  const [showMoreActions, setShowMoreActions] = React.useState(false);
  const [showPreviewOverlay, setShowPreviewOverlay] = React.useState(false);

  const guidedStepIndex = React.useMemo(
    () => Math.max(0, GUIDED_STEP_ORDER.indexOf(guidedStep)),
    [guidedStep],
  );
  const guidedPreviousStepId = guidedStepIndex > 0 ? GUIDED_STEP_ORDER[guidedStepIndex - 1] : null;
  const guidedNextStepId =
    guidedStepIndex < GUIDED_STEP_ORDER.length - 1 ? GUIDED_STEP_ORDER[guidedStepIndex + 1] : null;
  const guidedNextStep = guidedNextStepId ? GUIDED_STEP_MAP.get(guidedNextStepId) ?? null : null;

  const renderToastStack = () =>
    toasts.length ? (
      <div className={styles.toastStack} role="region" aria-live="assertive">
        {toasts.map((toast) => (
          <Alert key={toast.id} tone={toast.tone} className={styles.toastCard}>
            <button
              type="button"
              className={styles.toastDismiss}
              onClick={() => onDismissToast(toast.id)}
              aria-label="Dismiss notification"
            >
              Close
            </button>
            <AlertTitle>{toast.title}</AlertTitle>
            {toast.description ? <AlertDescription>{toast.description}</AlertDescription> : null}
          </Alert>
        ))}
      </div>
    ) : null;

  const reviewOverview = (
    <ReviewOverviewCard
      capsuleName={selectedCapsuleName}
      visibility={form.visibility}
      publish={form.publish}
      membersCount={members.length}
      sectionsReady={previewModel.sections.length}
    />
  );

  const previewPanel = (
    <div className={styles.previewEmbed}>
      <CapsuleEventsSection
        capsuleId={previewSnapshot.summary.capsuleId}
        ladders={[previewSnapshot.summary]}
        tournaments={[]}
        loading={false}
        error={null}
        onRetry={() => undefined}
        previewOverrides={previewSnapshot}
      />
    </div>
  );

  return (
    <>
      <WizardLayout
        stepperLabel="Setup"
        steps={GUIDED_STEP_DEFINITIONS}
        activeStepId={guidedStep}
        completionMap={guidedCompletion}
        onStepSelect={onStepSelect}
        toastStack={renderToastStack()}
        formContentRef={formContentRef}
        stepStackClassName={styles.guidedStack}
        formContent={
          <GuidedStepContent
            step={guidedStep}
            capsuleId={selectedCapsuleId}
            form={form}
            members={members}
            guidedSummaryIdeas={guidedSummaryIdeas}
            assistantConversation={assistantConversation}
            assistantDraft={assistantDraft}
            assistantBusy={assistantBusy}
            onAssistantDraftChange={onAssistantDraftChange}
            onAssistantKeyDown={onAssistantKeyDown}
            onAssistantSend={onAssistantSend}
            onFormField={onFormField}
            onRegistrationChange={onRegistrationChange}
            onGameChange={onGameChange}
            onScoringChange={onScoringChange}
            onScheduleChange={onScheduleChange}
            onSectionChange={onSectionChange}
            onMemberField={onMemberField}
            onAddMember={onAddMember}
            onAddMemberWithUser={onAddMemberWithUser}
            onRemoveMember={onRemoveMember}
            reviewOverview={reviewOverview}
            reviewAiPlan={<AiPlanCard plan={aiPlan} />}
          />
        }
        controlsStart={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (!guidedPreviousStepId) return;
                onStepSelect(guidedPreviousStepId);
              }}
              disabled={!guidedPreviousStepId}
            >
              Back
            </Button>
            <div className={styles.moreActions}>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowMoreActions((prev) => !prev)}
                aria-expanded={showMoreActions}
              >
                Options
              </Button>
              {showMoreActions ? (
                <div className={styles.moreMenu} role="menu">
                  {canDiscardDraft ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={onDiscardDraft}
                      disabled={isSaving}
                    >
                      Discard draft
                    </button>
                  ) : null}
                  {selectedCapsuleId ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onCapsuleChange(null);
                        setShowMoreActions(false);
                      }}
                      disabled={isSaving}
                    >
                      Switch capsule
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </>
        }
        controlsEnd={
          guidedStep !== "review" ? (
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
                onClick={() => {
                  if (!guidedNextStepId) return;
                  onStepSelect(guidedNextStepId);
                }}
                disabled={!guidedNextStepId}
              >
                {guidedNextStep ? `Next: ${guidedNextStep.title}` : "Next"}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="secondary"
              className={styles.stepperNextButton}
              onClick={onCreateLadder}
              disabled={isSaving || !isOnline}
            >
              {isSaving ? "Saving ladder..." : form.publish ? "Publish ladder" : "Save ladder draft"}
            </Button>
          )
        }
        previewPanel={previewPanel}
        showPreview={previewMode}
      />
      {showPreviewOverlay ? (
        <div className={styles.mobileSheet} role="dialog" aria-modal="true" aria-label="Ladder preview">
          <div className={styles.mobileSheetBackdrop} onClick={() => setShowPreviewOverlay(false)} />
          <div className={`${styles.mobileSheetBody} ${styles.desktopPreviewSheet}`}>
            <div className={styles.mobileSheetHeader}>
              <span className={styles.mobileSheetTitle}>Ladder preview</span>
              <button
                type="button"
                className={styles.mobileSheetClose}
                onClick={() => setShowPreviewOverlay(false)}
                aria-label="Close ladder preview"
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

export default LadderWizardView;
