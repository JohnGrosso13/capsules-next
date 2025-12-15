"use client";
import * as React from "react";
import type { ZodIssue } from "zod";
import { useRouter } from "next/navigation";
import type { CapsuleSummary } from "@/server/capsules/service";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { trackLadderEvent } from "@/lib/telemetry/ladders";
import styles from "./LadderBuilder.module.css";
import {
  defaultMembersForm,
  defaultSeedForm,
  createEmptyMemberForm,
  SECTION_KEYS,
  type LadderMemberFormValues,
  type LadderWizardState,
  type SectionKey,
  type LadderSectionFormValues,
  type LadderCustomSectionFormValues,
  type LadderGameFormValues,
  matchFormatLabel,
  matchFormatOptions,
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
import { createWizardLifecycleState, msSince, type WizardLifecycleMetrics } from "./lifecycle";
import { buildGuidedCompletion } from "./guidedCompletion";
import {
  GUIDED_STEP_ORDER,
  DEFAULT_GUIDED_STEP,
  buildGuidedSummaryIdeas,
  type GuidedStepId,
} from "./guidedConfig";
import {
  createInitialFormState,
  trimOrNull,
  normalizeMemberList,
  type LadderBuilderFormState,
} from "./builderState";
import {
  convertConfigToPayload,
  convertGameToPayload,
  convertMembersToPayload,
  convertSectionsToPayload,
} from "./builderPayload";
import { buildPreviewSnapshot } from "./builderPreview";
import { useLadderDraft, type PersistedLadderDraft } from "./hooks/useLadderDraft";
import { createInitialAssistantState, useAssistantState } from "./hooks/useAssistantState";
import { useGuidedWizardMachine } from "./hooks/useGuidedWizardMachine";
import { useToastNotifications } from "./hooks/useToastNotifications";
import LadderWizardView from "./LadderWizardView";
import type { LadderConfig, LadderSections, LadderVisibility } from "@/types/ladders";
type AiPlanState = {
  reasoning?: string | null;
  prompt?: string | null;
  suggestions?: Array<{ id: string; title: string; summary: string; section?: string | null }>;
};
type LadderBlueprintResponse = {
  ladder: {
    name?: string;
    summary?: string | null;
    visibility?: LadderVisibility | string | null;
    publish?: boolean;
    status?: string | null;
    game?: Record<string, unknown> | null;
    config?: LadderConfig | Record<string, unknown> | null;
    sections?: LadderSections | Record<string, unknown> | null;
    aiPlan?: AiPlanState | Record<string, unknown> | null;
    meta?: Record<string, unknown> | null;
  };
  members?: Array<Record<string, unknown>>;
};

const summarizeIssues = (issues: ZodIssue[]): Array<{ path: string; message: string }> => {
  return issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
};

const toTrimmedString = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
};

const normalizeMatchFormat = (value: unknown): string => {
  const trimmed = toTrimmedString(value);
  if (!trimmed) return "";
  const canonical = trimmed.toLowerCase().replace(/[\s-]+/g, "_");
  const match = matchFormatOptions.find((option) => {
    const optionKey = option.value.toLowerCase();
    const optionLabelKey = option.label.toLowerCase().replace(/[\s-]+/g, "_");
    return canonical === optionKey || canonical === optionLabelKey;
  });
  return match?.value ?? "";
};

const splitToList = (value: string | string[] | null | undefined, limit = 6): string[] => {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : value.split(/[\n,;]+/);
  const entries = raw
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length);
  const unique = Array.from(new Set(entries));
  return unique.slice(0, Math.max(1, limit));
};

const parseNumericField = (value: unknown, options?: { min?: number; max?: number }): number | null => {
  let parsed: number | null = null;
  if (typeof value === "number" && Number.isFinite(value)) {
    parsed = value;
  } else if (typeof value === "string") {
    const coerced = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(coerced)) {
      parsed = coerced;
    }
  }
  if (!Number.isFinite(parsed ?? NaN)) return null;
  let result = parsed as number;
  if (typeof options?.min === "number") {
    result = Math.max(options.min, result);
  }
  if (typeof options?.max === "number") {
    result = Math.min(options.max, result);
  }
  return Number.isFinite(result) ? result : null;
};

const ASSISTANT_STEPS: GuidedStepId[] = ["blueprint", "title", "summary", "overview", "rules", "shoutouts", "rewards"];

const DEFAULT_WIZARD_START_STEP = (LADDER_WIZARD_STEP_ORDER[0] ?? "basics") as LadderWizardStepId;
const GUIDED_TO_WIZARD_STEP: Partial<Record<GuidedStepId, LadderWizardStepId>> = {
  blueprint: "seed",
  title: "basics",
  summary: "basics",
  registration: "format",
  type: "format",
  format: "format",
  overview: "sections",
  rules: "sections",
  shoutouts: "sections",
  rewards: "sections",
  roster: "roster",
  review: "review",
};

export type LadderWizardControllerProps = {
  capsule: CapsuleSummary;
  capsuleList: CapsuleSummary[];
  previewMode?: boolean;
  onCapsuleChange: (capsule: CapsuleSummary | null) => void;
};
export function LadderWizardController({
  capsule,
  capsuleList,
  previewMode = false,
  onCapsuleChange,
}: LadderWizardControllerProps) {
  const router = useRouter();
  const selectedCapsule = capsule;
  const selectedCapsuleId = capsule.id;
  const wizardLifecycleRef = React.useRef<WizardLifecycleMetrics>(createWizardLifecycleState(DEFAULT_WIZARD_START_STEP));
  const lastTrackedCapsuleRef = React.useRef<string | "__init" | null>("__init");
  const draftStorageKey = React.useMemo(() => {
    return `capsules:ladder-builder:${selectedCapsuleId}`;
  }, [selectedCapsuleId]);
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
  const [seed, setSeed] = React.useState(() => ({ ...defaultSeedForm }));
  const isOnline = useNetworkStatus();
  const { toasts, pushToast, dismissToast } = useToastNotifications();
  const offlineToastId = React.useRef<string | null>(null);
  const hasAnnouncedNetwork = React.useRef(false);
  const [isSaving, setSaving] = React.useState(false);
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
  const previewSnapshot = React.useMemo(
    () => buildPreviewSnapshot(wizardState, selectedCapsule?.id ?? null),
    [selectedCapsule?.id, wizardState],
  );
  const stepDefinitionMap = React.useMemo(() => {
    const map = new Map<LadderWizardStepId, (typeof LADDER_WIZARD_STEPS)[number]>();
    LADDER_WIZARD_STEPS.forEach((step) => {
      map.set(step.id, step);
    });
    return map;
  }, []);
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
  const { guidedStep, guidedVisited, selectStep: selectGuidedStep, reset: resetGuidedFlow } = useGuidedWizardMachine({
    initialStep: DEFAULT_GUIDED_STEP,
    stepOrder: GUIDED_STEP_ORDER,
    stepMap: GUIDED_TO_WIZARD_STEP,
    lifecycleRef: wizardLifecycleRef,
    validateStep,
  });
  const guidedCompletion = React.useMemo(
    () => buildGuidedCompletion({ form, members, visited: guidedVisited }),
    [form, members, guidedVisited],
  );
  const {
    assistantStateByStep,
    assistantDraft,
    assistantIsSending,
    assistantConversation,
    createAssistantMessage,
    updateAssistantState,
  } = useAssistantState(guidedStep, ASSISTANT_STEPS);
  const resetBuilderToDefaults = React.useCallback(() => {
    setForm(createInitialFormState());
    setMembers(defaultMembersForm());
    setAiPlan(null);
    setMeta({ variant: "ladder" });
    setSeed({ ...defaultSeedForm });
    resetGuidedFlow(DEFAULT_GUIDED_STEP);
    wizardLifecycleRef.current = createWizardLifecycleState(DEFAULT_WIZARD_START_STEP);
  }, [resetGuidedFlow]);
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
        resetGuidedFlow(draft.guidedStep as GuidedStepId);
      } else {
        resetGuidedFlow(DEFAULT_GUIDED_STEP);
      }
    },
    [resetGuidedFlow, setForm, setMembers, setMeta, setSeed],
  );
  const handleDraftRestored = React.useCallback(
    (_timestamp: number) => {
      pushToast({
        tone: "info",
        title: "Draft restored",
        description: "We loaded your latest ladder edits so you can pick up where you left off.",
        // Let this confirmation fade quickly so it doesn't linger over the builder.
        durationMs: 2600,
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
    resetGuidedFlow(guidedStep);
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
  }, [capsuleList.length, draftRestoredAt, guidedStep, helperDensityVariant, metaVariant, resetGuidedFlow, selectedCapsuleId]);
  const formContentRef = React.useRef<HTMLDivElement | null>(null);
  const scrollToStepContent = React.useCallback(() => {
    if (typeof window === "undefined") return;
    const node = formContentRef.current;
    if (!node) return;
    const top = node.getBoundingClientRect().top + window.scrollY - 96;
    window.scrollTo({ top, behavior: "smooth" });
  }, []);
  React.useEffect(() => {
    if (formContentRef.current) {
      formContentRef.current.focus();
    }
  }, [guidedStep]);
  const handleGuidedStepSelect = React.useCallback(
    (stepId: GuidedStepId) => {
      selectGuidedStep(stepId);
      if (typeof window !== "undefined") {
        window.requestAnimationFrame(scrollToStepContent);
      }
    },
    [scrollToStepContent, selectGuidedStep],
  );
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

  const formatScoringContext = React.useCallback(() => {
    const parts: string[] = [];
    if (form.scoring.system) parts.push(`System: ${form.scoring.system.toUpperCase()}`);
    if (form.scoring.initialRating) parts.push(`Initial rating ${form.scoring.initialRating}`);
    if (form.scoring.kFactor) parts.push(`K-factor ${form.scoring.kFactor}`);
    if (form.scoring.placementMatches) parts.push(`Placement matches ${form.scoring.placementMatches}`);
    if (form.scoring.decayPerDay) parts.push(`Rating decay ${form.scoring.decayPerDay}/day`);
    if (form.scoring.bonusForStreak) parts.push(`Streak bonus +${form.scoring.bonusForStreak}`);
    return parts.join(" | ");
  }, [form.scoring.bonusForStreak, form.scoring.decayPerDay, form.scoring.initialRating, form.scoring.kFactor, form.scoring.placementMatches, form.scoring.system]);
  const buildAssistantContextLines = React.useCallback(() => {
    const lines: string[] = [];
    lines.push(`Capsule: ${selectedCapsule?.name ?? "Unspecified Capsule"}`);
    const formatLabel = matchFormatLabel(form.game.mode);
    lines.push(`Game: ${form.game.title || "Not set"}${formatLabel ? ` (${formatLabel})` : ""}`);
    if (form.game.platform || form.game.region) {
      lines.push(
        `Platform/Region: ${[form.game.platform || null, form.game.region || null].filter(Boolean).join(" / ")}`,
      );
    }
    if (form.schedule.cadence || form.schedule.kickoff || form.schedule.timezone) {
      lines.push(
        `Schedule: ${[form.schedule.cadence || null, form.schedule.kickoff || null, form.schedule.timezone || null].filter(Boolean).join(" / ")}`,
      );
    }
    lines.push(
      `Registration: ${form.registration.type}${form.registration.maxTeams ? ` (cap ${form.registration.maxTeams})` : ""}`,
    );
    if (form.registration.requirements?.trim()) {
      const reqs = form.registration.requirements
        .split("\n")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .slice(0, 4)
        .join("; ");
      if (reqs.length) {
        lines.push(`Launch checklist: ${reqs}`);
      }
    }
    const scoringLine = formatScoringContext();
    if (scoringLine) lines.push(`Scoring: ${scoringLine}`);
    if (form.sections.overview.body?.trim()) {
      lines.push(`Overview: ${form.sections.overview.body.trim().slice(0, 320)}`);
    }
    if (form.sections.rules.body?.trim()) {
      lines.push(`Rules: ${form.sections.rules.body.trim().slice(0, 320)}`);
    }
    if (form.sections.shoutouts.body?.trim()) {
      lines.push(`Shoutouts: ${form.sections.shoutouts.body.trim().slice(0, 260)}`);
    }
    if (form.sections.shoutouts.bulletsText?.trim()) {
      const bullets = form.sections.shoutouts.bulletsText
        .split("\n")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .slice(0, 4)
        .join("; ");
      if (bullets.length) lines.push(`Shoutout bullets: ${bullets}`);
    }
    if (form.sections.results.body?.trim()) {
      lines.push(`Rewards: ${form.sections.results.body.trim().slice(0, 260)}`);
    }
    const seeds = members
      .slice(0, 4)
      .filter((member) => member.displayName.trim().length)
      .map((member) => member.displayName.trim());
    if (seeds.length) {
      lines.push(`Top seeds: ${seeds.join(", ")}`);
    }
    return lines;
  }, [
    form.game.mode,
    form.game.platform,
    form.game.region,
    form.game.title,
    form.registration.maxTeams,
    form.registration.requirements,
    form.registration.type,
    form.schedule.cadence,
    form.schedule.kickoff,
    form.schedule.timezone,
    form.sections.overview.body,
    form.sections.results.body,
    form.sections.rules.body,
    form.sections.shoutouts.body,
    form.sections.shoutouts.bulletsText,
    formatScoringContext,
    members,
    selectedCapsule?.name,
  ]);

  const buildBlueprintRequestPayload = React.useCallback(
    (promptText: string) => {
      const payload: Record<string, unknown> = { goal: promptText };
      const audience = toTrimmedString(seed.audience) || toTrimmedString(form.summary);
      if (audience.length) payload.audience = audience;
      const tone = toTrimmedString(seed.tone);
      if (tone.length) payload.tone = tone;
      const capsuleBrief = toTrimmedString(seed.capsuleBrief);
      if (capsuleBrief.length) payload.capsuleBrief = capsuleBrief;
      const seasonLength = parseNumericField(seed.seasonLengthWeeks, { min: 1, max: 52 });
      if (seasonLength !== null) payload.seasonLengthWeeks = seasonLength;
      const participantCount =
        parseNumericField(seed.participants, { min: 2, max: 512 }) ??
        parseNumericField(form.registration.maxTeams, { min: 2, max: 512 });
      if (participantCount !== null) payload.participants = participantCount;
      const timezone = toTrimmedString(seed.timezone) || toTrimmedString(form.schedule.timezone);
      if (timezone.length) payload.timezone = timezone;
      const existingRules = toTrimmedString(seed.existingRules) || toTrimmedString(form.sections.rules.body);
      if (existingRules.length) payload.existingRules = existingRules;
      const prizeIdeas = splitToList(seed.prizeIdeas || form.sections.results.body, 6);
      if (prizeIdeas.length) payload.prizeIdeas = prizeIdeas;
      const announcementFocus = splitToList(
        seed.announcementsFocus || form.sections.shoutouts.body || form.sections.shoutouts.bulletsText,
        6,
      );
      if (announcementFocus.length) payload.announcementsFocus = announcementFocus;
      const shoutouts = splitToList(seed.shoutouts, 6);
      if (shoutouts.length) payload.shoutouts = shoutouts;
      const registrationNotes =
        toTrimmedString(seed.registrationNotes) || toTrimmedString(form.registration.requirements);
      if (registrationNotes.length) payload.registrationNotes = registrationNotes;
      const notes = toTrimmedString(seed.notes);
      if (notes.length) payload.notes = notes;
      const game: Record<string, string> = {};
      (["title", "mode", "platform", "region"] as Array<keyof LadderGameFormValues>).forEach((field) => {
        const value = toTrimmedString(form.game[field]);
        if (value.length) {
          game[field] = value;
        }
      });
      if (Object.keys(game).length) payload.game = game;
      return payload;
    },
    [
      form.game,
      form.registration.maxTeams,
      form.registration.requirements,
      form.schedule.timezone,
      form.sections.results.body,
      form.sections.rules.body,
      form.sections.shoutouts.body,
      form.sections.shoutouts.bulletsText,
      form.summary,
      seed.announcementsFocus,
      seed.audience,
      seed.capsuleBrief,
      seed.existingRules,
      seed.notes,
      seed.participants,
      seed.prizeIdeas,
      seed.registrationNotes,
      seed.seasonLengthWeeks,
      seed.shoutouts,
      seed.timezone,
      seed.tone,
    ],
  );
  const applyBlueprintDraft = React.useCallback(
    (response: LadderBlueprintResponse) => {
      if (!response?.ladder) return;
      const ladder = response.ladder;
      const hasCoreCoverage = (() => {
        const sections = ladder.sections as LadderSections | undefined;
        const hasSection = (key: keyof LadderSections) => {
          const block = sections?.[key] as LadderSections[keyof LadderSections] | undefined;
          const body = toTrimmedString((block as { body?: unknown })?.body);
          const bulletsRaw = Array.isArray((block as { bulletPoints?: unknown })?.bulletPoints)
            ? ((block as { bulletPoints?: unknown }).bulletPoints as unknown[])
            : [];
          const bullets = bulletsRaw.filter((entry) => typeof entry === "string" && entry.trim().length);
          return Boolean(body?.length || bullets.length);
        };
        if (!toTrimmedString(ladder.name)) return false;
        if (!toTrimmedString(ladder.summary)) return false;
        const gameTitle = toTrimmedString(((ladder.game ?? {}) as { title?: unknown }).title);
        if (!gameTitle) return false;
        const config = (ladder.config ?? {}) as Record<string, unknown>;
        const schedule = (config.schedule ?? (config as { schedule?: unknown }).schedule) as Record<string, unknown>;
        const registration = (config.registration ?? (config as { registration?: unknown }).registration) as Record<
          string,
          unknown
        >;
        if (!toTrimmedString(schedule?.cadence)) return false;
        if (!toTrimmedString(registration?.type)) return false;
        const scoring = (config.scoring ?? (config as { scoring?: unknown }).scoring) as Record<string, unknown>;
        if (!toTrimmedString(scoring?.system)) return false;
        return hasSection("overview") && hasSection("rules") && hasSection("upcoming") && hasSection("results");
      })();
      if (!hasCoreCoverage) {
        pushToast({
          tone: "warning",
          title: "Blueprint incomplete",
          description: "Capsule AI could not fill enough fields from that prompt. Try adding more detail.",
        });
        return;
      }
      const sectionsSource = (response.ladder.sections ?? {}) as Record<string, unknown>;
      const upcomingSection = sectionsSource.upcoming as Record<string, unknown> | undefined;
      const upcomingBody = toTrimmedString(upcomingSection?.body);
      const upcomingBullets =
        Array.isArray((upcomingSection as { bulletPoints?: unknown })?.bulletPoints) &&
        ((upcomingSection as { bulletPoints?: unknown }).bulletPoints as unknown[]).length > 0;
      const shouldRecordChallenge = Boolean(upcomingBody || upcomingBullets);

      setForm((prev) => {
        const ladder = response.ladder;
        const visibilityRaw = toTrimmedString(ladder.visibility);
        const resolvedVisibility: LadderVisibility =
          visibilityRaw === "private" || visibilityRaw === "public"
            ? (visibilityRaw as LadderVisibility)
            : visibilityRaw === "capsule"
              ? "capsule"
              : prev.visibility;

        const gameRaw = (ladder.game ?? {}) as Record<string, unknown>;
        const nextGame: LadderGameFormValues = {
          ...prev.game,
          title: toTrimmedString(gameRaw.title) || prev.game.title,
          mode: normalizeMatchFormat(gameRaw.mode) || prev.game.mode,
          platform: toTrimmedString(gameRaw.platform) || prev.game.platform,
          region: toTrimmedString(gameRaw.region) || prev.game.region,
        };

        const configRaw = (ladder.config ?? {}) as Record<string, unknown>;
        const scoringRaw = (configRaw.scoring ?? (configRaw as { scoring?: unknown }).scoring) as
          | Record<string, unknown>
          | undefined;
        const scheduleRaw = (configRaw.schedule ?? (configRaw as { schedule?: unknown }).schedule) as
          | Record<string, unknown>
          | undefined;
        const registrationRaw = (configRaw.registration ??
          (configRaw as { registration?: unknown }).registration) as Record<string, unknown> | undefined;

        const normalizeScoringSystem = (value: unknown): LadderScoringFormValues["system"] => {
          if (typeof value !== "string") return prev.scoring.system;
          const cleaned = value.trim().toLowerCase();
          const allowed: LadderScoringFormValues["system"][] = ["simple", "elo", "ai", "points", "custom"];
          if ((allowed as string[]).includes(cleaned)) {
            return cleaned as LadderScoringFormValues["system"];
          }
          if (cleaned.includes("ai")) return "ai";
          if (cleaned.includes("simple") || cleaned.includes("basic") || cleaned.includes("casual")) return "simple";
          return prev.scoring.system;
        };

        const nextScoring: LadderScoringFormValues = {
          ...prev.scoring,
          system: normalizeScoringSystem(scoringRaw?.system),
          initialRating: toTrimmedString(scoringRaw?.initialRating) || prev.scoring.initialRating,
          kFactor: toTrimmedString(scoringRaw?.kFactor) || prev.scoring.kFactor,
          placementMatches: toTrimmedString(scoringRaw?.placementMatches) || prev.scoring.placementMatches,
          decayPerDay: toTrimmedString(scoringRaw?.decayPerDay) || prev.scoring.decayPerDay,
          bonusForStreak: toTrimmedString(scoringRaw?.bonusForStreak) || prev.scoring.bonusForStreak,
        };

        const nextSchedule: LadderScheduleFormValues = {
          ...prev.schedule,
          cadence: toTrimmedString(scheduleRaw?.cadence) || prev.schedule.cadence,
          kickoff:
            toTrimmedString(
              (scheduleRaw as Record<string, unknown>)?.kickoff ??
                (scheduleRaw as Record<string, unknown>)?.start,
            ) || prev.schedule.kickoff,
          timezone: toTrimmedString(scheduleRaw?.timezone) || prev.schedule.timezone,
        };

        const registrationRequirements = Array.isArray(registrationRaw?.requirements)
          ? (registrationRaw?.requirements as unknown[])
              .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
              .filter(Boolean)
              .join("\n")
          : toTrimmedString(registrationRaw?.requirements) || prev.registration.requirements;
        const maxTeams = parseNumericField(registrationRaw?.maxTeams ?? registrationRaw?.cap, { min: 2, max: 999 });
        const nextRegistration: LadderRegistrationFormValues = {
          ...prev.registration,
          type:
            typeof registrationRaw?.type === "string" && ["open", "invite", "waitlist"].includes(registrationRaw.type)
              ? (registrationRaw.type as LadderRegistrationFormValues["type"])
              : prev.registration.type,
          maxTeams: maxTeams !== null ? String(maxTeams) : prev.registration.maxTeams,
          requirements: registrationRequirements,
          opensAt: toTrimmedString((registrationRaw as Record<string, unknown>)?.opensAt) || prev.registration.opensAt,
          closesAt:
            toTrimmedString((registrationRaw as Record<string, unknown>)?.closesAt) || prev.registration.closesAt,
        };

        const extractBullets = (value: unknown): string[] => {
          if (Array.isArray(value)) {
            return (value as unknown[])
              .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
              .filter(Boolean)
              .slice(0, 8);
          }
          return [];
        };

        const nextSections: Record<SectionKey, LadderSectionFormValues> = { ...prev.sections };
        SECTION_KEYS.forEach((key) => {
          const rawSection = sectionsSource[key] as Record<string, unknown> | undefined;
          if (!rawSection || typeof rawSection !== "object") return;
          const bullets =
            extractBullets((rawSection as { bulletPoints?: unknown }).bulletPoints) ||
            extractBullets((rawSection as { bullets?: unknown }).bullets);
          const resolvedBody =
            toTrimmedString(rawSection.body) ||
            (key === "shoutouts" && bullets.length ? bullets.join("\n") : "") ||
            prev.sections[key].body;
          nextSections[key] = {
            title: toTrimmedString(rawSection.title) || prev.sections[key].title || key,
            body: resolvedBody,
            bulletsText: bullets.length ? bullets.join("\n") : prev.sections[key].bulletsText,
          };
        });

        const customRaw = sectionsSource.custom;
        const nextCustomSections: LadderCustomSectionFormValues[] = Array.isArray(customRaw)
          ? (customRaw as unknown[]).reduce<LadderCustomSectionFormValues[]>((acc, entry, index) => {
              if (!entry || typeof entry !== "object") return acc;
              const block = entry as Record<string, unknown>;
              const title = toTrimmedString(block.title);
              const bullets = extractBullets((block as { bulletPoints?: unknown }).bulletPoints);
              const id = toTrimmedString(block.id) || `custom-${index}-${Date.now()}`;
              acc.push({
                id,
                title: title || `Custom ${index + 1}`,
                body: toTrimmedString(block.body),
                bulletsText: bullets.join("\n"),
              });
              return acc;
            }, [])
          : prev.customSections;

        const resolvedName = toTrimmedString(ladder.name) || prev.name;
        const resolvedSummary =
          ladder.summary === null ? "" : toTrimmedString(ladder.summary) || prev.summary;
        const publishValue = typeof ladder.publish === "boolean" ? ladder.publish : prev.publish;

        return {
          ...prev,
          name: resolvedName,
          summary: resolvedSummary,
          visibility: resolvedVisibility,
          publish: publishValue,
          game: nextGame,
          scoring: nextScoring,
          schedule: nextSchedule,
          registration: nextRegistration,
          sections: nextSections,
          customSections: nextCustomSections,
        };
      });

      wizardLifecycleRef.current.blueprintApplied = true;
      if (shouldRecordChallenge) {
        recordFirstChallenge("blueprint");
      }

      if (response.ladder.meta && typeof response.ladder.meta === "object") {
        setMeta((prev) => {
          const merged = { ...prev, ...response.ladder.meta };
          if (!merged.variant || typeof merged.variant !== "string") {
            merged.variant = typeof prev.variant === "string" ? prev.variant : "ladder";
          }
          return merged;
        });
      }

      if (response.ladder.aiPlan && typeof response.ladder.aiPlan === "object") {
        const rawPlan = response.ladder.aiPlan as Record<string, unknown>;
        const suggestionsRaw = Array.isArray(rawPlan.suggestions) ? rawPlan.suggestions : [];
        const suggestions = suggestionsRaw
          .map((suggestion) => {
            if (!suggestion || typeof suggestion !== "object") return null;
            const entry = suggestion as Record<string, unknown>;
            const title = toTrimmedString(entry.title);
            const summary = toTrimmedString(entry.summary ?? entry.body);
            if (!title || !summary) return null;
            return {
              id:
                toTrimmedString(entry.id) ||
                `suggestion-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              title,
              summary,
              section: toTrimmedString(entry.section) || null,
            };
          })
          .filter(Boolean) as NonNullable<AiPlanState["suggestions"]>;
        setAiPlan({
          reasoning: toTrimmedString(rawPlan.reasoning) || null,
          prompt: toTrimmedString(rawPlan.prompt) || null,
          suggestions: suggestions.length ? suggestions : [],
        });
      }

      if (response.members?.length) {
        const mappedMembers = response.members
          .map((entry, index) => {
            if (!entry || typeof entry !== "object") return null;
            const record = entry as Record<string, unknown>;
            const displayName = toTrimmedString(record.displayName);
            if (!displayName.length) return null;
            const seedValue = parseNumericField(record.seed ?? record.rank, { min: 1, max: 999 }) ?? index + 1;
            const rating = parseNumericField(record.rating, { min: 100, max: 4000 }) ?? 1200;
            const wins = parseNumericField(record.wins, { min: 0, max: 500 }) ?? 0;
            const losses = parseNumericField(record.losses, { min: 0, max: 500 }) ?? 0;
            const draws = parseNumericField(record.draws, { min: 0, max: 500 }) ?? 0;
            const streak = parseNumericField(record.streak, { min: -20, max: 20 }) ?? 0;
            const metadata = record.metadata && typeof record.metadata === "object" ? (record.metadata as Record<string, unknown>) : null;
            const capsuleId = metadata ? toTrimmedString(metadata.capsuleId) : "";
            const capsuleSlug = metadata ? toTrimmedString(metadata.capsuleSlug ?? metadata.slug) : "";
            const avatarUrl = toTrimmedString(
              (record as { avatarUrl?: unknown }).avatarUrl ?? (metadata as { avatarUrl?: unknown } | null)?.avatarUrl,
            );
            return {
              userId: toTrimmedString(record.userId),
              displayName,
              handle: toTrimmedString(record.handle),
              capsuleId,
              capsuleSlug,
              avatarUrl,
              seed: String(seedValue),
              rating: String(rating),
              wins: String(wins),
              losses: String(losses),
              draws: String(draws),
              streak: String(streak),
            } as LadderMemberFormValues;
          })
          .filter((entry): entry is LadderMemberFormValues => Boolean(entry));
        if (mappedMembers.length) {
          setMembers(normalizeMemberList(mappedMembers));
        }
      }
    },
    [pushToast, recordFirstChallenge, setAiPlan, setMembers, setMeta],
  );
  const summarizeBlueprintReply = React.useCallback((payload: LadderBlueprintResponse): string => {
    const ladder = payload.ladder ?? {};
    const lines = ["Draft applied ✅"];
    const name = toTrimmedString(ladder.name);
    if (name) lines.push(`Name: ${name}`);
    const summary = toTrimmedString(ladder.summary);
    if (summary) lines.push(`Summary: ${summary}`);
    const game = (ladder.game ?? {}) as Record<string, unknown>;
    const config = (ladder.config ?? {}) as Record<string, unknown>;
    const gameTitle = toTrimmedString(game.title);
    const cadence = toTrimmedString((config.schedule as Record<string, unknown> | undefined)?.cadence);
    if (gameTitle || cadence) {
      lines.push(`Game: ${gameTitle || "TBD"}${cadence ? ` | Cadence: ${cadence}` : ""}`);
    }
    const sections = (ladder.sections ?? {}) as LadderSections;
    const scoring = (config.scoring ?? (config as { scoring?: unknown }).scoring) as Record<string, unknown>;
    const scoringSystem = toTrimmedString(scoring?.system);
    if (scoringSystem) {
      lines.push(`Format: ${scoringSystem.toUpperCase()}`);
    }
    const registration = (config.registration ?? (config as { registration?: unknown }).registration) as Record<
      string,
      unknown
    >;
    const regType = toTrimmedString(registration?.type);
    const regCap = toTrimmedString(registration?.maxTeams);
    if (regType) {
      lines.push(`Sign-ups: ${regType}${regCap ? ` (cap ${regCap})` : ""}`);
    }
    const rulesBody =
      sections?.rules && typeof sections.rules === "object" ? toTrimmedString(sections.rules.body) : "";
    if (rulesBody) {
      lines.push(`Rules: ${rulesBody.length > 140 ? `${rulesBody.slice(0, 140)}...` : rulesBody}`);
    }
    return lines.join("\n");
  }, []);
  const extractRecommendation = React.useCallback((text: string, kind: "title" | "summary"): string | null => {
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    const marker = kind === "title" ? "recommended title:" : "recommended summary:";
    const matchLine = lines.find((line) => line.toLowerCase().startsWith(marker));
    if (matchLine) {
      const stripped = matchLine.slice(marker.length).trim();
      return stripped.length ? stripped : null;
    }
    const firstBullet = lines.find((line) => /^[-*•\d]/.test(line));
    const candidate = firstBullet ?? lines[0] ?? null;
    if (!candidate) return null;
    const cleaned = candidate.replace(/^[-*•\d.]+\s*/, "").trim();
    if (!cleaned.length) return null;
    const maxLen = kind === "title" ? 80 : 200;
    return cleaned.length <= maxLen ? cleaned : cleaned.slice(0, maxLen).trim();
  }, []);
  const handleAssistantSend = React.useCallback(async () => {
    const stepId = guidedStep;
    if (!ASSISTANT_STEPS.includes(stepId)) return;

    const state = assistantStateByStep[stepId] ?? createInitialAssistantState();
    const userText = state.draft.trim();

    if (!userText || state.isSending) {
      if (!state.isSending) {
        pushToast({
          tone: "info",
          title: "Need a starting point?",
          description: "Share a vibe, rivalry, or cadence and I'll draft options.",
        });
      }
      return;
    }

    const userEntry = createAssistantMessage("user", userText);

    if (stepId === "blueprint") {
      if (!selectedCapsule) {
        pushToast({
          tone: "warning",
          title: "Select a capsule",
          description: "Pick a capsule so I can pull its context for the blueprint.",
        });
        return;
      }
      if (!isOnline) {
        pushToast({
          tone: "warning",
          title: "Reconnect to use Capsule AI",
          description: "Get back online to generate a full ladder blueprint.",
        });
        return;
      }
      updateAssistantState(stepId, (prev) => ({
        ...prev,
        draft: "",
        isSending: true,
        conversation: [...prev.conversation, userEntry],
      }));
      try {
        const response = await fetch(`/api/capsules/${selectedCapsule.id}/ladders/draft`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(buildBlueprintRequestPayload(userText)),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          const message =
            data?.error?.message ?? data?.message ?? "We couldn't generate a blueprint right now.";
          throw new Error(message);
        }
        const blueprint = (await response.json()) as LadderBlueprintResponse;
        applyBlueprintDraft(blueprint);
        pushToast({
          tone: "success",
          title: "Blueprint applied",
          description: "We filled in each step with Capsule AI. Review and tweak anything you like.",
        });
        trackLadderEvent({
          event: "ladders.draft.generate",
          capsuleId: selectedCapsule.id,
          payload: { source: "guided_blueprint", status: "success", promptLength: userText.length },
        });
        updateAssistantState(stepId, (prev) => ({
          ...prev,
          isSending: false,
          conversation: [...prev.conversation, createAssistantMessage("ai", summarizeBlueprintReply(blueprint))],
        }));
      } catch (error) {
        pushToast({
          tone: "warning",
          title: "Blueprint unavailable",
          description: (error as Error).message,
        });
        trackLadderEvent({
          event: "ladders.draft.generate",
          capsuleId: selectedCapsule?.id ?? null,
          payload: { source: "guided_blueprint", status: "error" },
        });
        updateAssistantState(stepId, (prev) => ({
          ...prev,
          isSending: false,
          conversation: [
            ...prev.conversation,
            createAssistantMessage("ai", "I couldn't generate a full blueprint yet. Try again soon."),
          ],
        }));
      }
      return;
    }

    updateAssistantState(stepId, (prev) => ({
      ...prev,
      draft: "",
      isSending: true,
      conversation: [...prev.conversation, userEntry],
    }));

    const historyPayload = [...state.conversation, userEntry].map((message) => ({
      id: message.id,
      role: message.sender === "ai" ? "assistant" : "user",
      content: message.text,
      createdAt: new Date(message.timestamp).toISOString(),
    }));
    const contextLines = buildAssistantContextLines();
    const stepInstruction =
      guidedStep === "blueprint"
        ? "You are drafting a ladder blueprint. Provide a short plan that includes title, summary, sign-up mode (open/invite/waitlist), format, platform/region, cadence, rules, rewards, and any standout prompts. Keep it concise and specific."
        : guidedStep === "title"
          ? "You are helping name this ladder. Start with a single line: \"Recommended title: <short title>\" under 60 characters. Then list 2-3 alternate titles as bullets, concise and game-specific."
          : guidedStep === "summary"
            ? "You are writing one-line ladder summaries. Start with \"Recommended summary: <one line>\" under 140 characters. Then list 2-3 alternates as bullets with stakes, cadence, and audience."
            : guidedStep === "overview"
              ? "Draft a compelling ladder overview. Lead with the stakes and audience, include cadence/platform, keep under 280 characters, and offer 2-3 bullet alternates."
              : guidedStep === "rules"
                ? "Draft ladder rules. Start with a concise ruleset covering format, proof/disputes, timing, and subs. Then list 3-5 bullet highlights."
                : guidedStep === "shoutouts"
                  ? "Create shoutout themes. Provide a short intro line, then 3-5 bullets for rivalries, MVPs, clutch plays, and underdogs."
                  : guidedStep === "rewards"
                    ? "Draft rewards. Provide a concise headline and 3-5 bullet incentives (prizes, spotlight perks, sponsor-friendly rewards)."
                    : "Help with ladder setup. Keep responses concise and specific.";
    const prompt = [
      "You are Capsule AI helping craft ladder content.",
      stepInstruction,
      "Use the context below to stay specific.",
      contextLines.join("\n"),
      `User request: ${userText}`,
    ].join("\n\n");
    try {
      const response = await fetch("/api/ai/prompt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: prompt,
          history: historyPayload,
          threadId: state.threadId ?? undefined,
          capsuleId: selectedCapsule?.id ?? null,
          useContext: true,
          options: { replyMode: "chat" },
        }),
      });
      if (!response.ok) {
        throw new Error("Capsule AI could not draft that right now.");
      }
      const payload = (await response.json()) as { action: "chat_reply" | "draft_post"; message?: string; post?: { content?: string }; threadId?: string | null };
      const reply =
        payload.action === "chat_reply"
          ? (payload.message ?? "").trim()
          : typeof payload.post?.content === "string" && payload.post.content.trim().length
            ? payload.post.content.trim()
            : (payload.message ?? "Here's a draft idea.").trim();
        const assistantEntry = createAssistantMessage("ai", reply);
      updateAssistantState(stepId, (prev) => ({
        ...prev,
        isSending: false,
        threadId: payload.threadId ?? prev.threadId,
        conversation: [...prev.conversation, assistantEntry],
      }));
      if (guidedStep === "title") {
        const recommended = extractRecommendation(reply, "title");
        if (recommended) {
          handleFormField("name", recommended);
        }
      } else if (guidedStep === "summary") {
        const recommended = extractRecommendation(reply, "summary");
        if (recommended) {
          handleFormField("summary", recommended);
        }
      }
    } catch (error) {
      pushToast({
        tone: "warning",
        title: "AI unavailable",
        description: (error as Error).message,
      });
      updateAssistantState(stepId, (prev) => ({
        ...prev,
        isSending: false,
        conversation: [
          ...prev.conversation,
          createAssistantMessage("ai", "I hit an issue reaching Capsule AI. Try again in a moment."),
        ],
      }));
    } finally {
      updateAssistantState(stepId, (prev) => ({
        ...prev,
        isSending: false,
      }));
    }
  }, [
    assistantStateByStep,
    createAssistantMessage,
    extractRecommendation,
    guidedStep,
    handleFormField,
    isOnline,
    pushToast,
    applyBlueprintDraft,
    buildBlueprintRequestPayload,
    summarizeBlueprintReply,
    selectedCapsule,
    buildAssistantContextLines,
    updateAssistantState,
  ]);
  const handleAssistantKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
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
  const addMemberWithUser = React.useCallback(
    (user: { id: string; name: string; avatarUrl?: string | null }) => {
      setMembers((prev) =>
        normalizeMemberList([
          ...prev,
          {
            ...createEmptyMemberForm(prev.length),
            displayName: user.name,
            userId: user.id,
            avatarUrl: user.avatarUrl ?? "",
          },
        ]),
      );
    },
    [],
  );
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
    resetGuidedFlow(guidedStep);
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
  }, [discardDraft, draftStorageKey, guidedStep, pushToast, resetGuidedFlow, selectedCapsuleId]);

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
  const handleAssistantDraftChange = React.useCallback(
    (value: string) => updateAssistantState(guidedStep, (prev) => ({ ...prev, draft: value })),
    [guidedStep, updateAssistantState],
  );
  return (
    <div className={styles.builderWrap}>
      <div className={styles.wizardPanel}>
        <div className={styles.panelGlow} aria-hidden />
        <LadderWizardView
          guidedStep={guidedStep}
          guidedCompletion={guidedCompletion}
          guidedSummaryIdeas={guidedSummaryIdeas}
          onStepSelect={handleGuidedStepSelect}
          formContentRef={formContentRef}
          selectedCapsuleId={selectedCapsuleId}
          selectedCapsuleName={selectedCapsule?.name ?? null}
          form={form}
          members={members}
          previewModel={previewModel}
          previewSnapshot={previewSnapshot}
          aiPlan={aiPlan}
          toasts={toasts}
          onDismissToast={dismissToast}
          assistantConversation={assistantConversation}
          assistantDraft={assistantDraft}
          assistantBusy={assistantIsSending}
          onAssistantDraftChange={handleAssistantDraftChange}
          onAssistantKeyDown={handleAssistantKeyDown}
          onAssistantSend={handleAssistantSend}
          onFormField={handleFormField}
          onRegistrationChange={handleRegistrationChange}
          onGameChange={handleGameChange}
          onScoringChange={handleScoringChange}
          onScheduleChange={handleScheduleChange}
          onSectionChange={handleSectionChange}
          onMemberField={handleMemberField}
          onAddMember={addMember}
          onAddMemberWithUser={addMemberWithUser}
          onRemoveMember={removeMember}
          onDiscardDraft={handleDiscardDraft}
          canDiscardDraft={canDiscardDraft}
          onCreateLadder={createLadder}
          onCapsuleChange={onCapsuleChange}
          previewMode={previewMode}
          isSaving={isSaving}
          isOnline={isOnline}
        />
      </div>
    </div>
  );
}
