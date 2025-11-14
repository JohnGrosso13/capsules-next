"use client";
import * as React from "react";
import type { ZodIssue } from "zod";
import { useRouter } from "next/navigation";
import { CapsuleGate } from "@/components/capsule/CapsuleGate";
import type { CapsuleSummary } from "@/server/capsules/service";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  type AlertTone,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { trackLadderEvent } from "@/lib/telemetry/ladders";
import { getIdentityAccent } from "@/lib/identity/teams";
import styles from "./LadderBuilder.module.css";
import {
  defaultMembersForm,
  defaultSeedForm,
  createEmptyMemberForm,
  type LadderMemberFormValues,
  type LadderWizardState,
  type SectionKey,
  type LadderSectionFormValues,
  type LadderGameFormValues,
  type LadderScoringFormValues,
  type LadderScheduleFormValues,
  type LadderRegistrationFormValues,
} from "./ladderFormState";
import {
  buildWizardPreviewModel,
  LADDER_WIZARD_STEP_ORDER,
  LADDER_WIZARD_STEPS,
  type LadderWizardStepId,
} from "./ladderWizardConfig";
import {
  GUIDED_STEP_DEFINITIONS,
  GUIDED_STEP_ORDER,
  GUIDED_STEP_MAP,
  DEFAULT_GUIDED_STEP,
  buildGuidedNameIdeas,
  buildGuidedSummaryIdeas,
  type GuidedStepId,
  type LadderTemplatePreset,
} from "./guidedConfig";
import {
  createInitialFormState,
  trimOrNull,
  normalizeMemberList,
  streakLabel,
  type LadderBuilderFormState,
} from "./builderState";
import {
  convertConfigToPayload,
  convertGameToPayload,
  convertMembersToPayload,
  convertSectionsToPayload,
} from "./builderPayload";
import type { AssistantMessage } from "./assistantTypes";
import { useLadderDraft, type PersistedLadderDraft } from "./hooks/useLadderDraft";
import { AiPlanCard } from "./components/AiPlanCard";
import { ReviewOverviewCard } from "./components/ReviewOverviewCard";
import { GuidedStepContent } from "./components/GuidedStepContent";
import { WizardLayout } from "./components/WizardLayout";
type AiPlanState = {
  reasoning?: string | null;
  prompt?: string | null;
  suggestions?: Array<{ id: string; title: string; summary: string; section?: string | null }>;
};
type LadderToast = {
  id: string;
  tone: AlertTone;
  title: string;
  description?: string;
  persist?: boolean;
};
type WizardLifecycleMetrics = {
  wizardStartedAt: number;
  stepVisits: Record<LadderWizardStepId, number>;
  stepStartedAt: Record<LadderWizardStepId, number>;
  completedSteps: Set<LadderWizardStepId>;
  currentStepId: LadderWizardStepId;
  firstChallengeAt: number | null;
  blueprintApplied: boolean;
  publishAttempts: number;
};

const createWizardLifecycleState = (initialStep: LadderWizardStepId): WizardLifecycleMetrics => {
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

const msSince = (start: number, end: number = Date.now()): number => {
  return Math.max(0, Math.round(end - start));
};

const summarizeIssues = (issues: ZodIssue[]): Array<{ path: string; message: string }> => {
  return issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
};

const DEFAULT_WIZARD_START_STEP = (LADDER_WIZARD_STEP_ORDER[0] ?? "basics") as LadderWizardStepId;

export type LadderBuilderProps = {
  capsules: CapsuleSummary[];
  initialCapsuleId?: string | null;
};
export function LadderBuilder({ capsules, initialCapsuleId = null }: LadderBuilderProps) {
  const router = useRouter();
  const [capsuleList, setCapsuleList] = React.useState<CapsuleSummary[]>(capsules);
  const [selectedCapsule, setSelectedCapsule] = React.useState<CapsuleSummary | null>(() => {
    if (!initialCapsuleId) return null;
    return capsules.find((capsule) => capsule.id === initialCapsuleId) ?? null;
  });
  const selectedCapsuleId = selectedCapsule?.id ?? null;
  const wizardLifecycleRef = React.useRef<WizardLifecycleMetrics>(createWizardLifecycleState(DEFAULT_WIZARD_START_STEP));
  const lastTrackedCapsuleRef = React.useRef<string | "__init" | null>("__init");
  React.useEffect(() => {
    setCapsuleList(capsules);
  }, [capsules]);
  React.useEffect(() => {
    if (!selectedCapsule) return;
    const exists = capsules.some((capsule) => capsule.id === selectedCapsule.id);
    if (!exists) {
      setSelectedCapsule(null);
    }
  }, [capsules, selectedCapsule]);
  const draftStorageKey = React.useMemo(() => {
    if (!selectedCapsule) return null;
    return `capsules:ladder-builder:${selectedCapsule.id}`;
  }, [selectedCapsule]);
  const [form, setForm] = React.useState<LadderBuilderFormState>(createInitialFormState);
  const [members, setMembers] = React.useState<LadderMemberFormValues[]>(() => defaultMembersForm());
  const [aiPlan, setAiPlan] = React.useState<AiPlanState | null>(null);
  const [meta, setMeta] = React.useState<Record<string, unknown>>({ variant: "ladder" });
  const metaVariant = typeof meta.variant === "string" ? (meta.variant as string) : "ladder";
  const helperDensityValue = (meta as Record<string, unknown>).helperDensity;
  const helperDensityVariant =
    typeof helperDensityValue === "string" && helperDensityValue.trim().length
      ? (helperDensityValue as string)
      : "standard";
  const guidedTemplateId =
    typeof (meta as Record<string, unknown>).guidedTemplate === "string"
      ? ((meta as Record<string, unknown>).guidedTemplate as string)
      : null;
  const [seed, setSeed] = React.useState(() => ({ ...defaultSeedForm }));
  const isOnline = useNetworkStatus();
  const [toasts, setToasts] = React.useState<LadderToast[]>([]);
  const toastTimers = React.useRef<Record<string, number>>({});
  const offlineToastId = React.useRef<string | null>(null);
  const hasAnnouncedNetwork = React.useRef(false);
  const [isSaving, setSaving] = React.useState(false);
  const [guidedStep, setGuidedStep] = React.useState<GuidedStepId>(DEFAULT_GUIDED_STEP);
  const [assistantDraft, setAssistantDraft] = React.useState("");
  const createAssistantMessage = React.useCallback((sender: AssistantMessage["sender"], text: string): AssistantMessage => {
    return {
      id: `${sender}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sender,
      text,
      timestamp: Date.now(),
    };
  }, []);
  const [assistantConversation, setAssistantConversation] = React.useState<AssistantMessage[]>(() => [
    {
      id: "ai-welcome",
      sender: "ai",
      text: "Let’s name this ladder. Tell me the vibe, game, or any theme and I’ll pitch a few title ideas. I can also help with your one‑line summary, rules, or rewards whenever you’re ready.",
      timestamp: Date.now(),
    },
  ]);
  const resetBuilderToDefaults = React.useCallback(() => {
    setForm(createInitialFormState());
    setMembers(defaultMembersForm());
    setAiPlan(null);
    setMeta({ variant: "ladder" });
    setSeed({ ...defaultSeedForm });
    setGuidedStep(DEFAULT_GUIDED_STEP);
    wizardLifecycleRef.current = createWizardLifecycleState(DEFAULT_WIZARD_START_STEP);
  }, []);
  const serializeDraft = React.useCallback(
    () => ({
      form,
      members,
      seed,
      meta,
      guidedStep,
    }),
    [form, guidedStep, members, meta, seed],
  );
  const hydrateDraft = React.useCallback(
    (draft: PersistedLadderDraft) => {
      if (draft.form && typeof draft.form === "object") {
        const nextForm = draft.form as Partial<LadderBuilderFormState>;
        setForm((prev) => ({
          ...prev,
          ...nextForm,
          sections: nextForm.sections ?? prev.sections,
          customSections: Array.isArray(nextForm.customSections) ? nextForm.customSections : prev.customSections,
          game: nextForm.game ?? prev.game,
          scoring: nextForm.scoring ?? prev.scoring,
          schedule: nextForm.schedule ?? prev.schedule,
          registration: nextForm.registration ?? prev.registration,
        }));
      }
      if (Array.isArray(draft.members)) {
        setMembers(normalizeMemberList(draft.members));
      }
      if (draft.seed && typeof draft.seed === "object") {
        setSeed({ ...defaultSeedForm, ...draft.seed });
      }
      if (draft.meta && typeof draft.meta === "object") {
        setMeta((prev) => ({ ...prev, ...draft.meta }));
      }
      if (
        draft.guidedStep &&
        typeof draft.guidedStep === "string" &&
        GUIDED_STEP_ORDER.includes(draft.guidedStep as GuidedStepId)
      ) {
        setGuidedStep(draft.guidedStep as GuidedStepId);
      }
    },
    [setForm, setMembers, setMeta, setGuidedStep, setSeed],
  );
  const dismissToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timerId = toastTimers.current[id];
    if (typeof timerId === "number") {
      window.clearTimeout(timerId);
      delete toastTimers.current[id];
    }
  }, []);
  const pushToast = React.useCallback(
    (toast: Omit<LadderToast, "id">) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev, { ...toast, id }]);
      if (!toast.persist) {
        const timeout = window.setTimeout(() => {
          setToasts((prev) => prev.filter((item) => item.id !== id));
          delete toastTimers.current[id];
        }, toast.tone === "danger" ? 6000 : 4200);
        toastTimers.current[id] = timeout;
      }
      return id;
    },
    [],
  );
  const handleDraftRestored = React.useCallback(
    (_timestamp: number) => {
      pushToast({
        tone: "info",
        title: "Draft restored",
        description: "We loaded your latest ladder edits so you can pick up where you left off.",
      });
    },
    [pushToast],
  );
  const handleAutosaveError = React.useCallback(
    (_error?: unknown) => {
      pushToast({
        tone: "danger",
        title: "Autosave failed",
        description: "We couldn't store the latest draft locally. Review your storage quota and try again.",
      });
    },
    [pushToast],
  );
  const { draftRestoredAt, canDiscardDraft, discardDraft } = useLadderDraft({
    storageKey: draftStorageKey,
    serializeDraft,
    hydrateDraft,
    resetToDefaults: resetBuilderToDefaults,
    capsuleId: selectedCapsuleId,
    onDraftRestored: handleDraftRestored,
    onAutosaveError: handleAutosaveError,
    tracker: trackLadderEvent,
  });
  React.useEffect(() => {
    const capsuleId = selectedCapsuleId;
    const lastTracked = lastTrackedCapsuleRef.current;
    if (lastTracked === capsuleId && lastTracked !== "__init") {
      return;
    }
    lastTrackedCapsuleRef.current = capsuleId;
    const lifecycle = createWizardLifecycleState(DEFAULT_WIZARD_START_STEP);
    lifecycle.currentStepId = DEFAULT_WIZARD_START_STEP;
    wizardLifecycleRef.current = lifecycle;
    const action = lastTracked === "__init" ? "initial" : "capsule_switch";
    trackLadderEvent({
      event: "ladders.wizard.view",
      capsuleId,
      payload: {
        action,
        variant: metaVariant,
        capsulesVisible: capsuleList.length,
        draftRestored: Boolean(draftRestoredAt),
        helperDensity: helperDensityVariant,
      },
    });
  }, [capsuleList.length, draftRestoredAt, helperDensityVariant, metaVariant, selectedCapsuleId]);
  const formContentRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    return () => {
      Object.values(toastTimers.current).forEach((timerId) => {
        if (typeof timerId === "number") {
          window.clearTimeout(timerId);
        }
      });
      toastTimers.current = {};
    };
  }, []);
  React.useEffect(() => {
    if (formContentRef.current) {
      formContentRef.current.focus();
    }
  }, [guidedStep]);
  React.useEffect(() => {
    if (!hasAnnouncedNetwork.current) {
      hasAnnouncedNetwork.current = true;
      if (!isOnline) {
        offlineToastId.current = pushToast({
          tone: "warning",
          title: "You're offline",
          description: "We'll keep your draft locally. Reconnect to publish or generate AI content.",
          persist: true,
        });
        trackLadderEvent({
          event: "ladders.error.surface",
          capsuleId: selectedCapsuleId,
          payload: { context: "network", reason: "offline_initial" },
        });
      }
      return;
    }
    if (isOnline) {
      if (offlineToastId.current) {
        dismissToast(offlineToastId.current);
        offlineToastId.current = null;
      }
    } else if (!offlineToastId.current) {
      offlineToastId.current = pushToast({
        tone: "warning",
        title: "You're offline",
        description: "We'll keep your draft locally. Reconnect to publish or generate AI content.",
        persist: true,
      });
      trackLadderEvent({
        event: "ladders.error.surface",
        capsuleId: selectedCapsuleId,
        payload: { context: "network", reason: "offline" },
      });
    }
  }, [dismissToast, isOnline, pushToast, selectedCapsuleId]);
  const wizardState = React.useMemo<LadderWizardState>(() => {
    return {
      basics: {
        name: form.name,
        summary: trimOrNull(form.summary),
        visibility: form.visibility,
        publish: form.publish,
      },
      seed,
      sections: {
        ...form.sections,
        custom: form.customSections,
      },
      format: {
        game: form.game,
        scoring: form.scoring,
        schedule: form.schedule,
        registration: form.registration,
      },
      roster: {
        members,
      },
      meta: {
        ...meta,
        variant: typeof meta.variant === "string" ? (meta.variant as string) : "ladder",
        status: form.publish ? "active" : "draft",
      },
    };
  }, [form, seed, members, meta]);
  const previewModel = React.useMemo(() => buildWizardPreviewModel(wizardState), [wizardState]);
  const stepDefinitionMap = React.useMemo(() => {
    const map = new Map<LadderWizardStepId, (typeof LADDER_WIZARD_STEPS)[number]>();
    LADDER_WIZARD_STEPS.forEach((step) => {
      map.set(step.id, step);
    });
    return map;
  }, []);
  const guidedStepIndex = React.useMemo(
    () => Math.max(0, GUIDED_STEP_ORDER.indexOf(guidedStep)),
    [guidedStep],
  );
  const guidedPreviousStepId = guidedStepIndex > 0 ? GUIDED_STEP_ORDER[guidedStepIndex - 1] : null;
  const guidedNextStepId =
    guidedStepIndex < GUIDED_STEP_ORDER.length - 1 ? GUIDED_STEP_ORDER[guidedStepIndex + 1] : null;
  const guidedCompletion = React.useMemo<Record<GuidedStepId, boolean>>(() => {
    const basicsComplete = {
      title: Boolean(form.name.trim().length),
      summary: Boolean(form.summary.trim().length),
      registration: Boolean(form.registration.type && form.registration.type.trim().length),
      type: Boolean(form.game.title.trim().length),
      format:
        Boolean(form.scoring.initialRating.trim().length) &&
        Boolean(form.scoring.kFactor.trim().length) &&
        Boolean(form.scoring.placementMatches.trim().length),
      overview: Boolean(form.sections.overview.body?.trim().length),
      rules: Boolean(form.sections.rules.body?.trim().length),
      shoutouts: Boolean(
        form.sections.shoutouts.body?.trim().length || form.sections.shoutouts.bulletsText?.trim().length,
      ),
      timeline: Boolean(
        (form.schedule.cadence ?? "").trim().length || (form.schedule.kickoff ?? "").trim().length,
      ),
      roster: members.some((member) => member.displayName.trim().length),
      rewards: Boolean(form.sections.results.body?.trim().length),
    };
    const reviewReady = Object.values(basicsComplete).every(Boolean);
    return {
      ...basicsComplete,
      review: reviewReady,
    };
  }, [
    form.game.title,
    form.name,
    form.registration.type,
    form.schedule.cadence,
    form.schedule.kickoff,
    form.scoring.initialRating,
    form.scoring.kFactor,
    form.scoring.placementMatches,
    form.sections.overview.body,
    form.sections.shoutouts.body,
    form.sections.shoutouts.bulletsText,
    form.sections.results.body,
    form.sections.rules.body,
    form.summary,
    members,
  ]);
  const guidedNextStep = guidedNextStepId ? GUIDED_STEP_MAP.get(guidedNextStepId) ?? null : null;
  const guidedNameIdeas = React.useMemo(
    () => buildGuidedNameIdeas(selectedCapsule?.name, form.game.title),
    [form.game.title, selectedCapsule?.name],
  );
  const guidedSummaryIdeas = React.useMemo(() => {
    const summaryOptions: {
      capsuleName?: string | null;
      gameTitle?: string;
      cadence?: string;
      rewardsFocus?: string;
    } = {
      capsuleName: selectedCapsule?.name ?? null,
      gameTitle: form.game.title,
    };
    if (form.schedule.cadence?.trim()) {
      summaryOptions.cadence = form.schedule.cadence;
    }
    if (form.sections.results.body?.trim()) {
      summaryOptions.rewardsFocus = form.sections.results.body;
    }
    return buildGuidedSummaryIdeas(summaryOptions);
  }, [form.game.title, form.schedule.cadence, form.sections.results.body, selectedCapsule?.name]);
  const validateStep = React.useCallback(
    (stepId: LadderWizardStepId, context: "advance" | "jump" | "publish"): boolean => {
      const definition = stepDefinitionMap.get(stepId);
      if (!definition) return true;
      const result = definition.validate(wizardState);
      if (result.success) {
        const lifecycle = wizardLifecycleRef.current;
        if (context !== "publish" && !lifecycle.completedSteps.has(stepId)) {
          lifecycle.completedSteps.add(stepId);
          const durationMs = msSince(lifecycle.stepStartedAt[stepId] ?? lifecycle.wizardStartedAt);
          trackLadderEvent({
            event: "ladders.step.complete",
            capsuleId: selectedCapsuleId,
            payload: {
              stepId,
              stepTitle: definition.title,
              durationMs,
              visit: lifecycle.stepVisits[stepId] ?? 1,
              context,
              elapsedMs: msSince(lifecycle.wizardStartedAt),
            },
          });
        }
        return true;
      }
      const issues = summarizeIssues(result.error.issues);
      trackLadderEvent({
        event: "ladders.validation.issue",
        capsuleId: selectedCapsuleId,
        payload: {
          stepId,
          stepTitle: definition.title,
          context,
          issueCount: issues.length,
          fields: issues.map((issue) => issue.path),
        },
      });
      const firstIssue = issues[0];
      pushToast({
        tone: "warning",
        title: `${definition.title} needs attention`,
        description: firstIssue ? firstIssue.message : "Resolve the highlighted inputs before continuing.",
      });
      return false;
    },
    [pushToast, selectedCapsuleId, stepDefinitionMap, wizardState],
  );
  const scrollToStepContent = React.useCallback(() => {
    if (typeof window === "undefined") return;
    const node = formContentRef.current;
    if (!node) return;
    const top = node.getBoundingClientRect().top + window.scrollY - 96;
    window.scrollTo({ top, behavior: "smooth" });
  }, []);
  const handleGuidedStepSelect = React.useCallback(
    (stepId: GuidedStepId) => {
      setGuidedStep(stepId);
      if (typeof window !== "undefined") {
        window.requestAnimationFrame(scrollToStepContent);
      }
    },
    [scrollToStepContent],
  );
  const handleCapsuleChange = React.useCallback((capsule: CapsuleSummary | null) => {
    setSelectedCapsule(capsule);
  }, []);
  const handleFormField = React.useCallback(
    (field: "name" | "summary" | "visibility" | "publish", value: string | boolean) => {
      setForm((prev) => ({
        ...prev,
        [field]: value,
      }));
    },
    [],
  );
  const recordFirstChallenge = React.useCallback(
    (source: "user" | "blueprint") => {
      const lifecycle = wizardLifecycleRef.current;
      if (lifecycle.firstChallengeAt !== null) return;
      const timestamp = Date.now();
      lifecycle.firstChallengeAt = timestamp;
      trackLadderEvent({
        event: "ladders.section.first_challenge",
        capsuleId: selectedCapsuleId,
        payload: {
          elapsedMs: msSince(lifecycle.wizardStartedAt),
          source,
        },
      });
    },
    [selectedCapsuleId],
  );
  const handleSectionChange = React.useCallback(
    (key: SectionKey, field: keyof LadderSectionFormValues, value: string) => {
      setForm((prev) => ({
        ...prev,
        sections: {
          ...prev.sections,
          [key]: {
            ...prev.sections[key],
            [field]: value,
          },
        },
      }));
      if (key === "upcoming" && typeof value === "string" && value.trim().length) {
        recordFirstChallenge("user");
      }
    },
    [recordFirstChallenge],
  );
  const handleGameChange = React.useCallback((field: keyof LadderGameFormValues, value: string) => {
    setForm((prev) => ({
      ...prev,
      game: {
        ...prev.game,
        [field]: value,
      },
    }));
  }, []);
  const handleScoringChange = React.useCallback((field: keyof LadderScoringFormValues, value: string) => {
    setForm((prev) => ({
      ...prev,
      scoring: {
        ...prev.scoring,
        [field]: value,
      },
    }));
  }, []);
  const handleScheduleChange = React.useCallback(
    (field: keyof LadderScheduleFormValues, value: string) => {
      setForm((prev) => ({
        ...prev,
        schedule: {
          ...prev.schedule,
          [field]: value,
        },
      }));
    },
    [],
  );
  const handleRegistrationChange = React.useCallback(
    (field: keyof LadderRegistrationFormValues, value: string) => {
      setForm((prev) => ({
        ...prev,
        registration: {
          ...prev.registration,
          [field]: value,
        },
      }));
    },
    [],
  );
  const applyTemplatePreset = React.useCallback(
    (preset: LadderTemplatePreset) => {
      handleGameChange("mode", preset.mode);
      handleScheduleChange("cadence", preset.cadence);
      handleScheduleChange("kickoff", preset.kickoff);
      if (!form.game.title.trim().length) {
        handleGameChange("title", preset.label);
      }
      if (!form.sections.overview.body?.trim().length) {
        handleSectionChange("overview", "body", preset.summary);
      }
      setMeta((prev) => ({ ...prev, guidedTemplate: preset.id }));
    },
    [form.game.title, form.sections.overview.body, handleGameChange, handleScheduleChange, handleSectionChange, setMeta],
  );
  const handleAppendRuleSnippet = React.useCallback(
    (snippet: string) => {
      const current = form.sections.rules.body ?? "";
      const next = current.trim().length ? `${current}\n• ${snippet}` : `• ${snippet}`;
      handleSectionChange("rules", "body", next);
    },
    [form.sections.rules.body, handleSectionChange],
  );
  const handleAppendRewardSnippet = React.useCallback(
    (snippet: string) => {
      const current = form.sections.results.body ?? "";
      const next = current.trim().length ? `${current}\n${snippet}` : snippet;
      handleSectionChange("results", "body", next);
    },
    [form.sections.results.body, handleSectionChange],
  );
  const handleAssistantSend = React.useCallback(() => {
    const message = assistantDraft.trim();
    if (!message.length) {
      pushToast({
        tone: "info",
        title: "Need a starting point?",
        description: "Share a vibe, theme, or rivalry and I’ll pitch title ideas.",
      });
      return;
    }
    setAssistantConversation((prev) => [...prev, createAssistantMessage("user", message)]);
    const suggestionPool = [
      ...guidedNameIdeas,
      `${message} Ladder`.trim(),
      `${message} Circuit`.trim(),
      `${message} League`.trim(),
      `${message} Spotlight`.trim(),
    ].filter((entry) => entry.length);
    const uniqueSuggestions = suggestionPool.filter((value, index, array) => array.indexOf(value) === index);
    const suggestions = uniqueSuggestions.slice(0, 3);
    const suggestion = suggestions[0] ?? null;
    if (!suggestion) {
      pushToast({
        tone: "info",
        title: "One more detail",
        description: "Mention the mood, a rivalry, or your cadence and I’ll suggest names.",
      });
      setAssistantConversation((prev) => [
        ...prev,
        createAssistantMessage("ai", "Give me one hint — vibe, rivalry, or cadence — and I’ll pitch a few names."),
      ]);
      return;
    }
    handleFormField("name", suggestion);
    const suggestionListText = suggestions
      .map((option, index) => `${index + 1}. ${option}`)
      .join("\n");
    setAssistantConversation((prev) => [
      ...prev,
      createAssistantMessage(
        "ai",
        `Here are a few name directions:\n${suggestionListText}\nI set option #1 in the title field so you can preview it. Want me to go more seasonal, rivalry-heavy, or mythic? Say the word — I can also help with your summary, rules, or rewards next.`,
      ),
    ]);
    setAssistantDraft("");
  }, [assistantDraft, createAssistantMessage, guidedNameIdeas, handleFormField, pushToast]);
  const handleAssistantKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleAssistantSend();
      }
    },
    [handleAssistantSend],
  );
  const handleMemberField = React.useCallback(
    (index: number, field: keyof LadderMemberFormValues, value: string) => {
      setMembers((prev) => {
        const next = [...prev];
        const current = next[index];
        if (!current) {
          return prev;
        }
        next[index] = { ...current, [field]: value };
        return normalizeMemberList(next);
      });
    },
    [],
  );
  const addMember = React.useCallback(() => {
    setMembers((prev) => normalizeMemberList([...prev, createEmptyMemberForm(prev.length)]));
  }, []);
  const removeMember = React.useCallback((index: number) => {
    setMembers((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) {
        return [createEmptyMemberForm(0)];
      }
      return normalizeMemberList(next);
    });
  }, []);
  const handleDiscardDraft = React.useCallback(() => {
    if (!draftStorageKey || typeof window === "undefined") return;
    const confirmDiscard = window.confirm(
      "Discard the autosaved ladder draft? This clears your local changes.",
    );
    if (!confirmDiscard) return;
    discardDraft();
    pushToast({
      tone: "info",
      title: "Draft cleared",
      description: "Autosave has been reset. You're working with a fresh ladder.",
    });
    trackLadderEvent({
      event: "ladders.draft.exit",
      capsuleId: selectedCapsuleId,
      payload: { action: "discard" },
    });
  }, [discardDraft, draftStorageKey, pushToast, selectedCapsuleId]);

  React.useEffect(() => {
    void router;
  }, [router]);

  const createLadder = React.useCallback(async () => {
    if (!selectedCapsule) {
      pushToast({
        tone: "warning",
        title: "Select a capsule",
        description: "Choose a capsule before creating the ladder.",
      });
      trackLadderEvent({
        event: "ladders.error.surface",
        payload: { context: "publish", reason: "no_capsule" },
      });
      return;
    }
    if (!form.name.trim().length) {
      pushToast({
        tone: "warning",
        title: "Add a ladder name",
        description: "Give your ladder a clear name so teams can find it.",
      });
      trackLadderEvent({
        event: "ladders.error.surface",
        capsuleId: selectedCapsule.id,
        payload: { context: "publish", reason: "missing_name" },
      });
      return;
    }
    if (!isOnline) {
      pushToast({
        tone: "warning",
        title: "Reconnect to publish",
        description: "You're offline. We'll keep the draft safe until you're back online.",
      });
      trackLadderEvent({
        event: "ladders.error.surface",
        capsuleId: selectedCapsule.id,
        payload: { context: "publish", reason: "offline" },
      });
      return;
    }
    for (const stepId of LADDER_WIZARD_STEP_ORDER) {
      const valid = validateStep(stepId, "publish");
      if (!valid) {
        return;
      }
    }
    const lifecycle = wizardLifecycleRef.current;
    lifecycle.publishAttempts += 1;
    trackLadderEvent({
      event: "ladders.publish.start",
      capsuleId: selectedCapsule.id,
      payload: {
        attempt: lifecycle.publishAttempts,
        publishType: form.publish ? "live" : "draft",
        stepsCompleted: lifecycle.completedSteps.size,
        elapsedMs: msSince(lifecycle.wizardStartedAt),
      },
    });
    const membersPayload = convertMembersToPayload(members);
    const gamePayload = convertGameToPayload(form);
    const configPayload = convertConfigToPayload(form);
    const sectionsPayload = convertSectionsToPayload(form);
    setSaving(true);
    try {
      const response = await fetch(`/api/capsules/${selectedCapsule.id}/ladders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: form.name.trim(),
          summary: form.summary.trim().length ? form.summary.trim() : null,
          visibility: form.visibility,
          status: form.publish ? "active" : "draft",
          publish: form.publish,
          game: gamePayload,
          config: configPayload,
          sections: sectionsPayload,
          aiPlan: aiPlan ?? undefined,
          meta: meta ?? undefined,
          members: membersPayload,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message =
          payload?.error?.message ?? payload?.message ?? "Unable to create the ladder.";
        throw new Error(message);
      }
      const { ladder } = await response.json();
      pushToast({
        tone: "success",
        title: form.publish ? "Ladder published" : "Draft saved",
        description: form.publish
          ? "Check your Capsule Events tab to confirm the listing."
          : "Find it in the Capsule Events tab when you're ready to publish.",
      });
      const now = Date.now();
      const templateSource = lifecycle.blueprintApplied
        ? "ai_blueprint"
        : draftRestoredAt
            ? "restored_draft"
            : "blank";
      const firstChallengeMs =
        lifecycle.firstChallengeAt !== null
          ? msSince(lifecycle.wizardStartedAt, lifecycle.firstChallengeAt)
          : null;
      trackLadderEvent({
        event: "ladders.publish.complete",
        capsuleId: ladder?.capsuleId ?? selectedCapsule.id,
        ladderId: ladder?.id ?? null,
        payload: {
          publishType: form.publish ? "live" : "draft",
          status: "success",
          durationMs: msSince(lifecycle.wizardStartedAt, now),
          stepsCompleted: lifecycle.completedSteps.size,
          stepVisits: { ...lifecycle.stepVisits },
          templateSource,
          draftRestored: Boolean(draftRestoredAt),
          firstChallengeMs,
          helperDensity: helperDensityVariant,
          membersCount: membersPayload.length,
          attempt: lifecycle.publishAttempts,
        },
      });
      if (ladder?.capsuleId) {
        setTimeout(() => {
          router.push(`/capsule?capsuleId=${ladder.capsuleId}&switch=events`);
        }, 800);
      }
    } catch (error) {
      pushToast({
        tone: "danger",
        title: "Unable to save ladder",
        description: (error as Error).message,
      });
      const lifecycleError = wizardLifecycleRef.current;
      trackLadderEvent({
        event: "ladders.publish.complete",
        capsuleId: selectedCapsule.id,
        payload: {
          publishType: form.publish ? "live" : "draft",
          status: "error",
          message: (error as Error).message,
          durationMs: msSince(lifecycleError.wizardStartedAt),
          stepsCompleted: lifecycleError.completedSteps.size,
          stepVisits: { ...lifecycleError.stepVisits },
          templateSource: lifecycleError.blueprintApplied
            ? "ai_blueprint"
            : draftRestoredAt
                ? "restored_draft"
                : "blank",
          draftRestored: Boolean(draftRestoredAt),
          firstChallengeMs:
            lifecycleError.firstChallengeAt !== null
              ? msSince(lifecycleError.wizardStartedAt, lifecycleError.firstChallengeAt)
              : null,
          helperDensity: helperDensityVariant,
          membersCount: membersPayload.length,
          attempt: lifecycleError.publishAttempts,
        },
      });
    } finally {
      setSaving(false);
    }
  }, [
    aiPlan,
    draftRestoredAt,
    form,
    helperDensityVariant,
    isOnline,
    members,
    meta,
    pushToast,
    router,
    selectedCapsule,
    validateStep,
  ]);
  const renderAiPlan = () => <AiPlanCard plan={aiPlan} />;
  const renderToastStack = () =>
    toasts.length ? (
      <div className={styles.toastStack} role="region" aria-live="assertive">
        {toasts.map((toast) => (
          <Alert key={toast.id} tone={toast.tone} className={styles.toastCard}>
            <button
              type="button"
              className={styles.toastDismiss}
              onClick={() => dismissToast(toast.id)}
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
  const renderReviewOverview = () => (
    <ReviewOverviewCard
      capsuleName={selectedCapsule?.name ?? null}
      visibility={form.visibility}
      publish={form.publish}
      membersCount={members.length}
      sectionsReady={previewModel.sections.length}
    />
  );
  const renderPreviewPanel = () => {
    const topSections = previewModel.sections.slice(0, 3);
    const topMembers = previewModel.members.slice(0, 5);
    return (
      <div className={styles.previewCard}>
        <header className={styles.previewHeader}>
          <div>
            <div className={styles.previewLabel}>Ladder name</div>
            <div className={styles.previewTitle}>{previewModel.name}</div>
          </div>
          <span className={styles.previewBadge}>{previewModel.visibilityLabel}</span>
        </header>
        <p className={styles.previewSummary}>
          {previewModel.summary?.length
            ? previewModel.summary
            : "Add a summary so challengers know what makes this ladder special."}
        </p>
        <div className={styles.previewMeta}>
          <div className={styles.previewMetaBlock}>
            <span className={styles.previewMetaLabel}>Game</span>
            <span className={styles.previewMetaValue}>
              {previewModel.gameTitle || "Set the game and mode"}
            </span>
            {previewModel.gameMeta.length ? (
              <span className={styles.previewMetaHint}>{previewModel.gameMeta.join(" / ")}</span>
            ) : null}
          </div>
          <div className={styles.previewMetaBlock}>
            <span className={styles.previewMetaLabel}>Schedule</span>
            <span className={styles.previewMetaValue}>
              {previewModel.schedule.length ? previewModel.schedule[0] : "Define cadence"}
            </span>
            {previewModel.schedule.slice(1).map((entry) => (
              <span key={entry} className={styles.previewMetaHint}>
                {entry}
              </span>
            ))}
          </div>
          <div className={styles.previewMetaBlock}>
            <span className={styles.previewMetaLabel}>Scoring</span>
            <span className={styles.previewMetaValue}>
              {previewModel.scoring.length ? previewModel.scoring[0] : "Pick a scoring system"}
            </span>
            {previewModel.scoring.slice(1).map((entry) => (
              <span key={entry} className={styles.previewMetaHint}>
                {entry}
              </span>
            ))}
          </div>
        </div>
        <div className={styles.previewSections}>
          <div className={styles.previewLabel}>Spotlight Sections</div>
          {topSections.map((section) => (
            <div key={section.key} className={styles.previewSection}>
              <h4>{section.title}</h4>
              {section.body ? <p>{section.body}</p> : null}
              {section.bullets.length ? (
                <ul>
                  {section.bullets.slice(0, 3).map((bullet, index) => (
                    <li key={`${section.key}-bullet-${index}`}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
          {!topSections.length ? (
            <p className={styles.previewEmpty}>Draft at least one section to populate the events view.</p>
          ) : null}
        </div>
        <div className={styles.previewRoster}>
          <div className={styles.previewLabel}>Top seeds</div>
          {topMembers.length ? (
            <ul>
              {topMembers.map((member, index) => {
                const accent = getIdentityAccent(member.displayName, index);
                const accentStyle = {
                  "--identity-color": accent.primary,
                  "--identity-glow": accent.glow,
                  "--identity-border": accent.border,
                  "--identity-surface": accent.surface,
                  "--identity-text": accent.text,
                } as React.CSSProperties;
                const seedDisplay = member.seed ?? index + 1;
                return (
                  <li key={`${member.displayName}-${index}`} className={styles.previewRosterItem}>
                    <span className={styles.previewAvatar} style={accentStyle}>
                      <span className={styles.previewAvatarText}>{accent.initials}</span>
                    </span>
                    <div className={styles.previewMemberMeta}>
                      <span className={styles.previewMemberName}>{member.displayName}</span>
                      <span className={styles.previewMemberStats}>
                        Seed {seedDisplay}
                        {" \u2022 "}
                        {member.record}
                        {" \u2022 "}
                        <abbr
                          className={styles.helperAbbr}
                          title="ELO updates player skill after every result. Start fresh ladders around 1200."
                        >
                          ELO
                        </abbr>{" "}
                        {member.rating}
                        {" \u2022 "}
                        <abbr
                          className={styles.helperAbbr}
                          title="Streak tracks consecutive wins used for spotlight badges."
                        >
                          Streak
                        </abbr>{" "}
                        {streakLabel(member.streak)}
                      </span>
                    </div>
                    <span className={styles.previewTeamChip} style={accentStyle}>
                      Seed {seedDisplay}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className={styles.previewEmpty}>Add players or teams to see them listed here.</p>
          )}
        </div>
      </div>
    );
  };
  const renderGuidedExperience = () => (
    <WizardLayout
      stepperLabel="Guided progress"
      steps={GUIDED_STEP_DEFINITIONS}
      activeStepId={guidedStep}
      completionMap={guidedCompletion}
      onStepSelect={handleGuidedStepSelect}
      toastStack={renderToastStack()}
      formContentRef={formContentRef}
      stepStackClassName={styles.guidedStack}
      formContent={
        <GuidedStepContent
          step={guidedStep}
          form={form}
          members={members}
          guidedSummaryIdeas={guidedSummaryIdeas}
          guidedTemplateId={guidedTemplateId}
          assistantConversation={assistantConversation}
          assistantDraft={assistantDraft}
          onAssistantDraftChange={(value) => setAssistantDraft(value)}
          onAssistantKeyDown={handleAssistantKeyDown}
          onAssistantSend={handleAssistantSend}
          onFormField={handleFormField}
          onRegistrationChange={handleRegistrationChange}
          onGameChange={handleGameChange}
          onScoringChange={handleScoringChange}
          onScheduleChange={handleScheduleChange}
          onSectionChange={handleSectionChange}
          onApplyTemplatePreset={applyTemplatePreset}
          onAppendRuleSnippet={handleAppendRuleSnippet}
          onAppendRewardSnippet={handleAppendRewardSnippet}
          onMemberField={handleMemberField}
          onAddMember={addMember}
          onRemoveMember={removeMember}
          reviewOverview={renderReviewOverview()}
          reviewAiPlan={renderAiPlan()}
        />
      }
      controlsStart={
        <>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              if (!guidedPreviousStepId) return;
              handleGuidedStepSelect(guidedPreviousStepId);
            }}
            disabled={!guidedPreviousStepId}
          >
            Back
          </Button>
          {canDiscardDraft ? (
            <Button type="button" variant="ghost" onClick={handleDiscardDraft} disabled={isSaving}>
              Discard draft
            </Button>
          ) : null}
          {selectedCapsule ? (
            <Button type="button" variant="ghost" onClick={() => handleCapsuleChange(null)} disabled={isSaving}>
              Switch capsule
            </Button>
          ) : null}
        </>
      }
      controlsEnd={
        guidedStep !== "review" ? (
          <Button
            type="button"
            onClick={() => {
              if (!guidedNextStepId) return;
              handleGuidedStepSelect(guidedNextStepId);
            }}
            disabled={!guidedNextStepId}
          >
            {guidedNextStep ? `Next: ${guidedNextStep.title}` : "Next"}
          </Button>
        ) : (
          <Button type="button" onClick={createLadder} disabled={isSaving || !isOnline}>
            {isSaving ? "Saving ladder..." : form.publish ? "Publish ladder" : "Save ladder draft"}
          </Button>
        )
      }
      previewPanel={renderPreviewPanel()}
    />
  );
  if (!selectedCapsule) {
    return (
      <div className={styles.gateWrap}>
        <CapsuleGate
          capsules={capsuleList}
          defaultCapsuleId={initialCapsuleId ?? null}
          forceSelector
          autoActivate={false}
          selectorTitle="Pick a capsule for your ladder"
          selectorSubtitle="We'll use this capsule's community profile when drafting copy and formats."
          onCapsuleChosen={handleCapsuleChange}
        />
      </div>
    );
  }
  return (
    <div className={styles.builderWrap}>
      <div className={styles.wizardPanel}>
        <div className={styles.panelGlow} aria-hidden />
        {renderGuidedExperience()}
      </div>
    </div>
  );
}

