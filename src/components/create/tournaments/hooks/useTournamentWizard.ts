import * as React from "react";
import { useRouter } from "next/navigation";
import { useOptionalFriendsDataContext } from "@/components/providers/FriendsDataProvider";
import type { CapsuleSummary } from "@/server/capsules/service";
import type { AiPlanLike } from "../../ladders/components/AiPlanCard";
import { TOURNAMENT_STEPS, TOURNAMENT_STEP_ORDER } from "../constants";
import type {
  ParticipantEntityType,
  ParticipantFormState,
  ParticipantSuggestion,
  TournamentFormState,
  TournamentPreviewModel,
  TournamentStepDefinition,
  TournamentStepId,
} from "../types";
const defaultVisitedState: Record<TournamentStepId, boolean> = {
  blueprint: true,
  title: false,
  summary: false,
  signups: false,
  basics: false,
  overview: false,
  rules: false,
  shoutouts: false,
  format: false,
  rewards: false,
  participants: false,
  review: false,
};
const clamp = (value: number, { min, max }: { min?: number; max?: number } = {}): number => {
  let result = value;
  if (typeof min === "number") result = Math.max(min, result);
  if (typeof max === "number") result = Math.min(max, result);
  return result;
};
export const parseInteger = (value: string, fallback: number, options: { min?: number; max?: number } = {}): number => {
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return clamp(parsed, options);
};
const trimOrNull = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};
export const createDefaultForm = (): TournamentFormState => ({
  name: "",
  summary: "",
  visibility: "capsule",
  publish: false,
  gameTitle: "",
  gamePlatform: "",
  gameRegion: "",
  seasonLength: "",
  matchCadence: "",
  kickoffNotes: "",
  format: "single_elimination",
  matchMode: "1v1",
  bestOf: "3",
  start: "",
  timezone: "",
  registrationType: "open",
  maxEntrants: "16",
  registrationRequirements: "",
  overview: "",
  rules: "",
  broadcast: "",
  updates: "",
  rewards: "",
});
export const createEmptyParticipant = (index: number): ParticipantFormState => ({
  displayName: "",
  handle: "",
  seed: String(index + 1),
  rating: "1200",
  wins: "0",
  losses: "0",
  draws: "0",
  streak: "0",
  entityType: "custom",
  userId: "",
  capsuleId: "",
});
export const normalizeParticipants = (list: ParticipantFormState[]): ParticipantFormState[] => {
  return list.map((participant, index) => ({
    ...participant,
    seed: participant.seed.trim().length ? participant.seed : String(index + 1),
    entityType: participant.entityType ?? "custom",
    userId: participant.userId ?? "",
    capsuleId: participant.capsuleId ?? "",
    rating: (participant.rating ?? "").trim().length ? participant.rating : "1200",
    wins: (participant.wins ?? "").trim().length ? participant.wins : "0",
    losses: (participant.losses ?? "").trim().length ? participant.losses : "0",
    draws: (participant.draws ?? "").trim().length ? participant.draws : "0",
    streak: (participant.streak ?? "").trim().length ? participant.streak : "0",
  }));
};

export const buildTournamentMetaPayload = (form: TournamentFormState) => {
  const maxEntrantsInput = form.maxEntrants.trim();
  const maxEntrants = maxEntrantsInput.length
    ? parseInteger(maxEntrantsInput, 16, { min: 2, max: 128 })
    : null;
  return {
    variant: "tournament",
    format: form.format,
    matchMode: form.matchMode ?? null,
    formatLabel:
      form.format === "single_elimination"
        ? "Single Elim"
        : form.format === "double_elimination"
          ? "Double Elim"
          : "Round Robin",
    startsAt: form.start.trim().length ? form.start.trim() : null,
    schedule: {
      start: form.start.trim().length ? form.start.trim() : null,
      timezone: form.timezone.trim().length ? form.timezone.trim() : null,
    },
    settings: {
      bestOf: form.bestOf,
      registrationType: form.registrationType,
      maxEntrants,
    },
  } as Record<string, unknown>;
};

export const buildTournamentConfigPayload = (form: TournamentFormState) => {
  const maxEntrantsInput = form.maxEntrants.trim();
  const maxEntrants = maxEntrantsInput.length
    ? parseInteger(maxEntrantsInput, 16, { min: 2, max: 128 })
    : null;
  const requirements = (form.registrationRequirements ?? "")
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length);
  const schedule: Record<string, unknown> = {};
  if (form.start.trim().length) schedule.kickoff = form.start.trim();
  if (form.timezone.trim().length) schedule.timezone = form.timezone.trim();
  return {
    objectives: ["Deliver a high-energy bracket with assistant commentary."],
    schedule,
    registration: {
      type: form.registrationType,
      maxTeams: maxEntrants ?? null,
      ...(requirements.length ? { requirements } : {}),
    },
    metadata: {
      tournament: {
        format: form.format,
        bestOf: form.bestOf,
      },
    },
  } as Record<string, unknown>;
};

export const buildTournamentMembersPayload = (
  participants: ParticipantFormState[],
  matchMode?: TournamentFormState["matchMode"],
) => {
  const resolvedMatchMode = matchMode ?? "1v1";
  const isTeamMode = resolvedMatchMode === "teams";
  return normalizeParticipants(participants)
    .filter((participant) => participant.displayName.trim().length)
    .map((participant, index) => {
      const payload: Record<string, unknown> = {
        displayName: participant.displayName.trim(),
        handle: participant.handle.trim().length ? participant.handle.trim() : null,
        seed: parseInteger(participant.seed, index + 1, { min: 1, max: 256 }),
        rating: parseInteger(participant.rating, 1200, { min: 100, max: 4000 }),
        wins: parseInteger(participant.wins, 0, { min: 0 }),
        losses: parseInteger(participant.losses, 0, { min: 0 }),
        draws: parseInteger(participant.draws, 0, { min: 0 }),
        streak: parseInteger(participant.streak, 0, { min: -20, max: 20 }),
      };
      const userId = participant.entityType === "user" ? participant.userId.trim() : "";
      const capsuleId = participant.entityType === "capsule" ? participant.capsuleId.trim() : "";
      if (userId) payload.userId = userId;
      const metadata: Record<string, unknown> = {};
      if (capsuleId) {
        metadata.capsuleId = capsuleId;
        if (!metadata.entityType) metadata.entityType = "capsule";
        if (!metadata.identityType) metadata.identityType = "capsule";
      }
      if (participant.entityType === "user") {
        metadata.entityType = "user";
        metadata.identityType = "user";
      }
      if (isTeamMode) {
        metadata.entityType = "team";
        metadata.identityType = "team";
      }
      if (Object.keys(metadata).length) {
        payload.metadata = metadata;
      }
      return payload;
    });
};
type UseTournamentWizardArgs = {
  selectedCapsule: CapsuleSummary | null;
};
export type TournamentWizardController = {
  form: TournamentFormState;
  participants: ParticipantFormState[];
  aiPlan: AiPlanLike;
  statusMessage: string | null;
  errorMessage: string | null;
  isSaving: boolean;
  generating: boolean;
  activeStep: TournamentStepId;
  completionMap: Record<TournamentStepId, boolean>;
  previousStepId: TournamentStepId | null;
  nextStep: TournamentStepDefinition | null;
  formContentRef: React.RefObject<HTMLDivElement | null>;
  previewModel: TournamentPreviewModel;
  showInvite: boolean;
  friends: NonNullable<ReturnType<typeof useOptionalFriendsDataContext>>["friends"] | [];
  handleStepSelect: (stepId: TournamentStepId) => void;
  handleNextStep: () => void;
  handlePreviousStep: () => void;
  handleFormChange: <K extends keyof TournamentFormState>(key: K, value: TournamentFormState[K]) => void;
  handleParticipantChange: (index: number, field: keyof ParticipantFormState, value: string) => void;
  addParticipant: () => void;
  removeParticipant: (index: number) => void;
  handleParticipantSuggestion: (index: number, suggestion: ParticipantSuggestion) => void;
  handleInvite: (userIds: string[]) => Promise<void>;
  handleGenerateDraft: () => Promise<void>;
  createTournament: () => Promise<void>;
  resetFormState: () => void;
  setShowInvite: (value: boolean) => void;
  setStatusMessage: (value: string | null) => void;
};
export const useTournamentWizard = ({ selectedCapsule }: UseTournamentWizardArgs): TournamentWizardController => {
  const router = useRouter();
  const friendsContext = useOptionalFriendsDataContext();
  const [form, setForm] = React.useState<TournamentFormState>(createDefaultForm);
  const [participants, setParticipants] = React.useState<ParticipantFormState[]>([
    createEmptyParticipant(0),
    createEmptyParticipant(1),
  ]);
  const [aiPlan, setAiPlan] = React.useState<AiPlanLike>(null);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isSaving, setSaving] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [activeStep, setActiveStep] = React.useState<TournamentStepId>("blueprint");
  const [visitedSteps, setVisitedSteps] = React.useState<Record<TournamentStepId, boolean>>(defaultVisitedState);
  const formContentRef = React.useRef<HTMLDivElement | null>(null);
  const [showInvite, setShowInvite] = React.useState(false);
  const stepIndex = React.useMemo(() => TOURNAMENT_STEP_ORDER.indexOf(activeStep), [activeStep]);
  const previousStepId = stepIndex > 0 ? (TOURNAMENT_STEP_ORDER[stepIndex - 1] as TournamentStepId) : null;
  const nextStepId =
    stepIndex >= 0 && stepIndex < TOURNAMENT_STEP_ORDER.length - 1
      ? (TOURNAMENT_STEP_ORDER[stepIndex + 1] as TournamentStepId)
      : null;
  const nextStep = nextStepId ? TOURNAMENT_STEPS.find((step) => step.id === nextStepId) ?? null : null;
  const resetMessages = React.useCallback(() => {
    setStatusMessage(null);
    setErrorMessage(null);
  }, []);
  const resetFormState = React.useCallback(() => {
    setForm(createDefaultForm());
    setParticipants([createEmptyParticipant(0), createEmptyParticipant(1)]);
    setActiveStep("blueprint");
    setVisitedSteps(defaultVisitedState);
    resetMessages();
  }, [resetMessages]);
  const handleStepSelect = React.useCallback((stepId: TournamentStepId) => {
    setActiveStep(stepId);
    setVisitedSteps((prev) => ({ ...prev, [stepId]: true }));
  }, []);
  const handleNextStep = React.useCallback(() => {
    if (!nextStepId) return;
    handleStepSelect(nextStepId);
  }, [handleStepSelect, nextStepId]);
  const handlePreviousStep = React.useCallback(() => {
    if (!previousStepId) return;
    handleStepSelect(previousStepId);
  }, [handleStepSelect, previousStepId]);
  const handleFormChange = React.useCallback(
    <K extends keyof TournamentFormState>(key: K, value: TournamentFormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );
  const handleParticipantChange = React.useCallback(
    (index: number, field: keyof ParticipantFormState, value: string) => {
      setParticipants((prev) => {
        const next = [...prev];
        const current = next[index];
        if (!current) {
          return prev;
        }
        const updated: ParticipantFormState = { ...current };
        if (field === "displayName") {
          updated.displayName = value;
          updated.entityType = "custom";
          updated.userId = "";
          updated.capsuleId = "";
        } else if (field === "handle") {
          updated.handle = value;
        } else if (field === "seed") {
          updated.seed = value;
        } else if (field === "rating") {
          updated.rating = value;
        } else if (field === "wins") {
          updated.wins = value;
        } else if (field === "losses") {
          updated.losses = value;
        } else if (field === "draws") {
          updated.draws = value;
        } else if (field === "streak") {
          updated.streak = value;
        } else if (field === "userId") {
          updated.userId = value;
        } else if (field === "capsuleId") {
          updated.capsuleId = value;
        } else if (field === "id") {
          updated.id = value;
        }
        next[index] = updated;
        return next;
      });
    },
    [],
  );
  const addParticipant = React.useCallback(() => {
    setParticipants((prev) => [...prev, createEmptyParticipant(prev.length)]);
  }, []);
  const removeParticipant = React.useCallback((index: number) => {
    setParticipants((prev) => prev.filter((_, i) => i !== index));
  }, []);
  const handleParticipantSuggestion = React.useCallback((index: number, suggestion: ParticipantSuggestion) => {
    setParticipants((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      const updated: ParticipantFormState = {
        ...current,
        displayName: suggestion.name,
        entityType: suggestion.kind === "user" ? "user" : "capsule",
        userId: suggestion.kind === "user" ? suggestion.id : "",
        capsuleId: suggestion.kind === "capsule" ? suggestion.id : "",
      };
      next[index] = updated;
      return next;
    });
  }, []);
  const handleInvite = React.useCallback(
    async (userIds: string[]) => {
      const friendMap = new Map<string, { id: string; name: string }>();
      (friendsContext?.friends ?? []).forEach((friend) => {
        if (friend.userId) {
          friendMap.set(friend.userId, { id: friend.userId, name: friend.name ?? friend.userId });
        }
      });
      setParticipants((prev) => {
        const additions = userIds
          .map((id, index) => {
            const friend = friendMap.get(id);
            return {
              ...createEmptyParticipant(prev.length + index),
              displayName: friend?.name ?? id,
              entityType: "user" as const,
              userId: id,
            };
          })
          .filter(Boolean);
        return normalizeParticipants([...prev, ...additions]);
      });
      setShowInvite(false);
      setVisitedSteps((prev) => ({ ...prev, participants: true }));
    },
    [friendsContext?.friends],
  );
  const convertSectionsToPayload = React.useCallback(() => {
    const mapBlock = (title: string, body: string) => ({
      title: title.trim().length ? title.trim() : "Untitled",
      body: trimOrNull(body),
    });
    return {
      overview: mapBlock("Tournament Overview", form.overview),
      rules: mapBlock("Rules & Format", form.rules),
      shoutouts: mapBlock("Broadcast & Spotlight", form.broadcast),
      upcoming: mapBlock("Schedule & Check-ins", form.updates),
      results: mapBlock("Rewards", form.rewards),
    };
  }, [form.broadcast, form.overview, form.rewards, form.rules, form.updates]);
  const convertConfigToPayload = React.useCallback(
    () => buildTournamentConfigPayload(form),
    [form],
  );
  const convertParticipantsToPayload = React.useCallback(
    () => buildTournamentMembersPayload(participants, form.matchMode),
    [form.matchMode, participants],
  );
  const buildMetaPayload = React.useCallback(
    () => buildTournamentMetaPayload(form),
    [form],
  );

  const toTrimmedString = (value: unknown): string => {
    if (typeof value === "string") return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return "";
  };

  const applyBlueprint = React.useCallback(
    (data: {
      ladder: {
        name: string;
        summary: string | null;
        sections: Record<string, unknown>;
        config: Record<string, unknown>;
        aiPlan?: unknown;
      };
      members: Array<Record<string, unknown>>;
    }) => {
      const { ladder } = data;
      const sections = ladder.sections ?? {};
      setForm((prev) => ({
        ...prev,
        name: ladder.name ?? prev.name,
        summary: ladder.summary ?? prev.summary,
        overview:
          typeof sections.overview === "object" && sections.overview
            ? ((sections.overview as Record<string, unknown>).body as string | undefined) ?? prev.overview
            : prev.overview,
        rules:
          typeof sections.rules === "object" && sections.rules
            ? ((sections.rules as Record<string, unknown>).body as string | undefined) ?? prev.rules
            : prev.rules,
        broadcast:
          typeof sections.shoutouts === "object" && sections.shoutouts
            ? ((sections.shoutouts as Record<string, unknown>).body as string | undefined) ?? prev.broadcast
            : prev.broadcast,
        updates:
          typeof sections.upcoming === "object" && sections.upcoming
            ? ((sections.upcoming as Record<string, unknown>).body as string | undefined) ?? prev.updates
            : prev.updates,
        rewards:
          typeof sections.results === "object" && sections.results
            ? ((sections.results as Record<string, unknown>).body as string | undefined) ?? prev.rewards
            : prev.rewards,
      }));
      const parseStat = (value: unknown): number | null => {
        if (typeof value === "number") return value;
        if (typeof value === "string") {
          const parsed = Number.parseInt(value, 10);
          return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
      };

      const mappedMembers = data.members
        .map((entry, index) => {
          if (!entry || typeof entry !== "object") return null;
          const record = entry as Record<string, unknown>;
          const displayName =
            typeof record.displayName === "string" && record.displayName.trim().length
              ? record.displayName.trim()
              : null;
          if (!displayName) return null;
          const userId =
            typeof (record as { userId?: unknown }).userId === "string"
              ? (record as { userId?: string }).userId?.trim() ?? ""
              : "";
          const capsuleId =
            typeof (record as { capsuleId?: unknown }).capsuleId === "string"
              ? (record as { capsuleId?: string }).capsuleId?.trim() ?? ""
              : "";
          const entityType: ParticipantEntityType = userId ? "user" : capsuleId ? "capsule" : "custom";
          const seed =
            typeof record.seed === "number"
              ? record.seed
              : typeof record.seed === "string"
                ? Number.parseInt(record.seed, 10)
                : index + 1;
          const ratingValue = parseStat((record as { rating?: unknown }).rating);
          const winsValue = parseStat((record as { wins?: unknown }).wins);
          const lossesValue = parseStat((record as { losses?: unknown }).losses);
          const drawsValue = parseStat((record as { draws?: unknown }).draws);
          const streakValue = parseStat((record as { streak?: unknown }).streak);
          const participant: ParticipantFormState = {
            displayName,
            handle:
              typeof record.handle === "string" && record.handle.trim().length ? record.handle.trim() : "",
            seed: Number.isFinite(seed) ? String(seed) : String(index + 1),
            rating: Number.isFinite(ratingValue ?? NaN) ? String(ratingValue) : "1200",
            wins: Number.isFinite(winsValue ?? NaN) ? String(winsValue) : "0",
            losses: Number.isFinite(lossesValue ?? NaN) ? String(lossesValue) : "0",
            draws: Number.isFinite(drawsValue ?? NaN) ? String(drawsValue) : "0",
            streak: Number.isFinite(streakValue ?? NaN) ? String(streakValue) : "0",
            userId,
            capsuleId,
            entityType,
          };
          if (typeof record.id === "string" && record.id.trim().length) {
            participant.id = record.id.trim();
          }
          return participant;
        })
        .filter((entry): entry is ParticipantFormState => Boolean(entry));
      if (mappedMembers.length) {
        setParticipants(normalizeParticipants(mappedMembers));
      }

      const rawPlan = data.ladder.aiPlan;
      if (rawPlan && typeof rawPlan === "object") {
        const planRecord = rawPlan as Record<string, unknown>;
        const suggestionsRaw = Array.isArray((planRecord as { suggestions?: unknown }).suggestions)
          ? ((planRecord as { suggestions?: unknown }).suggestions as unknown[])
          : [];
        const suggestions = suggestionsRaw
          .map((entry) => {
            if (!entry || typeof entry !== "object") return null;
            const suggestion = entry as Record<string, unknown>;
            const title = toTrimmedString(suggestion.title);
            const summary = toTrimmedString((suggestion as { summary?: unknown }).summary);
            if (!title || !summary) return null;
            return {
              id:
                toTrimmedString(suggestion.id) ||
                `suggestion-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              title,
              summary,
              section: toTrimmedString((suggestion as { section?: unknown }).section) || null,
            };
          })
          .filter(Boolean);
        const plan = {
          reasoning: toTrimmedString((planRecord as { reasoning?: unknown }).reasoning) || null,
          prompt: toTrimmedString((planRecord as { prompt?: unknown }).prompt) || null,
          // suggestions is optional on AiPlanLike; cast to keep types simple
          suggestions: suggestions as NonNullable<AiPlanLike>["suggestions"],
        };
        setAiPlan(plan as AiPlanLike);
      } else {
        setAiPlan(null);
      }

      setVisitedSteps((prev) => ({
        ...prev,
        blueprint: true,
        participants: true,
      }));
    },
    [],
  );
  const handleGenerateDraft = React.useCallback(async () => {
    if (!selectedCapsule) {
      setErrorMessage("Choose a capsule before generating a tournament plan.");
      return;
    }
    resetMessages();
    setGenerating(true);
    try {
      const payload = {
        goal: `Construct a ${form.format.replace(/_/g, " ")} tournament with assistant coverage.`,
        audience: trimOrNull(form.summary),
        notes: "Focus on bracket hype, match-day storytelling, and automated announcements.",
        participants: parseInteger(form.maxEntrants, 16, { min: 2, max: 128 }),
      };
      const response = await fetch(`/api/capsules/${selectedCapsule.id}/ladders/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const message = data?.error?.message ?? data?.message ?? "We couldn't generate a tournament blueprint.";
        throw new Error(message);
      }
      const blueprint = (await response.json()) as {
        ladder: { name: string; summary: string | null; sections: Record<string, unknown>; config: Record<string, unknown> };
        members: Array<Record<string, unknown>>;
      };
      applyBlueprint(blueprint);
      setStatusMessage("Draft created. Review your sections and seeds before publishing.");
      setVisitedSteps((prev) => ({ ...prev, blueprint: true }));
      handleStepSelect("title");
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setGenerating(false);
    }
  }, [applyBlueprint, form.format, form.maxEntrants, form.summary, handleStepSelect, resetMessages, selectedCapsule]);
  const createTournament = React.useCallback(async () => {
    if (!selectedCapsule) {
      setErrorMessage("Choose a capsule before creating the tournament.");
      return;
    }
    if (!form.name.trim().length) {
      setErrorMessage("Give your tournament a name.");
      return;
    }
    const activeParticipants = normalizeParticipants(participants).filter((participant) =>
      participant.displayName.trim().length,
    );
    if (activeParticipants.length < 2) {
      setErrorMessage("Add at least two entrants before creating the tournament.");
      return;
    }
    resetMessages();
    setSaving(true);
    try {
      const response = await fetch(`/api/capsules/${selectedCapsule.id}/ladders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          summary: trimOrNull(form.summary),
          visibility: form.visibility,
          status: form.publish ? "active" : "draft",
          publish: form.publish,
          config: convertConfigToPayload(),
          sections: convertSectionsToPayload(),
          meta: buildMetaPayload(),
          members: convertParticipantsToPayload(),
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = payload?.error?.message ?? payload?.message ?? "Unable to create the tournament.";
        throw new Error(message);
      }
      const { ladder } = await response.json();
      setStatusMessage(
        form.publish
          ? "Tournament published! Check your Capsule Events tab to confirm."
          : "Tournament saved as draft. Publish it from the Events tab when you're ready.",
      );
      if (ladder?.capsuleId) {
        setTimeout(() => {
          router.push(`/capsule?capsuleId=${ladder.capsuleId}&switch=events`);
        }, 800);
      }
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setSaving(false);
    }
  }, [
    buildMetaPayload,
    convertConfigToPayload,
    convertParticipantsToPayload,
    convertSectionsToPayload,
    form.name,
    form.publish,
    form.summary,
    form.visibility,
    participants,
    resetMessages,
    router,
    selectedCapsule,
  ]);
  const completionMap = React.useMemo(
    () => ({
      blueprint: visitedSteps.blueprint,
      title: visitedSteps.title && Boolean(form.name.trim()),
      summary: visitedSteps.summary && Boolean(form.summary.trim()),
      signups:
        visitedSteps.signups &&
        Boolean(
          form.registrationType ||
            form.maxEntrants.trim() ||
            form.registrationRequirements.trim(),
        ),
      basics:
        visitedSteps.basics &&
        Boolean(
          form.gameTitle.trim() ||
            form.gamePlatform.trim() ||
            form.gameRegion.trim() ||
            form.seasonLength.trim() ||
            form.matchCadence.trim() ||
            form.kickoffNotes.trim() ||
            form.timezone.trim(),
        ),
      overview: visitedSteps.overview && Boolean(form.overview.trim()),
      rules: visitedSteps.rules && Boolean(form.rules.trim()),
      shoutouts:
        visitedSteps.shoutouts &&
        Boolean(form.broadcast.trim() || form.updates.trim()),
      format: visitedSteps.format,
      rewards: visitedSteps.rewards && Boolean(form.rewards.trim()),
      participants: visitedSteps.participants && participants.some((participant) => participant.displayName.trim().length),
      review: visitedSteps.review,
    }),
    [
      form.broadcast,
      form.name,
      form.overview,
      form.rewards,
      form.rules,
      form.summary,
      form.updates,
      form.gameTitle,
      form.gamePlatform,
      form.gameRegion,
      form.seasonLength,
      form.matchCadence,
      form.kickoffNotes,
      form.timezone,
      form.maxEntrants,
      form.registrationRequirements,
      form.registrationType,
      participants,
      visitedSteps,
    ],
  );
  const previewModel = React.useMemo<TournamentPreviewModel>(() => {
    const formatLabel =
      form.format === "single_elimination"
        ? "Single elimination"
        : form.format === "double_elimination"
          ? "Double elimination"
          : "Round robin";
    const maxEntrantsInput = form.maxEntrants.trim();
    const maxEntrants = maxEntrantsInput.length
      ? parseInteger(maxEntrantsInput, 16, { min: 2, max: 128 })
      : null;
    const kickoffParts = [form.start.trim(), form.timezone.trim()].filter(Boolean);
    const trimmedParticipants = normalizeParticipants(participants).filter((participant) =>
      participant.displayName.trim().length,
    );
    const sections: TournamentPreviewModel["sections"] = [
      {
        id: "overview",
        title: "Overview",
        body: form.overview.trim() || form.summary.trim() || "Add an overview to set the tone.",
      },
      { id: "rules", title: "Rules & format", body: form.rules.trim() || "Call out map pools, formats, and disputes." },
      {
        id: "broadcast",
        title: "Broadcast & spotlight",
        body: form.broadcast.trim() || "Share caster notes, broadcast plan, and spotlight beats.",
      },
      { id: "updates", title: "Schedule & updates", body: form.updates.trim() || "Set check-in rules and timings." },
      {
        id: "rewards",
        title: "Rewards",
        body: form.rewards.trim() || "Call out prizing, titles, and perks.",
      },
    ];
    return {
      title: form.name.trim() || "Untitled tournament",
      summary: form.summary.trim(),
      capsuleName: selectedCapsule?.name ?? "Capsule",
      format: formatLabel,
      matchMode: (form.matchMode as TournamentPreviewModel["matchMode"]) ?? "",
      registration: maxEntrants
        ? `${form.registrationType} cap ${maxEntrants}`
        : form.registrationType,
      kickoff: kickoffParts.length ? kickoffParts.join(" | ") : "Kickoff time TBD",
      sections,
      participants: trimmedParticipants.map((participant, index) => ({
        name: participant.displayName.trim(),
        handle: participant.handle.trim(),
        seed: participant.seed.trim() || String(index + 1),
      })),
    };
  }, [
    form.broadcast,
    form.format,
    form.matchMode,
    form.maxEntrants,
    form.name,
    form.overview,
    form.rewards,
    form.rules,
    form.start,
    form.summary,
    form.timezone,
    form.updates,
    form.registrationType,
      participants,
      selectedCapsule?.name,
    ]);
  return {
    form,
    participants,
    aiPlan,
    statusMessage,
    errorMessage,
    isSaving,
    generating,
    activeStep,
    completionMap,
    previousStepId,
    nextStep,
    formContentRef,
    previewModel,
    showInvite,
    friends: friendsContext?.friends ?? [],
    handleStepSelect,
    handleNextStep,
    handlePreviousStep,
    handleFormChange,
    handleParticipantChange,
    addParticipant,
    removeParticipant,
    handleParticipantSuggestion,
    handleInvite,
    handleGenerateDraft,
    createTournament,
    resetFormState,
    setShowInvite,
    setStatusMessage,
  };
};
