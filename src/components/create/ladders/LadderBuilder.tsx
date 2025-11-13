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
import { AiPlanCard } from "./components/AiPlanCard";
import { ReviewOverviewCard } from "./components/ReviewOverviewCard";
import { RosterStep } from "./components/RosterStep";
import { WizardLayout } from "./components/WizardLayout";
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
type LadderToast = {
  id: string;
  tone: AlertTone;
  title: string;
  description?: string;
  persist?: boolean;
};
type GuidedStepId =
  | "title"
  | "summary"
  | "registration"
  | "type"
  | "format"
  | "overview"
  | "rules"
  | "shoutouts"
  | "timeline"
  | "roster"
  | "rewards"
  | "review";
type GuidedStepDefinition = {
  id: GuidedStepId;
  title: string;
  subtitle: string;
  helper: string;
};
type LadderTemplatePreset = {
  id: string;
  label: string;
  description: string;
  mode: string;
  cadence: string;
  kickoff: string;
  summary: string;
};
const GUIDED_STEP_DEFINITIONS: GuidedStepDefinition[] = [
  {
    id: "title",
    title: "Name & vibe",
    subtitle: "Give the ladder an identity challengers can rally around.",
    helper: 'Short, ownable names work best. Think "{Capsule} Clash" or "Weekend Gauntlet".',
  },
  {
    id: "summary",
    title: "One-line summary",
    subtitle: "Explain why this ladder matters in a single sentence.",
    helper: "Highlight audience, cadence, or prizes so Capsule AI can build the promo copy.",
  },
  {
    id: "registration",
    title: "Registration",
    subtitle: "Choose how teams join and set limits.",
    helper: "Capsule uses this for funnel copy, invite buttons, and reminders.",
  },
  {
    id: "type",
    title: "Ladder type",
    subtitle: "Tell Capsule what kind of competition this is.",
    helper: "Pick the match style and platform so we can pre-fill the format metadata.",
  },
  {
    id: "format",
    title: "Format basics",
    subtitle: "Dial in the rating defaults and placement matches.",
    helper: "Initial rating, K-factor, and placement games help Capsule guide skill progression.",
  },
  {
    id: "overview",
    title: "Ladder overview",
    subtitle: "Describe the story, vibe, or stakes.",
    helper: "This becomes the hero copy on Capsules and invites, so keep it vivid and specific.",
  },
  {
    id: "rules",
    title: "Rules snapshot",
    subtitle: "Lay down the essentials players need to know.",
    helper: "Capsule AI will automate the long-form version; just note the must-follow items.",
  },
  {
    id: "shoutouts",
    title: "Shoutouts & highlights",
    subtitle: "Collect story hooks, MVPs, or spotlight moments.",
    helper: "Use bullets for themes (e.g. clutch saves, top fraggers) so AI recaps can riff on them.",
  },
  {
    id: "timeline",
    title: "Timeline",
    subtitle: "Share when the ladder runs and how often matches happen.",
    helper: "We'll use this for reminders, recap pacing, and calendar tooling.",
  },
  {
    id: "roster",
    title: "Starter roster",
    subtitle: "Set seeds, handles, and starting stats.",
    helper: "Edit each row directly. Capsule highlights ratings and streaks in the preview.",
  },
  {
    id: "rewards",
    title: "Rewards & spotlight",
    subtitle: "Tell challengers what they're chasing.",
    helper: "Capsule AI can hype prizes, shoutouts, or story beats in announcements.",
  },
  {
    id: "review",
    title: "Review & publish",
    subtitle: "Double-check visibility and go live when you're ready.",
    helper: "You can still switch back to manual fields if you want the power user view.",
  },
];
const GUIDED_STEP_ORDER = GUIDED_STEP_DEFINITIONS.map((step) => step.id);
const GUIDED_STEP_MAP = new Map<GuidedStepId, GuidedStepDefinition>(
  GUIDED_STEP_DEFINITIONS.map((step) => [step.id, step]),
);
const DEFAULT_GUIDED_STEP: GuidedStepId = GUIDED_STEP_ORDER[0] ?? "title";
const RULE_SNIPPETS = [
  "Matches are best-of-three. Screenshot every result.",
  "Captains have 48 hours to play once a match post goes live.",
  "Subs are allowed but must be reported before kickoff.",
  "Report disputes in #match-review with evidence.",
];
const REWARD_SNIPPETS = [
  "Top 3 earn featured posts across Capsule Events.",
  "Weekly MVP gets a custom Capsule portrait.",
  "Winners snag merch codes + priority scrim slots.",
  "Perfect records unlock an interview with the Capsule host.",
];
const LADDER_TEMPLATE_PRESETS: LadderTemplatePreset[] = [
  {
    id: "solo-duel",
    label: "Solo Duel Ladder",
    description: "1v1 clashes, quick bragging rights.",
    mode: "1v1 Duels",
    cadence: "Daily windows",
    kickoff: "Match anytime within 24h",
    summary: "Solo players queue up head-to-head duels with instant ELO updates.",
  },
  {
    id: "squad-gauntlet",
    label: "Squad Gauntlet",
    description: "Teams rotate weekly spotlight challenges.",
    mode: "3v3 Teams",
    cadence: "Weekly rounds",
    kickoff: "Thursdays 7 PM local",
    summary: "Squads tackle curated challenges each week with Capsule shoutouts.",
  },
  {
    id: "creator-circuit",
    label: "Creator Circuit",
    description: "Open ladder with stream-ready prompts.",
    mode: "Open queue",
    cadence: "Weekend sprint",
    kickoff: "Saturday block",
    summary: "Creators drop-in for highlight-driven matches with AI-scripted recaps.",
  },
];
const buildGuidedNameIdeas = (capsuleName?: string | null, gameTitle?: string): string[] => {
  const base = (capsuleName ?? "Capsule").trim() || "Capsule";
  const game = (gameTitle ?? "").trim() || "Open";
  const stem = `${base} ${game}`.trim();
  return [
    `${stem} Ladder`,
    `${base} ${game} Gauntlet`,
    `${game} Spotlight Series`,
  ];
};
const buildGuidedSummaryIdeas = (options: {
  capsuleName?: string | null;
  gameTitle?: string;
  cadence?: string;
  rewardsFocus?: string;
}): string[] => {
  const capsule = (options.capsuleName ?? "the capsule community").trim();
  const game = (options.gameTitle ?? "your game").trim() || "your game";
  const cadence = (options.cadence ?? "weekly rounds").trim() || "weekly rounds";
  const rewards = (options.rewardsFocus ?? "spotlight shoutouts").trim() || "spotlight shoutouts";
  return [
    `${capsule} runs a ${cadence} ${game} ladder with Capsule AI covering every upset.`,
    `${game} challengers climb fast seasons, win ${rewards}, and get auto-generated recaps.`,
  ];
};
type PersistedLadderDraft = {
  version: 1;
  updatedAt: number;
  form: FormState;
  members: LadderMemberFormValues[];
  seed: typeof defaultSeedForm;
  meta: Record<string, unknown>;
  guidedStep?: GuidedStepId;
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
  const draftHydratedRef = React.useRef(false);
  const autosaveTimer = React.useRef<number | null>(null);
  const autosaveStartedAt = React.useRef<number | null>(null);
  const [draftStatus, setDraftStatus] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastDraftSavedAt, setLastDraftSavedAt] = React.useState<number | null>(null);
  const [draftRestoredAt, setDraftRestoredAt] = React.useState<number | null>(null);
  const [isSaving, setSaving] = React.useState(false);
  const [guidedStep, setGuidedStep] = React.useState<GuidedStepId>(DEFAULT_GUIDED_STEP);
  const [assistantDraft, setAssistantDraft] = React.useState("");
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
      if (
        parsed.guidedStep &&
        typeof parsed.guidedStep === "string" &&
        GUIDED_STEP_ORDER.includes(parsed.guidedStep as GuidedStepId)
      ) {
        setGuidedStep(parsed.guidedStep as GuidedStepId);
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
          guidedStep,
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
  }, [draftStorageKey, form, guidedStep, members, meta, pushToast, seed, selectedCapsuleId]);
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
  const handleSeedChange = React.useCallback((field: keyof typeof seed, value: string) => {
    setSeed((prev) => ({
      ...prev,
      [field]: value,
    }));
  }, []);
  const handleAssistantSend = React.useCallback(() => {
    const message = assistantDraft.trim();
    if (!message.length) {
      pushToast({
        tone: "info",
        title: "Describe the vibe",
        description: "Tell Capsule how you want the ladder to sound and we'll riff on names.",
      });
      return;
    }
    const suggestionPool = [
      ...guidedNameIdeas,
      `${message} Ladder`.trim(),
      `${message} Circuit`.trim(),
    ].filter((entry) => entry.length);
    const suggestion = suggestionPool[Math.floor(Math.random() * suggestionPool.length)] ?? null;
    if (!suggestion) {
      pushToast({
        tone: "info",
        title: "Need one more detail",
        description: "Add a note about the mood or stakes so Capsule can suggest a name.",
      });
      return;
    }
    handleFormField("name", suggestion);
    pushToast({
      tone: "success",
      title: "Capsule suggested a name",
      description: suggestion,
    });
    setAssistantDraft("");
  }, [assistantDraft, guidedNameIdeas, handleFormField, pushToast]);
  const handleAssistantKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
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
  const resetBuilderToDefaults = React.useCallback(() => {
    setForm(createInitialFormState());
    setMembers(defaultMembersForm());
    setAiPlan(null);
    setMeta({ variant: "ladder" });
    setSeed({ ...defaultSeedForm });
    setGuidedStep(DEFAULT_GUIDED_STEP);
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
  const renderAutosaveMeta = () =>
    autosaveText || canDiscardDraft ? (
      <div className={styles.autosaveMeta} role="status" aria-live="polite">
        <span>{autosaveText ?? "Draft ready"}</span>
        {canDiscardDraft ? (
          <button type="button" className={styles.linkButton} onClick={handleDiscardDraft}>
            Discard draft
          </button>
        ) : null}
      </div>
    ) : null;
  const renderGuidedChatCard = React.useCallback(
    (config: { title: string; helper: string; placeholder: string }) => (
      <Card className={styles.chatCard}>
        <CardHeader>
          <CardTitle>{config.title}</CardTitle>
          <CardDescription>{config.helper}</CardDescription>
        </CardHeader>
        <CardContent className={styles.cardContent}>
          <div className={styles.chatHistory}>
            <div className={styles.chatBubble}>
              <span className={styles.chatBubbleLabel}>Capsule AI</span>
              <p>I can riff on names, rules, rewards, or anything else you need for this step.</p>
            </div>
          </div>
          <div className={styles.chatComposer}>
            <Input
              value={assistantDraft}
              onChange={(event) => setAssistantDraft(event.target.value)}
              onKeyDown={handleAssistantKeyDown}
              placeholder={config.placeholder}
            />
            <Button type="button" variant="secondary" onClick={handleAssistantSend}>
              Send
            </Button>
          </div>
        </CardContent>
      </Card>
    ),
    [assistantDraft, handleAssistantKeyDown, handleAssistantSend, setAssistantDraft],
  );
  const renderGuidedStepContent = () => {
    switch (guidedStep) {
      case "title":
        return (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Pick a title</CardTitle>
                <CardDescription>Show the season energy. Chip suggestions update as you edit.</CardDescription>
              </CardHeader>
              <CardContent className={styles.cardContent}>
                <div className={styles.fieldGroup}>
                  <label className={styles.label} htmlFor="guided-name">
                    Ladder title
                  </label>
                  <Input
                    id="guided-name"
                    value={form.name}
                    onChange={(event) => handleFormField("name", event.target.value)}
                    placeholder="Nova Circuit Season"
                  />
                </div>
                <div className={styles.pillGroup}>
                  {guidedNameIdeas.map((idea) => (
                    <button
                      key={idea}
                      type="button"
                      className={styles.pillButton}
                      onClick={() => handleFormField("name", idea)}
                    >
                      {idea}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
            {renderGuidedChatCard({
              title: "Need help naming it?",
              helper: "Tell Capsule the vibe and we'll suggest names instantly.",
              placeholder: "Describe the mood, stakes, or rewards...",
            })}
          </>
        );
      case "summary":
        return (
          <>
            <Card>
              <CardHeader>
                <CardTitle>One-line summary</CardTitle>
                <CardDescription>Appears anywhere this ladder is referenced inside Capsule.</CardDescription>
              </CardHeader>
              <CardContent className={styles.cardContent}>
                <textarea
                  id="guided-summary"
                  className={styles.textarea}
                  value={form.summary}
                  onChange={(event) => handleFormField("summary", event.target.value)}
                  rows={3}
                  placeholder="Weekly Rocket League duels with Capsule AI recaps + spotlight prizes."
                />
                <div className={styles.pillGroup}>
                  {guidedSummaryIdeas.map((idea) => (
                    <button
                      key={idea}
                      type="button"
                      className={styles.pillButton}
                      onClick={() => handleFormField("summary", idea)}
                    >
                      {idea}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        );
      case "registration":
        return (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Registration</CardTitle>
                <CardDescription>Decide how teams join and any launch requirements.</CardDescription>
              </CardHeader>
              <CardContent className={styles.cardContent}>
                <div className={styles.fieldRow}>
                  <div className={styles.fieldGroup}>
                    <label className={styles.label} htmlFor="guided-registration-type">
                      Registration type
                    </label>
                    <select
                      id="guided-registration-type"
                      className={styles.select}
                      value={form.registration.type}
                      onChange={(event) =>
                        handleRegistrationChange(
                          "type",
                          event.target.value as LadderRegistrationFormValues["type"],
                        )
                      }
                    >
                      <option value="open">Open sign-ups</option>
                      <option value="invite">Moderated invites</option>
                      <option value="waitlist">Waitlist</option>
                    </select>
                  </div>
                  <div className={styles.fieldGroup}>
                    <label className={styles.label} htmlFor="guided-max-teams">
                      Max teams / players
                    </label>
                    <Input
                      id="guided-max-teams"
                      type="number"
                      value={form.registration.maxTeams}
                      onChange={(event) => handleRegistrationChange("maxTeams", event.target.value)}
                      placeholder="32"
                    />
                  </div>
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.label} htmlFor="guided-registration-reqs">
                    Requirements (one per line)
                  </label>
                  <textarea
                    id="guided-registration-reqs"
                    className={styles.textarea}
                    value={form.registration.requirements}
                    onChange={(event) => handleRegistrationChange("requirements", event.target.value)}
                    rows={3}
                    placeholder={"Captains must confirm by Wednesday\nSubs allowed after week 2\nScreenshots required"}
                  />
                </div>
              </CardContent>
            </Card>
          </>
        );
      case "type":
        return (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Game & ladder type</CardTitle>
                <CardDescription>Capsule AI uses this to suggest rules, playlists, and stats.</CardDescription>
              </CardHeader>
              <CardContent className={styles.cardContent}>
                <div className={styles.fieldGroup}>
                  <label className={styles.label} htmlFor="guided-game-title">
                    Game or title
                  </label>
                  <Input
                    id="guided-game-title"
                    value={form.game.title}
                    onChange={(event) => handleGameChange("title", event.target.value)}
                    placeholder="Rocket League"
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.label} htmlFor="guided-game-mode">
                    Format
                  </label>
                  <Input
                    id="guided-game-mode"
                    value={form.game.mode}
                    onChange={(event) => handleGameChange("mode", event.target.value)}
                    placeholder="1v1 Duels"
                  />
                </div>
                <div className={styles.fieldRow}>
                  <div className={styles.fieldGroup}>
                    <label className={styles.label} htmlFor="guided-platform">
                      Platform
                    </label>
                    <Input
                      id="guided-platform"
                      value={form.game.platform ?? ""}
                      onChange={(event) => handleGameChange("platform", event.target.value)}
                      placeholder="Cross-play"
                    />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label className={styles.label} htmlFor="guided-region">
                      Region
                    </label>
                    <Input
                      id="guided-region"
                      value={form.game.region ?? ""}
                      onChange={(event) => handleGameChange("region", event.target.value)}
                      placeholder="NA / EU"
                    />
                  </div>
                </div>
                <div className={styles.templateGrid}>
                  {LADDER_TEMPLATE_PRESETS.map((preset) => {
                    const isActive = guidedTemplateId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        className={styles.templateButton}
                        data-state={isActive ? "active" : "idle"}
                        onClick={() => applyTemplatePreset(preset)}
                      >
                        <strong>{preset.label}</strong>
                        <span>{preset.description}</span>
                        <span className={styles.templateMeta}>{preset.mode}</span>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </>
        );
      case "format":
        return (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Format basics</CardTitle>
                <CardDescription>Set the starting rating, K-factor, and placement matches.</CardDescription>
              </CardHeader>
              <CardContent className={styles.cardContent}>
                <div className={styles.fieldRow}>
                  <div className={styles.fieldGroup}>
                    <label className={styles.label} htmlFor="guided-initial-rating">
                      Initial rating
                    </label>
                    <Input
                      id="guided-initial-rating"
                      type="number"
                      value={form.scoring.initialRating}
                      onChange={(event) => handleScoringChange("initialRating", event.target.value)}
                      placeholder="1200"
                    />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label className={styles.label} htmlFor="guided-kfactor">
                      K-factor
                    </label>
                    <Input
                      id="guided-kfactor"
                      type="number"
                      value={form.scoring.kFactor}
                      onChange={(event) => handleScoringChange("kFactor", event.target.value)}
                      placeholder="32"
                    />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label className={styles.label} htmlFor="guided-placement">
                      Placement matches
                    </label>
                    <Input
                      id="guided-placement"
                      type="number"
                      value={form.scoring.placementMatches}
                      onChange={(event) => handleScoringChange("placementMatches", event.target.value)}
                      placeholder="3"
                    />
                  </div>
                </div>
                <p className={styles.fieldHint}>
                  These defaults power Capsule&apos;s matchmaking tips. Adjust later if needed.
                </p>
              </CardContent>
            </Card>
          </>
        );
      case "overview":
        return (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Ladder overview</CardTitle>
                <CardDescription>This copy appears at the top of your ladder and in invites.</CardDescription>
              </CardHeader>
              <CardContent className={styles.cardContent}>
                <textarea
                  id="guided-overview"
                  className={styles.textarea}
                  value={form.sections.overview.body ?? ""}
                  onChange={(event) => handleSectionChange("overview", "body", event.target.value)}
                  rows={5}
                  placeholder="Set the stakes, cadence, rewards, and why challengers should care."
                />
                <p className={styles.fieldHint}>
                  Mention cadence, platform, or spotlight moments so Capsule can reuse the story across surfaces.
                </p>
              </CardContent>
            </Card>
          </>
        );
      case "rules":
        return (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Rules snapshot</CardTitle>
                <CardDescription>We surface these in every post-match recap.</CardDescription>
              </CardHeader>
              <CardContent className={styles.cardContent}>
                <textarea
                  id="guided-rules"
                  className={styles.textarea}
                  value={form.sections.rules.body ?? ""}
                  onChange={(event) => handleSectionChange("rules", "body", event.target.value)}
                  rows={4}
                  placeholder="Matches are best-of-three. Report scores within 2 hours with screenshots."
                />
                <div className={styles.pillGroup}>
                  {RULE_SNIPPETS.map((snippet) => (
                    <button
                      key={snippet}
                      type="button"
                      className={styles.pillButton}
                      onClick={() => handleAppendRuleSnippet(snippet)}
                    >
                      {snippet}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        );
      case "shoutouts":
        return (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Shoutouts & highlights</CardTitle>
                <CardDescription>Feed Capsule AI the themes you want to spotlight every week.</CardDescription>
              </CardHeader>
              <CardContent className={styles.cardContent}>
                <div className={styles.fieldGroup}>
                  <label className={styles.label} htmlFor="guided-shoutouts-body">
                    Story beats
                  </label>
                  <textarea
                    id="guided-shoutouts-body"
                    className={styles.textarea}
                    value={form.sections.shoutouts.body ?? ""}
                    onChange={(event) => handleSectionChange("shoutouts", "body", event.target.value)}
                    rows={4}
                    placeholder="Call out rivalries, MVP awards, clutch moments, or rookie spotlights."
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.label} htmlFor="guided-shoutouts-bullets">
                    Highlight bullets (one per line)
                  </label>
                  <textarea
                    id="guided-shoutouts-bullets"
                    className={styles.textarea}
                    value={form.sections.shoutouts.bulletsText ?? ""}
                    onChange={(event) => handleSectionChange("shoutouts", "bulletsText", event.target.value)}
                    rows={3}
                    placeholder={"Most electrifying play\nFan favorite team\nUnderdog to watch"}
                  />
                </div>
              </CardContent>
            </Card>
          </>
        );
      case "timeline":
        return (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Timeline & cadence</CardTitle>
                <CardDescription>Adjust any detail later in manual mode.</CardDescription>
              </CardHeader>
              <CardContent className={styles.cardContent}>
                <div className={styles.fieldRow}>
                  <div className={styles.fieldGroup}>
                    <label className={styles.label} htmlFor="guided-season-length">
                      Season length (weeks)
                    </label>
                    <Input
                      id="guided-season-length"
                      value={seed.seasonLengthWeeks}
                      onChange={(event) => handleSeedChange("seasonLengthWeeks", event.target.value)}
                      placeholder="6"
                    />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label className={styles.label} htmlFor="guided-cadence">
                      Match cadence
                    </label>
                    <Input
                      id="guided-cadence"
                      value={form.schedule.cadence ?? ""}
                      onChange={(event) => handleScheduleChange("cadence", event.target.value)}
                      placeholder="Weekly rounds"
                    />
                  </div>
                </div>
                <div className={styles.fieldRow}>
                  <div className={styles.fieldGroup}>
                    <label className={styles.label} htmlFor="guided-kickoff">
                      Kickoff window
                    </label>
                    <Input
                      id="guided-kickoff"
                      value={form.schedule.kickoff ?? ""}
                      onChange={(event) => handleScheduleChange("kickoff", event.target.value)}
                      placeholder="Mondays 7 PM"
                    />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label className={styles.label} htmlFor="guided-timezone">
                      Timezone
                    </label>
                    <Input
                      id="guided-timezone"
                      value={form.schedule.timezone ?? ""}
                      onChange={(event) => handleScheduleChange("timezone", event.target.value)}
                      placeholder="NA / CET"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        );
      case "roster":
        return (
          <RosterStep
            members={members}
            onMemberField={handleMemberField}
            onAddMember={addMember}
            onRemoveMember={removeMember}
          />
        );
      case "rewards":
        return (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Rewards & spotlight</CardTitle>
                <CardDescription>Shared in every recap, stream script, and reminder.</CardDescription>
              </CardHeader>
              <CardContent className={styles.cardContent}>
                <textarea
                  id="guided-rewards"
                  className={styles.textarea}
                  value={form.sections.results.body ?? ""}
                  onChange={(event) => handleSectionChange("results", "body", event.target.value)}
                  rows={4}
                  placeholder="Top 3 earn featured posts, MVP gets a custom Capsule portrait."
                />
                <div className={styles.pillGroup}>
                  {REWARD_SNIPPETS.map((snippet) => (
                    <button
                      key={snippet}
                      type="button"
                      className={styles.pillButton}
                      onClick={() => handleAppendRewardSnippet(snippet)}
                    >
                      {snippet}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        );
      case "review":
      default:
        return (
          <>
            <div className={styles.guidedReviewStack}>
              {renderReviewOverview()}
              <Card>
                <CardHeader>
                  <CardTitle>Visibility & publish</CardTitle>
                  <CardDescription>Flip to public whenever you&apos;re ready.</CardDescription>
                </CardHeader>
                <CardContent className={styles.cardContent}>
                  <div className={styles.fieldGroup}>
                    <label className={styles.label} htmlFor="guided-visibility">
                      Visibility
                    </label>
                    <select
                      id="guided-visibility"
                      className={styles.select}
                      value={form.visibility}
                      onChange={(event) =>
                        handleFormField("visibility", event.target.value as "private" | "capsule" | "public")
                      }
                    >
                      <option value="capsule">Capsule members</option>
                      <option value="private">Managers only</option>
                      <option value="public">Public showcase</option>
                    </select>
                  </div>
                  <div className={styles.checkboxRow}>
                    <input
                      id="guided-publish"
                      type="checkbox"
                      checked={form.publish}
                      onChange={(event) => handleFormField("publish", event.target.checked)}
                    />
                    <label htmlFor="guided-publish">Publish immediately after saving</label>
                  </div>
                  <p className={styles.fieldHint}>
                    Leave unchecked to save a draft. Capsule will keep everything private.
                  </p>
                </CardContent>
              </Card>
              {renderAiPlan()}
            </div>
          </>
        );
    }
  };
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
      formContent={renderGuidedStepContent()}
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
          {renderAutosaveMeta()}
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
        {selectedCapsule ? (
          <div className={styles.panelTopActions}>
            <div className={styles.panelCapsule}>
              <span className={styles.panelCapsuleLabel}>Capsule</span>
              <strong>{selectedCapsule.name}</strong>
            </div>
            <Button type="button" size="sm" variant="secondary" onClick={() => handleCapsuleChange(null)}>
              Switch capsule
            </Button>
          </div>
        ) : null}
        {renderGuidedExperience()}
      </div>
    </div>
  );
}

