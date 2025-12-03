import * as React from "react";
import { useRouter } from "next/navigation";

import { useOptionalFriendsDataContext } from "@/components/providers/FriendsDataProvider";
import type { CapsuleSummary } from "@/server/capsules/service";

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
  details: false,
  format: false,
  content: false,
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
  format: "single_elimination",
  bestOf: "3",
  start: "",
  timezone: "",
  registrationType: "open",
  maxEntrants: "16",
  overview: "",
  rules: "",
  broadcast: "",
  updates: "",
  aiNotes: "",
});

export const createEmptyParticipant = (index: number): ParticipantFormState => ({
  displayName: "",
  handle: "",
  seed: String(index + 1),
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
  }));
};

type UseTournamentWizardArgs = {
  selectedCapsule: CapsuleSummary | null;
};

export type TournamentWizardController = {
  form: TournamentFormState;
  participants: ParticipantFormState[];
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
  handleParticipantEntityType: (index: number, entityType: ParticipantEntityType) => void;
  handleParticipantEntityId: (index: number, value: string) => void;
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

  const handleParticipantEntityType = React.useCallback((index: number, entityType: ParticipantEntityType) => {
    setParticipants((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      const updated: ParticipantFormState = { ...current, entityType };
      if (entityType === "user") {
        updated.capsuleId = "";
      } else if (entityType === "capsule") {
        updated.userId = "";
      } else {
        updated.userId = "";
        updated.capsuleId = "";
      }
      next[index] = updated;
      return next;
    });
  }, []);

  const handleParticipantEntityId = React.useCallback((index: number, value: string) => {
    setParticipants((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      const updated: ParticipantFormState = { ...current };
      if (updated.entityType === "user") {
        updated.userId = value;
      } else if (updated.entityType === "capsule") {
        updated.capsuleId = value;
      }
      next[index] = updated;
      return next;
    });
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
      results: mapBlock("Highlights & Recap", form.aiNotes),
    };
  }, [form.aiNotes, form.broadcast, form.overview, form.rules, form.updates]);

  const convertConfigToPayload = React.useCallback(() => {
    const maxEntrants = parseInteger(form.maxEntrants, 16, { min: 2, max: 128 });
    const schedule: Record<string, unknown> = {};
    if (form.start.trim().length) schedule.kickoff = form.start.trim();
    if (form.timezone.trim().length) schedule.timezone = form.timezone.trim();

    return {
      objectives: ["Deliver a high-energy bracket with Capsule AI commentary."],
      schedule,
      registration: {
        type: form.registrationType,
        maxTeams: maxEntrants,
      },
      metadata: {
        tournament: {
          format: form.format,
          bestOf: form.bestOf,
        },
      },
    } as Record<string, unknown>;
  }, [form.bestOf, form.format, form.maxEntrants, form.registrationType, form.start, form.timezone]);

  const convertParticipantsToPayload = React.useCallback(() => {
    return normalizeParticipants(participants)
      .filter((participant) => participant.displayName.trim().length)
      .map((participant, index) => {
        const payload: Record<string, unknown> = {
          displayName: participant.displayName.trim(),
          handle: participant.handle.trim().length ? participant.handle.trim() : null,
          seed: parseInteger(participant.seed, index + 1, { min: 1, max: 256 }),
          rating: 1200,
          wins: 0,
          losses: 0,
          draws: 0,
          streak: 0,
        };
        const userId = participant.entityType === "user" ? participant.userId.trim() : "";
        const capsuleId = participant.entityType === "capsule" ? participant.capsuleId.trim() : "";
        if (userId) payload.userId = userId;
        const metadata: Record<string, unknown> = {};
        if (capsuleId) metadata.capsuleId = capsuleId;
        if (participant.entityType !== "custom") metadata.entityType = participant.entityType;
        if (Object.keys(metadata).length) {
          payload.metadata = metadata;
        }
        return payload;
      });
  }, [participants]);

  const buildMetaPayload = React.useCallback(() => {
    return {
      variant: "tournament",
      format: form.format,
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
        maxEntrants: parseInteger(form.maxEntrants, 16, { min: 2, max: 128 }),
      },
      notes: form.aiNotes.trim().length ? form.aiNotes.trim() : null,
    } as Record<string, unknown>;
  }, [form.aiNotes, form.bestOf, form.format, form.maxEntrants, form.registrationType, form.start, form.timezone]);

  const applyBlueprint = React.useCallback(
    (data: {
      ladder: { name: string; summary: string | null; sections: Record<string, unknown>; config: Record<string, unknown> };
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
      }));

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
          const participant: ParticipantFormState = {
            displayName,
            handle:
              typeof record.handle === "string" && record.handle.trim().length ? record.handle.trim() : "",
            seed: Number.isFinite(seed) ? String(seed) : String(index + 1),
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
      setVisitedSteps((prev) => ({ ...prev, blueprint: true, content: true, participants: true }));
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
        goal: `Construct a ${form.format.replace(/_/g, " ")} tournament with Capsule AI coverage.`,
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
      handleStepSelect("details");
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
    resetMessages,
    router,
    selectedCapsule,
  ]);

  const completionMap = React.useMemo(
    () => ({
      blueprint: visitedSteps.blueprint && Boolean(form.overview.trim() || form.rules.trim() || form.broadcast.trim()),
      details: visitedSteps.details && Boolean(form.name.trim()),
      format: visitedSteps.format,
      content:
        visitedSteps.content &&
        Boolean(
          form.overview.trim() ||
            form.rules.trim() ||
            form.broadcast.trim() ||
            form.updates.trim() ||
            form.aiNotes.trim(),
        ),
      participants: visitedSteps.participants && participants.some((participant) => participant.displayName.trim().length),
      review: visitedSteps.review,
    }),
    [form.aiNotes, form.broadcast, form.name, form.overview, form.rules, form.updates, participants, visitedSteps],
  );

  const previewModel = React.useMemo<TournamentPreviewModel>(() => {
    const formatLabel =
      form.format === "single_elimination"
        ? "Single elimination"
        : form.format === "double_elimination"
          ? "Double elimination"
          : "Round robin";
    const maxEntrants = parseInteger(form.maxEntrants, 16, { min: 2, max: 128 });
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
        id: "production",
        title: "Production notes",
        body: form.aiNotes.trim() || "Call out sponsors, themes, or Capsule AI touches.",
      },
    ];
    return {
      title: form.name.trim() || "Untitled tournament",
      summary: form.summary.trim(),
      capsuleName: selectedCapsule?.name ?? "Capsule",
      format: formatLabel,
      registration: `${form.registrationType} · cap ${maxEntrants}`,
      kickoff: kickoffParts.length ? kickoffParts.join(" | ") : "Kickoff time TBD",
      sections,
      participants: trimmedParticipants.map((participant, index) => ({
        name: participant.displayName.trim(),
        handle: participant.handle.trim(),
        seed: participant.seed.trim() || String(index + 1),
      })),
    };
  }, [
    form.aiNotes,
    form.broadcast,
    form.format,
    form.maxEntrants,
    form.name,
    form.overview,
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
    handleParticipantEntityType,
    handleParticipantEntityId,
    handleParticipantSuggestion,
    handleInvite,
    handleGenerateDraft,
    createTournament,
    resetFormState,
    setShowInvite,
    setStatusMessage,
  };
};
