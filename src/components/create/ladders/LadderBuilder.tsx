"use client";
import * as React from "react";
import type { ZodIssue } from "zod";
import { useRouter } from "next/navigation";
import { CapsuleGate } from "@/components/capsule/CapsuleGate";
import type { CapsuleSummary } from "@/server/capsules/service";
import type { LadderVisibility } from "@/types/ladders";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  type AlertTone,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { trackLadderEvent } from "@/lib/telemetry/ladders";
import { getIdentityAccent } from "@/lib/identity/teams";
import { formatRelativeTime } from "@/lib/composer/sidebar-types";
import styles from "./LadderBuilder.module.css";
import {
  SECTION_KEYS,
  type SectionKey,
  type LadderCustomSectionFormValues,
  type LadderSectionFormValues,
  type LadderGameFormValues,
  type LadderScoringFormValues,
  type LadderScheduleFormValues,
  type LadderRegistrationFormValues,
  type LadderMemberFormValues,
  type LadderWizardState,
  defaultSectionsForm,
  defaultGameForm,
  defaultScoringForm,
  defaultScheduleForm,
  defaultRegistrationForm,
  defaultMembersForm,
  defaultBasicsForm,
  defaultSeedForm,
  ladderVisibilityOptions,
  createEmptyMemberForm,
  parseIntegerField,
  parseOptionalIntegerField,
} from "./ladderFormState";
import {
  buildWizardPreviewModel,
  LADDER_WIZARD_STEP_ORDER,
  LADDER_WIZARD_STEPS,
  type LadderWizardStepId,
} from "./ladderWizardConfig";
type MemberPayload = {
  displayName: string;
  handle?: string | null;
  seed?: number | null;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
};
type AiPlanState = {
  reasoning?: string | null;
  prompt?: string | null;
  suggestions?: Array<{ id: string; title: string; summary: string; section?: string | null }>;
};
type LadderBlueprint = {
  ladder: {
    name: string;
    summary: string | null;
    visibility: "private" | "capsule" | "public";
    status: "draft" | "active" | "archived";
    publish: boolean;
    game: Record<string, unknown> | null;
    config: Record<string, unknown> | null;
    sections: Record<string, unknown> | null;
    aiPlan: Record<string, unknown> | null;
    meta: Record<string, unknown> | null;
  };
  members: Array<Record<string, unknown>>;
};
type LadderToast = {
  id: string;
  tone: AlertTone;
  title: string;
  description?: string;
  persist?: boolean;
};
type PersistedLadderDraft = {
  version: 1;
  updatedAt: number;
  form: FormState;
  members: LadderMemberFormValues[];
  seed: typeof defaultSeedForm;
  meta: Record<string, unknown>;
  activeStep: LadderWizardStepId;
};
type FormState = {
  name: string;
  summary: string;
  visibility: LadderVisibility;
  publish: boolean;
  sections: Record<SectionKey, LadderSectionFormValues>;
  customSections: LadderCustomSectionFormValues[];
  game: LadderGameFormValues;
  scoring: LadderScoringFormValues;
  schedule: LadderScheduleFormValues;
  registration: LadderRegistrationFormValues;
};
function createInitialFormState(): FormState {
  return {
    name: defaultBasicsForm.name,
    summary: defaultBasicsForm.summary ?? "",
    visibility: defaultBasicsForm.visibility,
    publish: defaultBasicsForm.publish,
    sections: defaultSectionsForm(),
    customSections: [],
    game: { ...defaultGameForm },
    scoring: { ...defaultScoringForm },
    schedule: { ...defaultScheduleForm },
    registration: { ...defaultRegistrationForm },
  };
}
function trimOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}
function normalizeMemberList(list: LadderMemberFormValues[]): LadderMemberFormValues[] {
  return list.map((member, index) => ({
    ...member,
    seed: member.seed.trim().length ? member.seed : String(index + 1),
    rating: member.rating.trim().length ? member.rating : "1200",
    wins: member.wins.trim().length ? member.wins : "0",
    losses: member.losses.trim().length ? member.losses : "0",
    draws: member.draws.trim().length ? member.draws : "0",
    streak: member.streak.trim().length ? member.streak : "0",
  }));
}

const streakLabel = (value: number): string => {
  if (Number.isNaN(value)) return "0";
  if (value > 0) return `+${value}`;
  return String(value);
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
  const [activeStep, setActiveStep] = React.useState<LadderWizardStepId>(DEFAULT_WIZARD_START_STEP);
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
  const [form, setForm] = React.useState<FormState>(createInitialFormState);
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
  const [toasts, setToasts] = React.useState<LadderToast[]>([]);
  const toastTimers = React.useRef<Record<string, number>>({});
  const offlineToastId = React.useRef<string | null>(null);
  const hasAnnouncedNetwork = React.useRef(false);
  const draftHydratedRef = React.useRef(false);
  const autosaveTimer = React.useRef<number | null>(null);
  const autosaveStartedAt = React.useRef<number | null>(null);
  const [draftStatus, setDraftStatus] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastDraftSavedAt, setLastDraftSavedAt] = React.useState<number | null>(null);
  const [draftRestoredAt, setDraftRestoredAt] = React.useState<number | null>(null);
  const [isGenerating, setGenerating] = React.useState(false);
  const [isSaving, setSaving] = React.useState(false);
  React.useEffect(() => {
    const capsuleId = selectedCapsuleId;
    const lastTracked = lastTrackedCapsuleRef.current;
    if (lastTracked === capsuleId && lastTracked !== "__init") {
      return;
    }
    lastTrackedCapsuleRef.current = capsuleId;
    const lifecycle = createWizardLifecycleState(activeStep);
    lifecycle.currentStepId = activeStep;
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
  }, [activeStep, capsuleList.length, draftRestoredAt, helperDensityVariant, metaVariant, selectedCapsuleId]);
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
  }, [activeStep]);
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
      pushToast({
        tone: "success",
        title: "Back online",
        description: "Publishing ladders and AI drafting are available again.",
      });
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
  const stepCompletion = React.useMemo<Record<LadderWizardStepId, boolean>>(() => {
    const result = {} as Record<LadderWizardStepId, boolean>;
    LADDER_WIZARD_STEPS.forEach((step) => {
      result[step.id] = step.completionCheck(wizardState);
    });
    return result;
  }, [wizardState]);
  const stepDefinitionMap = React.useMemo(() => {
    const map = new Map<LadderWizardStepId, (typeof LADDER_WIZARD_STEPS)[number]>();
    LADDER_WIZARD_STEPS.forEach((step) => {
      map.set(step.id, step);
    });
    return map;
  }, []);
  const currentStepIndex = React.useMemo(
    () => Math.max(0, LADDER_WIZARD_STEP_ORDER.indexOf(activeStep)),
    [activeStep],
  );
  React.useEffect(() => {
    const lifecycle = wizardLifecycleRef.current;
    const now = Date.now();
    lifecycle.currentStepId = activeStep;
    lifecycle.stepVisits[activeStep] = (lifecycle.stepVisits[activeStep] ?? 0) + 1;
    lifecycle.stepStartedAt[activeStep] = now;
    trackLadderEvent({
      event: "ladders.step.enter",
      capsuleId: selectedCapsuleId,
      payload: {
        stepId: activeStep,
        visit: lifecycle.stepVisits[activeStep],
        elapsedMs: msSince(lifecycle.wizardStartedAt),
        completion: stepCompletion[activeStep],
      },
    });
  }, [activeStep, selectedCapsuleId, stepCompletion]);
  const lastSavedMessage = React.useMemo(() => {
    if (!lastDraftSavedAt) return null;
    return `Last saved ${formatRelativeTime(new Date(lastDraftSavedAt).toISOString())}`;
  }, [lastDraftSavedAt]);
  const autosaveText = React.useMemo(() => {
    if (draftStatus === "saving") return "Autosaving draft...";
    if (draftStatus === "error") return "Autosave failed. Recent edits might not be stored.";
    return lastSavedMessage;
  }, [draftStatus, lastSavedMessage]);
  const canDiscardDraft = React.useMemo(
    () => Boolean(lastDraftSavedAt || draftRestoredAt),
    [lastDraftSavedAt, draftRestoredAt],
  );
  React.useEffect(() => {
    if (!draftStorageKey || draftHydratedRef.current || typeof window === "undefined") {
      return;
    }
    const raw = window.localStorage.getItem(draftStorageKey);
    draftHydratedRef.current = true;
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<PersistedLadderDraft>;
      if (parsed?.version !== 1) {
        window.localStorage.removeItem(draftStorageKey);
        return;
      }
      if (parsed.form && typeof parsed.form === "object") {
        const nextForm = parsed.form as Partial<FormState>;
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
      if (Array.isArray(parsed.members)) {
        setMembers(normalizeMemberList(parsed.members));
      }
      if (parsed.seed && typeof parsed.seed === "object") {
        setSeed({ ...defaultSeedForm, ...parsed.seed });
      }
      if (parsed.meta && typeof parsed.meta === "object") {
        setMeta((prev) => ({ ...prev, ...parsed.meta }));
      }
      if (parsed.activeStep && LADDER_WIZARD_STEP_ORDER.includes(parsed.activeStep)) {
        setActiveStep(parsed.activeStep);
      }
      const restoredAt = Date.now();
      setDraftStatus("saved");
      setLastDraftSavedAt(parsed.updatedAt ?? restoredAt);
      setDraftRestoredAt(restoredAt);
      pushToast({
        tone: "info",
        title: "Draft restored",
        description: "We loaded your latest ladder edits so you can pick up where you left off.",
      });
    } catch (error) {
      console.warn("Failed to restore ladder draft", error);
      window.localStorage.removeItem(draftStorageKey);
    }
  }, [draftStorageKey, pushToast]);
  React.useEffect(() => {
    if (!draftStorageKey || typeof window === "undefined" || !draftHydratedRef.current) {
      return;
    }
    setDraftStatus("saving");
    autosaveStartedAt.current =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    if (autosaveTimer.current) {
      window.clearTimeout(autosaveTimer.current);
    }
    autosaveTimer.current = window.setTimeout(() => {
      try {
        const payload: PersistedLadderDraft = {
          version: 1,
          updatedAt: Date.now(),
          form,
          members,
          seed,
          meta,
          activeStep,
        };
        window.localStorage.setItem(draftStorageKey, JSON.stringify(payload));
        setDraftStatus("saved");
        setLastDraftSavedAt(payload.updatedAt);
        const started = autosaveStartedAt.current;
        const latency =
          typeof started === "number"
            ? (typeof performance !== "undefined" && typeof performance.now === "function"
                ? performance.now()
                : Date.now()) - started
            : null;
        trackLadderEvent({
          event: "ladders.autosave.status",
          capsuleId: selectedCapsuleId,
          payload: {
            status: "saved",
            latencyMs: latency !== null ? Math.max(0, Math.round(latency)) : null,
          },
        });
        autosaveStartedAt.current = null;
      } catch (error) {
        console.warn("Failed to persist ladder draft", error);
        setDraftStatus("error");
        pushToast({
          tone: "danger",
          title: "Autosave failed",
          description: "We couldn't store the latest draft locally. Review your storage quota and try again.",
        });
        trackLadderEvent({
          event: "ladders.autosave.status",
          capsuleId: selectedCapsuleId,
          payload: { status: "error" },
        });
        autosaveStartedAt.current = null;
      }
    }, 900);
    return () => {
      if (autosaveTimer.current) {
        window.clearTimeout(autosaveTimer.current);
      }
      autosaveStartedAt.current = null;
    };
  }, [activeStep, draftStorageKey, form, members, meta, pushToast, seed, selectedCapsuleId]);
  const lastStepIndex = LADDER_WIZARD_STEP_ORDER.length - 1;
  const nextStepId = currentStepIndex < lastStepIndex ? LADDER_WIZARD_STEP_ORDER[currentStepIndex + 1] : null;
  const previousStepId = currentStepIndex > 0 ? LADDER_WIZARD_STEP_ORDER[currentStepIndex - 1] : null;
  const nextStep = nextStepId ? LADDER_WIZARD_STEPS.find((step) => step.id === nextStepId) ?? null : null;
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
  const goToStep = React.useCallback(
    (stepId: LadderWizardStepId) => {
      if (stepId === activeStep) return;
      const targetIndex = LADDER_WIZARD_STEP_ORDER.indexOf(stepId);
      if (targetIndex > currentStepIndex) {
        const valid = validateStep(activeStep, "jump");
        if (!valid) {
          return;
        }
      }
      setActiveStep(stepId);
      if (typeof window !== "undefined") {
        window.requestAnimationFrame(scrollToStepContent);
      }
    },
    [activeStep, currentStepIndex, scrollToStepContent, validateStep],
  );
  const handleNextStep = React.useCallback(() => {
    if (!nextStepId) return;
    const valid = validateStep(activeStep, "advance");
    if (!valid) return;
    setActiveStep(nextStepId as LadderWizardStepId);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(scrollToStepContent);
    }
  }, [activeStep, nextStepId, scrollToStepContent, validateStep]);
  const handlePreviousStep = React.useCallback(() => {
    if (!previousStepId) return;
    setActiveStep(previousStepId as LadderWizardStepId);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(scrollToStepContent);
    }
  }, [previousStepId, scrollToStepContent]);
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
  const handleSeedChange = React.useCallback((field: keyof typeof seed, value: string) => {
    setSeed((prev) => ({
      ...prev,
      [field]: value,
    }));
  }, []);
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
  const resetBuilderToDefaults = React.useCallback(() => {
    setForm(createInitialFormState());
    setMembers(defaultMembersForm());
    setAiPlan(null);
    setMeta({ variant: "ladder" });
    setSeed({ ...defaultSeedForm });
    setActiveStep(DEFAULT_WIZARD_START_STEP);
    setDraftStatus("idle");
    setLastDraftSavedAt(null);
    setDraftRestoredAt(null);
    wizardLifecycleRef.current = createWizardLifecycleState(DEFAULT_WIZARD_START_STEP);
  }, []);
  const handleDiscardDraft = React.useCallback(() => {
    if (!draftStorageKey || typeof window === "undefined") return;
    const confirmDiscard = window.confirm(
      "Discard the autosaved ladder draft? This clears your local changes.",
    );
    if (!confirmDiscard) return;
    window.localStorage.removeItem(draftStorageKey);
    resetBuilderToDefaults();
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
  }, [draftStorageKey, pushToast, resetBuilderToDefaults, selectedCapsuleId]);
  const applyBlueprint = React.useCallback((data: LadderBlueprint) => {
    const ladder = data.ladder;
    setForm((prev) => {
      const next = { ...prev };
      next.name = ladder.name ?? prev.name;
      next.summary = ladder.summary ?? "";
      next.visibility = ladder.visibility;
      next.publish = ladder.publish;
      const sections = ladder.sections && typeof ladder.sections === "object" ? ladder.sections : {};
      const updatedSections = defaultSectionsForm();
      SECTION_KEYS.forEach((key) => {
        const raw = (sections as Record<string, unknown>)[key];
        if (raw && typeof raw === "object") {
          const source = raw as Record<string, unknown>;
          updatedSections[key] = {
            title: typeof source.title === "string" ? source.title : updatedSections[key].title,
            body: typeof source.body === "string" ? source.body : "",
            bulletsText: Array.isArray(source.bulletPoints)
              ? (source.bulletPoints as unknown[])
                  .map((entry) => (typeof entry === "string" ? entry : ""))
                  .filter((entry) => entry.trim().length)
                  .join("\n")
              : "",
          };
        }
      });
      next.sections = updatedSections;
      const upcomingSection = updatedSections.upcoming;
      const hasUpcomingContent =
        Boolean(upcomingSection.body && upcomingSection.body.trim().length) ||
        Boolean(upcomingSection.bulletsText && upcomingSection.bulletsText.trim().length);
      if (hasUpcomingContent) {
        recordFirstChallenge("blueprint");
      }
      if (Array.isArray((sections as Record<string, unknown>).custom)) {
        const customList: LadderCustomSectionFormValues[] = [];
        ((sections as Record<string, unknown>).custom as unknown[]).forEach((entry, index) => {
          if (!entry || typeof entry !== "object") return;
          const block = entry as Record<string, unknown>;
          const title =
            typeof block.title === "string" && block.title.trim().length
              ? block.title
              : `Custom Section ${index + 1}`;
          const body = typeof block.body === "string" ? block.body : "";
          const bullets = Array.isArray(block.bulletPoints)
            ? (block.bulletPoints as unknown[])
                .map((b) => (typeof b === "string" ? b : ""))
                .filter((b) => b.trim().length)
                .join("\n")
            : "";
          const id =
            typeof block.id === "string" && block.id.trim().length
              ? block.id
              : typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `${Date.now()}-${index}`;
          customList.push({
            id,
            title,
            body,
            bulletsText: bullets,
          });
        });
        next.customSections = customList;
      } else {
        next.customSections = [];
      }
      const game = ladder.game && typeof ladder.game === "object" ? (ladder.game as Record<string, unknown>) : {};
      next.game = {
        title: typeof game.title === "string" ? game.title : prev.game.title,
        mode: typeof game.mode === "string" ? game.mode : "",
        platform: typeof game.platform === "string" ? game.platform : "",
        region: typeof game.region === "string" ? game.region : "",
      };
      const config = ladder.config && typeof ladder.config === "object" ? (ladder.config as Record<string, unknown>) : {};
      const scoring = config.scoring && typeof config.scoring === "object"
        ? (config.scoring as Record<string, unknown>)
        : {};
      next.scoring = {
        system:
          scoring.system === "points" || scoring.system === "custom" || scoring.system === "elo"
            ? (scoring.system as LadderScoringFormValues["system"])
            : prev.scoring.system,
        initialRating:
          typeof scoring.initialRating === "number"
            ? String(scoring.initialRating)
            : typeof scoring.initialRating === "string"
              ? scoring.initialRating
              : prev.scoring.initialRating,
        kFactor:
          typeof scoring.kFactor === "number"
            ? String(scoring.kFactor)
            : typeof scoring.kFactor === "string"
              ? scoring.kFactor
              : prev.scoring.kFactor,
        placementMatches:
          typeof scoring.placementMatches === "number"
            ? String(scoring.placementMatches)
            : typeof scoring.placementMatches === "string"
              ? scoring.placementMatches
              : prev.scoring.placementMatches,
        decayPerDay:
          typeof scoring.decayPerDay === "number"
            ? String(scoring.decayPerDay)
            : typeof scoring.decayPerDay === "string"
              ? scoring.decayPerDay
              : prev.scoring.decayPerDay ?? "",
        bonusForStreak:
          typeof scoring.bonusForStreak === "number"
            ? String(scoring.bonusForStreak)
            : typeof scoring.bonusForStreak === "string"
              ? scoring.bonusForStreak
              : prev.scoring.bonusForStreak ?? "",
      };
      const schedule = config.schedule && typeof config.schedule === "object"
        ? (config.schedule as Record<string, unknown>)
        : {};
      next.schedule = {
        cadence:
          typeof schedule.cadence === "string" && schedule.cadence.trim().length
            ? schedule.cadence
            : prev.schedule.cadence,
        kickoff:
          typeof schedule.kickoff === "string" && schedule.kickoff.trim().length
            ? schedule.kickoff
            : prev.schedule.kickoff,
        timezone: typeof schedule.timezone === "string" ? schedule.timezone : prev.schedule.timezone,
      };
      const registration = config.registration && typeof config.registration === "object"
        ? (config.registration as Record<string, unknown>)
        : {};
      const requirements =
        Array.isArray(registration.requirements) && registration.requirements.length
          ? (registration.requirements as unknown[])
              .map((entry) => (typeof entry === "string" ? entry : ""))
              .filter((entry) => entry.trim().length)
              .join("\n")
          : typeof registration.requirements === "string"
            ? registration.requirements
            : "";
      next.registration = {
        type:
          registration.type === "invite" || registration.type === "waitlist" ? registration.type : "open",
        maxTeams:
          typeof registration.maxTeams === "number"
            ? String(registration.maxTeams)
            : typeof registration.maxTeams === "string"
              ? registration.maxTeams
              : "",
        requirements,
        opensAt: typeof registration.opensAt === "string" ? registration.opensAt : prev.registration.opensAt ?? "",
        closesAt: typeof registration.closesAt === "string" ? registration.closesAt : prev.registration.closesAt ?? "",
      };
      return next;
    });
    const blueprintMembers: LadderMemberFormValues[] = [];
    data.members.forEach((entry, index) => {
      if (!entry || typeof entry !== "object") return;
      const record = entry as Record<string, unknown>;
      const displayName =
        typeof record.displayName === "string"
          ? record.displayName.trim()
          : typeof record.name === "string"
            ? record.name.trim()
            : "";
      if (!displayName.length) return;
      const handleValue =
        typeof record.handle === "string"
          ? record.handle.trim()
          : typeof record.gamertag === "string"
            ? record.gamertag.trim()
            : "";
      const seedRaw =
        typeof record.seed === "string" || typeof record.seed === "number"
          ? String(record.seed)
          : "";
      const ratingRaw =
        typeof record.rating === "string" || typeof record.rating === "number"
          ? String(record.rating)
          : "";
      const winsRaw =
        typeof record.wins === "string" || typeof record.wins === "number"
          ? String(record.wins)
          : "";
      const lossesRaw =
        typeof record.losses === "string" || typeof record.losses === "number"
          ? String(record.losses)
          : "";
      const drawsRaw =
        typeof record.draws === "string" || typeof record.draws === "number"
          ? String(record.draws)
          : "";
      const streakRaw =
        typeof record.streak === "string" || typeof record.streak === "number"
          ? String(record.streak)
          : "";
      const seedValue = parseOptionalIntegerField(seedRaw, { min: 1, max: 999 }) ?? index + 1;
      const member: LadderMemberFormValues = {
        displayName,
        handle: handleValue,
        seed: String(seedValue),
        rating: String(parseIntegerField(ratingRaw, 1200, { min: 100, max: 4000 })),
        wins: String(parseIntegerField(winsRaw, 0, { min: 0, max: 500 })),
        losses: String(parseIntegerField(lossesRaw, 0, { min: 0, max: 500 })),
        draws: String(parseIntegerField(drawsRaw, 0, { min: 0, max: 500 })),
        streak: String(parseIntegerField(streakRaw, 0, { min: -20, max: 20 })),
      };
      if (typeof record.id === "string" && record.id.trim().length) {
        member.id = record.id.trim();
      }
      blueprintMembers.push(member);
    });
    const normalized = normalizeMemberList(
      blueprintMembers.length ? blueprintMembers : [createEmptyMemberForm(0)],
    );
    setMembers(normalized);
    const plan = ladder.aiPlan && typeof ladder.aiPlan === "object" ? (ladder.aiPlan as Record<string, unknown>) : null;
    if (plan) {
      const suggestions = Array.isArray(plan.suggestions)
        ? (plan.suggestions as unknown[])
            .map((entry) => {
              if (!entry || typeof entry !== "object") return null;
              const record = entry as Record<string, unknown>;
              const title = typeof record.title === "string" ? record.title : null;
              const summary = typeof record.summary === "string" ? record.summary : null;
              if (!title || !summary) return null;
              return {
                id:
                  typeof record.id === "string" && record.id.trim().length
                    ? record.id
                    : crypto.randomUUID(),
                title,
                summary,
                section:
                  typeof record.section === "string" && record.section.trim().length
                    ? record.section
                    : null,
              };
            })
            .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
        : undefined;
      setAiPlan({
        reasoning: typeof plan.reasoning === "string" ? plan.reasoning : null,
        prompt: typeof plan.prompt === "string" ? plan.prompt : null,
        ...(suggestions ? { suggestions } : {}),
      });
    } else {
      setAiPlan(null);
    }
    const metaRecord =
      ladder.meta && typeof ladder.meta === "object" ? (ladder.meta as Record<string, unknown>) : null;
    setMeta(metaRecord ?? { variant: "ladder" });
    wizardLifecycleRef.current.blueprintApplied = true;
  }, [recordFirstChallenge]);
  React.useEffect(() => {
    void router;
  }, [router]);
  const convertSectionsToPayload = React.useCallback(() => {
    const sections: Record<string, unknown> = {};
    SECTION_KEYS.forEach((key) => {
      const section = form.sections[key];
      const title = section.title.trim().length ? section.title.trim() : key;
      const body = trimOrNull(section.body ?? "");
      const bulletPoints = (section.bulletsText ?? "")
        .split("\n")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length);
      const payload: Record<string, unknown> = {
        title,
        body,
      };
      if (bulletPoints.length) {
        payload.bulletPoints = bulletPoints;
      }
      sections[key] = payload;
    });
    if (form.customSections.length) {
      const customPayload = form.customSections
        .map((section) => {
          const title = section.title.trim().length ? section.title.trim() : "Custom Section";
          const body = trimOrNull(section.body ?? "");
          const bulletPoints = (section.bulletsText ?? "")
            .split("\n")
            .map((entry) => entry.trim())
            .filter((entry) => entry.length);
          const payload: Record<string, unknown> = {
            id: section.id,
            title,
            body,
          };
          if (bulletPoints.length) {
            payload.bulletPoints = bulletPoints;
          }
          return payload;
        })
        .filter(Boolean);
      if (customPayload.length) {
        sections.custom = customPayload;
      }
    }
    return sections;
  }, [form.customSections, form.sections]);
  const convertMembersToPayload = React.useCallback((): MemberPayload[] => {
    const payload: MemberPayload[] = [];
    members.forEach((member) => {
      const displayName = member.displayName.trim();
      if (!displayName.length) {
        return;
      }
      const handle = trimOrNull(member.handle ?? "");
      const seedValue = parseOptionalIntegerField(member.seed, { min: 1, max: 999 });
      const rating = parseIntegerField(member.rating, 1200, { min: 100, max: 4000 });
      const wins = parseIntegerField(member.wins, 0, { min: 0, max: 500 });
      const losses = parseIntegerField(member.losses, 0, { min: 0, max: 500 });
      const draws = parseIntegerField(member.draws, 0, { min: 0, max: 500 });
      const streak = parseIntegerField(member.streak, 0, { min: -20, max: 20 });
      const entry: MemberPayload = {
        displayName,
        rating,
        wins,
        losses,
        draws,
        streak,
      };
      if (handle) {
        entry.handle = handle;
      }
      if (seedValue !== null) {
        entry.seed = seedValue;
      }
      payload.push(entry);
    });
    return payload;
  }, [members]);
  const convertConfigToPayload = React.useCallback(() => {
    const initialRating = parseIntegerField(form.scoring.initialRating, 1200, {
      min: 100,
      max: 4000,
    });
    const kFactor = parseIntegerField(form.scoring.kFactor, 32, { min: 1, max: 128 });
    const placementMatches = parseIntegerField(form.scoring.placementMatches, 3, {
      min: 0,
      max: 20,
    });
    const maxTeams = parseOptionalIntegerField(form.registration.maxTeams, {
      min: 2,
      max: 999,
    });
    const requirements = (form.registration.requirements ?? "")
      .split("\n")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length);
    const registration: Record<string, unknown> = {
      type: form.registration.type,
      maxTeams: maxTeams ?? null,
    };
    if (requirements.length) {
      registration.requirements = requirements;
    }
    const cadenceValue = (form.schedule.cadence ?? "").trim();
    const kickoffValue = (form.schedule.kickoff ?? "").trim();
    const summary = form.summary.trim();
    const config: Record<string, unknown> = {
      scoring: {
        system: "elo",
        initialRating,
        kFactor,
        placementMatches,
      },
      schedule: {
        cadence: cadenceValue.length ? cadenceValue : "Weekly cadence",
        kickoff: kickoffValue.length ? kickoffValue : "TBD",
        timezone: trimOrNull(form.schedule.timezone ?? ""),
      },
      registration,
      communications: {
        announcementsCadence: "Weekly recap + midweek AI shoutouts",
      },
    };
    if (summary.length) {
      config.objectives = [summary];
    }
    return config;
  }, [form.registration, form.schedule, form.scoring, form.summary]);
  const convertGameToPayload = React.useCallback(() => {
    const { title, mode, platform, region } = form.game;
    const trimmedTitle = title.trim();
    return {
      title: trimmedTitle.length ? trimmedTitle : "Featured Game",
      mode: trimOrNull(mode ?? ""),
      platform: trimOrNull(platform ?? ""),
      region: trimOrNull(region ?? ""),
    };
  }, [form.game]);
  const generateDraft = React.useCallback(async () => {
    if (!selectedCapsule) {
      pushToast({
        tone: "warning",
        title: "Select a capsule",
        description: "Pick a capsule to ground the ladder plan before generating a draft.",
      });
      trackLadderEvent({
        event: "ladders.error.surface",
        payload: { context: "draft_generate", reason: "no_capsule" },
      });
      return;
    }
    if (!isOnline) {
      pushToast({
        tone: "warning",
        title: "Offline drafting unavailable",
        description: "Reconnect to use LadderForge drafting.",
      });
      trackLadderEvent({
        event: "ladders.error.surface",
        capsuleId: selectedCapsule.id,
        payload: { context: "draft_generate", reason: "offline" },
      });
      return;
    }
    setGenerating(true);
    try {
      const response = await fetch(`/api/capsules/${selectedCapsule.id}/ladders/draft`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          goal: seed.goal || undefined,
          audience: seed.audience || undefined,
          tone: seed.tone || undefined,
          capsuleBrief: seed.capsuleBrief || undefined,
          seasonLengthWeeks: seed.seasonLengthWeeks ? Number(seed.seasonLengthWeeks) : undefined,
          participants: seed.participants ? Number(seed.participants) : undefined,
          timezone: seed.timezone || undefined,
          registrationNotes: seed.registrationNotes || undefined,
          existingRules: seed.existingRules || undefined,
          notes: seed.notes || undefined,
          prizeIdeas: seed.prizeIdeas
            ? seed.prizeIdeas
                .split("\n")
                .map((entry) => entry.trim())
                .filter(Boolean)
            : undefined,
          announcementsFocus: seed.announcementsFocus
            ? seed.announcementsFocus
                .split("\n")
                .map((entry) => entry.trim())
                .filter(Boolean)
            : undefined,
          shoutouts: seed.shoutouts
            ? seed.shoutouts
                .split("\n")
                .map((entry) => entry.trim())
                .filter(Boolean)
            : undefined,
          game: {
            title: seed.gameTitle || undefined,
            mode: seed.gameMode || undefined,
            platform: seed.gamePlatform || undefined,
            region: seed.gameRegion || undefined,
          },
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message =
          payload?.error?.message ??
          payload?.message ??
          "We couldn't generate a ladder blueprint right now.";
        throw new Error(message);
      }
      const data = (await response.json()) as LadderBlueprint;
      applyBlueprint(data);
      pushToast({
        tone: "success",
        title: "Draft created",
        description: "Review the sections, roster, and config before publishing.",
      });
      trackLadderEvent({
        event: "ladders.draft.generate",
        capsuleId: selectedCapsule.id,
        payload: { status: "success", source: "ai_blueprint" },
      });
    } catch (error) {
      pushToast({
        tone: "danger",
        title: "Draft generation failed",
        description: (error as Error).message,
      });
      trackLadderEvent({
        event: "ladders.draft.generate",
        capsuleId: selectedCapsule.id,
        payload: { status: "error", message: (error as Error).message, source: "ai_blueprint" },
      });
    } finally {
      setGenerating(false);
    }
  }, [applyBlueprint, isOnline, pushToast, seed, selectedCapsule]);
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
        setActiveStep(stepId);
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
    const membersPayload = convertMembersToPayload();
    const gamePayload = convertGameToPayload();
    const configPayload = convertConfigToPayload();
    const sectionsPayload = convertSectionsToPayload();
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
    convertConfigToPayload,
    convertGameToPayload,
    convertMembersToPayload,
    convertSectionsToPayload,
    draftRestoredAt,
    form.name,
    form.publish,
    form.summary,
    form.visibility,
    helperDensityVariant,
    isOnline,
    meta,
    pushToast,
    router,
    selectedCapsule,
    validateStep,
  ]);
  const renderSeedForm = () => (
    <Card>
      <CardHeader>
        <CardTitle>AI Draft Brief</CardTitle>
        <CardDescription>
          Share goals and flavour - LadderForge will generate sections, rules, and a starter roster.
        </CardDescription>
      </CardHeader>
      <CardContent className={styles.cardContent}>
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="seed-goal">
            Primary goal
          </label>
          <textarea
            id="seed-goal"
            className={styles.textarea}
            value={seed.goal}
            onChange={(event) => handleSeedChange("goal", event.target.value)}
            placeholder="Keep members playing weekly, funnel scrim footage, spotlight upcoming talent..."
            rows={2}
          />
        </div>
        <div className={styles.fieldRow}>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="seed-audience">
              Audience
            </label>
            <Input
              id="seed-audience"
              value={seed.audience}
              onChange={(event) => handleSeedChange("audience", event.target.value)}
              placeholder="e.g. Platinum+ VALORANT roster, EU timezone, alumni captains"
            />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="seed-tone">
              Tone
            </label>
            <Input
              id="seed-tone"
              value={seed.tone}
              onChange={(event) => handleSeedChange("tone", event.target.value)}
              placeholder="Hype esports, supportive coaching, casual seasonal"
            />
          </div>
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="seed-brief">
            Capsule brief
          </label>
          <textarea
            id="seed-brief"
            className={styles.textarea}
            value={seed.capsuleBrief}
            onChange={(event) => handleSeedChange("capsuleBrief", event.target.value)}
            placeholder="Drop any context the AI should know about your community."
            rows={2}
          />
        </div>
        <div className={styles.fieldRow}>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="seed-season">
              Season length (weeks)
            </label>
            <Input
              id="seed-season"
              type="number"
              min={1}
              max={52}
              value={seed.seasonLengthWeeks}
              onChange={(event) => handleSeedChange("seasonLengthWeeks", event.target.value)}
              placeholder="6"
            />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="seed-participants">
              Target participants
            </label>
            <Input
              id="seed-participants"
              type="number"
              min={2}
              value={seed.participants}
              onChange={(event) => handleSeedChange("participants", event.target.value)}
              placeholder="32"
            />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="seed-timezone">
              Timezone / region
            </label>
            <Input
              id="seed-timezone"
              value={seed.timezone}
              onChange={(event) => handleSeedChange("timezone", event.target.value)}
              placeholder="NA / CET / LATAM ..."
            />
          </div>
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="seed-registration">
            Registration notes
          </label>
          <textarea
            id="seed-registration"
            className={styles.textarea}
            value={seed.registrationNotes}
            onChange={(event) => handleSeedChange("registrationNotes", event.target.value)}
            placeholder="e.g. Captains must confirm with screenshot, subs allowed once per stage..."
            rows={2}
          />
        </div>
        <div className={styles.fieldRow}>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="seed-game-title">
              Game / title
            </label>
            <Input
              id="seed-game-title"
              value={seed.gameTitle}
              onChange={(event) => handleSeedChange("gameTitle", event.target.value)}
              placeholder="Rocket League"
            />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="seed-game-mode">
              Mode
            </label>
            <Input
              id="seed-game-mode"
              value={seed.gameMode}
              onChange={(event) => handleSeedChange("gameMode", event.target.value)}
              placeholder="3v3, Ranked Competitive"
            />
          </div>
        </div>
        <div className={styles.fieldRow}>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="seed-game-platform">
              Platform
            </label>
            <Input
              id="seed-game-platform"
              value={seed.gamePlatform}
              onChange={(event) => handleSeedChange("gamePlatform", event.target.value)}
              placeholder="PC + Console cross-play"
            />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="seed-game-region">
              Region
            </label>
            <Input
              id="seed-game-region"
              value={seed.gameRegion}
              onChange={(event) => handleSeedChange("gameRegion", event.target.value)}
              placeholder="North America / Global"
            />
          </div>
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="seed-prizes">
            Prize ideas (one per line)
          </label>
          <textarea
            id="seed-prizes"
            className={styles.textarea}
            value={seed.prizeIdeas}
            onChange={(event) => handleSeedChange("prizeIdeas", event.target.value)}
            rows={2}
          />
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="seed-announcements">
            Announcement focus (one per line)
          </label>
          <textarea
            id="seed-announcements"
            className={styles.textarea}
            value={seed.announcementsFocus}
            onChange={(event) => handleSeedChange("announcementsFocus", event.target.value)}
            rows={2}
          />
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="seed-shoutouts">
            Shoutout themes (one per line)
          </label>
          <textarea
            id="seed-shoutouts"
            className={styles.textarea}
            value={seed.shoutouts}
            onChange={(event) => handleSeedChange("shoutouts", event.target.value)}
            rows={2}
          />
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="seed-existing">
            Existing rules to honour
          </label>
          <textarea
            id="seed-existing"
            className={styles.textarea}
            value={seed.existingRules}
            onChange={(event) => handleSeedChange("existingRules", event.target.value)}
            rows={2}
          />
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="seed-notes">
            Extra notes
          </label>
          <textarea
            id="seed-notes"
            className={styles.textarea}
            value={seed.notes}
            onChange={(event) => handleSeedChange("notes", event.target.value)}
            rows={2}
          />
        </div>
      <div id="step-review" />
      <div className={styles.actionsRow}>
          <Button type="button" onClick={generateDraft} disabled={isGenerating || !isOnline}>
            {isGenerating ? "Drafting..." : "Generate Ladder Plan"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
  const renderGeneralForm = () => (
    <Card>
      <CardHeader>
        <CardTitle>Basics & visibility</CardTitle>
        <CardDescription>Set the name, choose who can see it, and decide whether it saves live or as a draft.</CardDescription>
      </CardHeader>
      <CardContent className={styles.cardContent}>
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="ladder-name">
            Ladder name
          </label>
          <p id="ladder-name-hint" className={styles.fieldHint}>
            Use a clear, searchable title so teams recognize the ladder instantly.
          </p>
          <Input
            id="ladder-name"
            aria-describedby="ladder-name-hint"
            value={form.name}
            onChange={(event) => handleFormField("name", event.target.value)}
            placeholder="Community Champions S3"
          />
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="ladder-summary">
            Ladder summary
          </label>
          <p id="ladder-summary-hint" className={styles.fieldHint}>
            Summaries appear across Events. Keep it short and highlight the format or prize.
          </p>
          <textarea
            id="ladder-summary"
            className={styles.textarea}
            aria-describedby="ladder-summary-hint"
            value={form.summary}
            onChange={(event) => handleFormField("summary", event.target.value)}
            placeholder="AI-assisted ELO ladder with weekly spotlight challenges and top-4 finals."
            rows={3}
          />
        </div>
        <div className={styles.fieldRow}>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="ladder-visibility">
              Visibility
            </label>
            <p id="ladder-visibility-hint" className={styles.fieldHint}>
              Capsule keeps access limited to members; Public lets anyone view standings.
            </p>
            <select
              id="ladder-visibility"
              className={styles.select}
              aria-describedby="ladder-visibility-hint"
              value={form.visibility}
              onChange={(event) =>
                handleFormField("visibility", event.target.value as "private" | "capsule" | "public")
              }
            >
              <option value="capsule">Capsule members</option>
              <option value="private">Managers only (private draft)</option>
              <option value="public">Public showcase</option>
            </select>
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="ladder-publish">
              Publish now
            </label>
            <div className={styles.checkboxRow}>
              <input
                id="ladder-publish"
                type="checkbox"
                checked={form.publish}
                onChange={(event) => handleFormField("publish", event.target.checked)}
              />
              <span>Publish to Events tab after creation</span>
            </div>
            <p className={styles.fieldHint}>Leave unchecked to save a draft and publish later.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
  const renderSectionsForm = () => (
    <Card>
      <CardHeader>
        <CardTitle>Sections & copy</CardTitle>
        <CardDescription>Tailor the AI-generated sections before they hit your Events tab.</CardDescription>
      </CardHeader>
      <CardContent className={styles.cardContent}>
        <div className={styles.sectionGrid}>
          {SECTION_KEYS.map((key) => {
            const section = form.sections[key];
            return (
              <div key={key} className={styles.sectionCard}>
                <label className={styles.sectionLabel}>
                  <span>{section.title || key}</span>
                  <Input
                    value={section.title}
                    onChange={(event) => handleSectionChange(key, "title", event.target.value)}
                    placeholder="Section title"
                  />
                </label>
                <textarea
                  className={styles.textarea}
                  value={section.body ?? ""}
                  onChange={(event) => handleSectionChange(key, "body", event.target.value)}
                  placeholder="Narrative or summary copy. Markdown accepted."
                  rows={4}
                />
                <textarea
                  className={styles.textarea}
                  value={section.bulletsText ?? ""}
                  onChange={(event) => handleSectionChange(key, "bulletsText", event.target.value)}
                  placeholder="Bullet points (one per line)"
                  rows={3}
                />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
  const renderConfigForm = () => (
    <Card>
      <CardHeader>
        <CardTitle>Format & scoring</CardTitle>
        <CardDescription>Dial in the structure, cadence, and rating curve your players will feel each week.</CardDescription>
      </CardHeader>
      <CardContent className={styles.cardContent}>
        <div className={styles.fieldRow}>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="game-title">
              Game title
            </label>
            <Input
              id="game-title"
              value={form.game.title}
              onChange={(event) => handleGameChange("title", event.target.value)}
            />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="game-mode">
              Mode / Format
            </label>
            <Input
              id="game-mode"
              value={form.game.mode}
              onChange={(event) => handleGameChange("mode", event.target.value)}
            />
          </div>
        </div>
        <div className={styles.fieldRow}>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="game-platform">
              Platform
            </label>
            <Input
              id="game-platform"
              value={form.game.platform}
              onChange={(event) => handleGameChange("platform", event.target.value)}
            />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="game-region">
              Region
            </label>
            <Input
              id="game-region"
              value={form.game.region}
              onChange={(event) => handleGameChange("region", event.target.value)}
            />
          </div>
        </div>
        <div className={styles.fieldRow}>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="scoring-rating">
              Initial rating
            </label>
            <Input
              id="scoring-rating"
              type="number"
              value={form.scoring.initialRating}
              onChange={(event) => handleScoringChange("initialRating", event.target.value)}
            />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="scoring-kfactor">
              K-Factor
            </label>
            <Input
              id="scoring-kfactor"
              type="number"
              value={form.scoring.kFactor}
              onChange={(event) => handleScoringChange("kFactor", event.target.value)}
            />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="scoring-placement">
              Placement matches
            </label>
            <Input
              id="scoring-placement"
              type="number"
              value={form.scoring.placementMatches}
              onChange={(event) => handleScoringChange("placementMatches", event.target.value)}
            />
          </div>
        </div>
        <p className={styles.fieldHint}>
          Tune{" "}
          <abbr
            className={styles.helperAbbr}
            title="ELO calibrates skill after each match. Stick near 1200 unless your ladder already has historical data."
          >
            ELO
          </abbr>{" "}
          and{" "}
          <abbr
            className={styles.helperAbbr}
            title="K-Factor controls how much ratings swing per match. Higher numbers boost volatility."
          >
            K-Factor
          </abbr>{" "}
          before adjusting placement games or decay.
        </p>
        <div className={styles.fieldRow}>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="schedule-cadence">
              Cadence
            </label>
            <Input
              id="schedule-cadence"
              value={form.schedule.cadence}
              onChange={(event) => handleScheduleChange("cadence", event.target.value)}
            />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="schedule-kickoff">
              Kickoff window
            </label>
            <Input
              id="schedule-kickoff"
              value={form.schedule.kickoff}
              onChange={(event) => handleScheduleChange("kickoff", event.target.value)}
            />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="schedule-timezone">
              Timezone
            </label>
            <Input
              id="schedule-timezone"
              value={form.schedule.timezone}
              onChange={(event) => handleScheduleChange("timezone", event.target.value)}
            />
          </div>
        </div>
        <div className={styles.fieldRow}>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="registration-type">
              Registration type
            </label>
            <select
              id="registration-type"
              className={styles.select}
              value={form.registration.type}
              onChange={(event) =>
                handleRegistrationChange("type", event.target.value as LadderRegistrationFormValues["type"])
              }
            >
              <option value="open">Open sign-ups</option>
              <option value="invite">Moderated invites</option>
              <option value="waitlist">Waitlist</option>
            </select>
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="registration-max">
              Max teams / players
            </label>
            <Input
              id="registration-max"
              type="number"
              value={form.registration.maxTeams}
              onChange={(event) => handleRegistrationChange("maxTeams", event.target.value)}
            />
          </div>
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="registration-reqs">
            Requirements (one per line)
          </label>
          <textarea
            id="registration-reqs"
            className={styles.textarea}
            value={form.registration.requirements}
            onChange={(event) => handleRegistrationChange("requirements", event.target.value)}
            rows={3}
          />
        </div>
      </CardContent>
    </Card>
  );
  const renderMembersForm = () => (
    <Card>
      <CardHeader>
        <CardTitle>Roster seeds & stats</CardTitle>
        <CardDescription>Log the headline squads, their handles, and starting records. Leave blanks if you plan to onboard later.</CardDescription>
      </CardHeader>
      <CardContent className={styles.cardContent}>
        <p className={styles.fieldHint}>
          <abbr
            className={styles.helperAbbr}
            title="ELO updates player skill after every match. Keep new ladders near 1200 and adjust with K-factor for larger swings."
          >
            ELO
          </abbr>{" "}
          feeds highlight badges alongside{" "}
          <abbr
            className={styles.helperAbbr}
            title="Streak counts consecutive wins so you can spotlight hot runs."
          >
            streak
          </abbr>{" "}
          momentum.
        </p>
        <div className={styles.membersTableWrap}>
          <table className={styles.membersTable}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Handle</th>
                <th>Seed</th>
                <th>Rating</th>
                <th>W</th>
                <th>L</th>
                <th>Draw</th>
                <th>Streak</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {members.map((member, index) => {
                const accent = getIdentityAccent(
                  member.displayName || member.handle || `Seed ${index + 1}`,
                  index,
                );
                const accentStyle = {
                  "--identity-color": accent.primary,
                  "--identity-glow": accent.glow,
                  "--identity-border": accent.border,
                  "--identity-surface": accent.surface,
                  "--identity-text": accent.text,
                } as React.CSSProperties;
                return (
                  <tr key={member.id ?? `member-${index}`}>
                    <td>
                      <div className={styles.memberField}>
                        <span className={styles.memberAvatar} style={accentStyle}>
                          <span className={styles.memberAvatarText}>{accent.initials}</span>
                        </span>
                        <Input
                          id={`member-name-${index}`}
                          value={member.displayName}
                          onChange={(event) =>
                            handleMemberField(index, "displayName", event.target.value)}
                          placeholder="Player name"
                        />
                      </div>
                    </td>
                    <td>
                      <Input
                        id={`member-handle-${index}`}
                        value={member.handle}
                        onChange={(event) => handleMemberField(index, "handle", event.target.value)}
                        placeholder="@handle"
                      />
                    </td>
                    <td>
                      <Input
                        id={`member-seed-${index}`}
                        value={member.seed}
                        onChange={(event) => handleMemberField(index, "seed", event.target.value)}
                      />
                    </td>
                    <td>
                      <Input
                        id={`member-rating-${index}`}
                        value={member.rating}
                        onChange={(event) => handleMemberField(index, "rating", event.target.value)}
                      />
                    </td>
                    <td>
                      <Input
                        id={`member-wins-${index}`}
                        value={member.wins}
                        onChange={(event) => handleMemberField(index, "wins", event.target.value)}
                      />
                    </td>
                    <td>
                      <Input
                        id={`member-losses-${index}`}
                        value={member.losses}
                        onChange={(event) => handleMemberField(index, "losses", event.target.value)}
                      />
                    </td>
                    <td>
                      <Input
                        id={`member-draws-${index}`}
                        value={member.draws}
                        onChange={(event) => handleMemberField(index, "draws", event.target.value)}
                      />
                    </td>
                    <td>
                      <Input
                        id={`member-streak-${index}`}
                        value={member.streak}
                        onChange={(event) => handleMemberField(index, "streak", event.target.value)}
                      />
                    </td>
                    <td className={styles.memberActions}>
                      <span className={styles.memberChip} style={accentStyle}>
                        Seed {member.seed || index + 1}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeMember(index)}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Button type="button" variant="secondary" onClick={addMember}>
          Add member
        </Button>
      </CardContent>
    </Card>
  );
  const renderAiPlan = () =>
    aiPlan ? (
      <Card>
        <CardHeader>
          <CardTitle>AI notes</CardTitle>
          <CardDescription>Save for internal planning or next iteration prompts.</CardDescription>
        </CardHeader>
        <CardContent className={styles.cardContent}>
          {aiPlan.reasoning ? (
            <div className={styles.aiReasoning}>
              <strong>Why this plan works</strong>
              <p>{aiPlan.reasoning}</p>
            </div>
          ) : null}
          {aiPlan.suggestions && aiPlan.suggestions.length ? (
            <div className={styles.aiSuggestions}>
              <strong>Suggested improvements</strong>
              <ul>
                {aiPlan.suggestions.map((suggestion) => (
                  <li key={suggestion.id}>
                    <span>{suggestion.title} - </span>
                    <span>{suggestion.summary}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>
    ) : null;
  const renderReviewOverview = () => {
    const visibility = ladderVisibilityOptions.find((option) => option.value === form.visibility);
    const stats = [
      { label: "Capsule", value: selectedCapsule?.name ?? "Select a capsule" },
      { label: "Visibility", value: visibility?.label ?? form.visibility },
      { label: "Status on save", value: form.publish ? "Publish immediately" : "Save as draft" },
      {
        label: "Participants",
        value: members.length ? `${members.length} seeded` : "Add at least one team or player",
      },
      { label: "Sections ready", value: previewModel.sections.length },
    ];
    return (
      <Card>
        <CardHeader>
          <CardTitle>Review launch settings</CardTitle>
          <CardDescription>Confirm the key details before saving or publishing.</CardDescription>
        </CardHeader>
        <CardContent className={styles.cardContent}>
          <dl className={styles.reviewList}>
            {stats.map((stat) => (
              <div key={stat.label} className={styles.reviewRow}>
                <dt>{stat.label}</dt>
                <dd>{stat.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    );
  };
  const renderStepContent = () => {
    switch (activeStep) {
      case "basics":
        return renderGeneralForm();
      case "seed":
        return renderSeedForm();
      case "sections":
        return renderSectionsForm();
      case "format":
        return renderConfigForm();
      case "roster":
        return renderMembersForm();
      case "review":
        return (
          <>
            {renderReviewOverview()}
            {renderAiPlan()}
          </>
        );
      default:
        return null;
    }
  };
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
      <div className={styles.pageGrid}>
        <aside className={styles.stepperCol}>
          <div className={styles.stepperShell}>
            <div className={styles.stepperHeading}>
              <h2>Ladder wizard</h2>
              <p>Guide creators from idea to live ladder in a few focused steps.</p>
            </div>
            <ol className={styles.stepList}>
              {LADDER_WIZARD_STEPS.map((step, index) => {
                const isActive = step.id === activeStep;
                const isComplete = stepCompletion[step.id];
                const stepButtonClass = [
                  styles.stepButton,
                  isActive ? styles.stepButtonActive : "",
                  isComplete ? styles.stepButtonComplete : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                const stepIndexClass = [
                  styles.stepIndex,
                  isActive ? styles.stepIndexActive : "",
                  isComplete ? styles.stepIndexComplete : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <li key={step.id}>
                    <button
                      type="button"
                      onClick={() => goToStep(step.id)}
                      className={stepButtonClass}
                      aria-current={isActive ? "step" : undefined}
                      aria-label={`Step ${index + 1}: ${step.title}${isActive ? " (current)" : isComplete ? " (completed)" : ""}`}
                    >
                      <span className={stepIndexClass}>{index + 1}</span>
                      <span className={styles.stepCopy}>
                        <span className={styles.stepTitle}>{step.title}</span>
                        <span className={styles.stepSubtitle}>{step.subtitle}</span>
                      </span>
                      <span className={styles.stepStatus} aria-hidden="true">
                        {isComplete ? "\u2713" : isActive ? "\u2192" : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </aside>
        <div className={styles.formCol}>
          <div className={styles.selectedCapsuleBanner}>
            <div>
              <div className={styles.capsuleLabel}>Capsule</div>
              <div className={styles.capsuleName}>{selectedCapsule.name}</div>
            </div>
            <Button type="button" variant="ghost" onClick={() => handleCapsuleChange(null)}>
              Switch capsule
            </Button>
          </div>
          {toasts.length ? (
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
          ) : null}
          {autosaveText || canDiscardDraft ? (
            <div className={styles.autosaveMeta} role="status" aria-live="polite">
              <span>{autosaveText ?? "Draft ready"}</span>
              {canDiscardDraft ? (
                <button type="button" className={styles.linkButton} onClick={handleDiscardDraft}>
                  Discard draft
                </button>
              ) : null}
            </div>
          ) : null}
          <div
            ref={formContentRef}
            className={styles.stepStack}
            aria-live="polite"
            role="region"
            tabIndex={-1}
          >
            {renderStepContent()}
          </div>
          <div className={styles.stepControls} aria-label="Step controls">
            <Button type="button" variant="ghost" onClick={handlePreviousStep} disabled={!previousStepId}>
              Back
            </Button>
            {activeStep !== "review" ? (
              <Button type="button" onClick={handleNextStep} disabled={!nextStepId}>
                {nextStep ? `Next: ${nextStep.title}` : "Next"}
              </Button>
            ) : (
              <Button type="button" onClick={createLadder} disabled={isSaving || !isOnline}>
                {isSaving ? "Saving ladder..." : form.publish ? "Publish ladder" : "Save ladder draft"}
              </Button>
            )}
          </div>
        </div>
        <aside className={styles.previewCol}>
          <div className={styles.previewShell}>
            <div className={styles.previewHeading}>
              <h3>Live preview</h3>
              <p>See how capsule members will experience this ladder.</p>
            </div>
            {renderPreviewPanel()}
          </div>
        </aside>
      </div>
    </div>
  );
}
