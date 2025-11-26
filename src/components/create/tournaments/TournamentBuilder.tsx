"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { CapsuleGate } from "@/components/capsule/CapsuleGate";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChatStartOverlay } from "@/components/chat/ChatStartOverlay";
import { useOptionalFriendsDataContext } from "@/components/providers/FriendsDataProvider";
import type { UserSearchResult, CapsuleSearchResult } from "@/types/search";
import type { CapsuleSummary } from "@/server/capsules/service";
import styles from "../ladders/LadderBuilder.module.css";
import { WizardLayout, type WizardLayoutStep } from "../ladders/components/WizardLayout";

type FormatOption = "single_elimination" | "double_elimination" | "round_robin";
type RegistrationType = "open" | "invite" | "waitlist" | "mixed";
type TournamentStepId = "blueprint" | "details" | "format" | "content" | "participants" | "review";
type ParticipantEntityType = "custom" | "user" | "capsule";

type TournamentFormState = {
  name: string;
  summary: string;
  visibility: "private" | "capsule" | "public";
  publish: boolean;
  format: FormatOption;
  bestOf: string;
  start: string;
  timezone: string;
  registrationType: RegistrationType;
  maxEntrants: string;
  overview: string;
  rules: string;
  broadcast: string;
  updates: string;
  aiNotes: string;
};

type ParticipantFormState = {
  id?: string;
  displayName: string;
  handle: string;
  seed: string;
  entityType: ParticipantEntityType;
  userId: string;
  capsuleId: string;
};

type TournamentBuilderProps = {
  capsules: CapsuleSummary[];
  initialCapsuleId?: string | null;
};

type TournamentPreviewModel = {
  title: string;
  summary: string;
  capsuleName: string;
  format: string;
  registration: string;
  kickoff: string;
  sections: Array<{ id: string; title: string; body: string }>;
  participants: Array<{ name: string; handle: string; seed: string }>;
};

type ParticipantSuggestion =
  | { kind: "user"; id: string; name: string; subtitle: string | null }
  | { kind: "capsule"; id: string; name: string; subtitle: string | null };

const MIN_NAME_QUERY = 2;
const SUGGESTION_LIMIT = 6;

const TOURNAMENT_STEPS: WizardLayoutStep<TournamentStepId>[] = [
  { id: "blueprint", title: "Blueprint", subtitle: "AI draft + structure" },
  { id: "details", title: "Details", subtitle: "Name, summary, visibility" },
  { id: "format", title: "Format", subtitle: "Bracket, registration, timing" },
  { id: "content", title: "Content", subtitle: "Sections & production notes" },
  { id: "participants", title: "Seeds", subtitle: "Entrants and seeds" },
  { id: "review", title: "Review", subtitle: "Preview & publish" },
];

const TOURNAMENT_STEP_ORDER = TOURNAMENT_STEPS.map((step) => step.id);

function trimOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function createDefaultForm(): TournamentFormState {
  return {
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
  };
}

function createEmptyParticipant(index: number): ParticipantFormState {
  return {
    displayName: "",
    handle: "",
    seed: String(index + 1),
    entityType: "custom",
    userId: "",
    capsuleId: "",
  };
}

function normalizeParticipants(list: ParticipantFormState[]): ParticipantFormState[] {
  return list.map((participant, index) => ({
    ...participant,
    seed: participant.seed.trim().length ? participant.seed : String(index + 1),
    entityType: participant.entityType ?? "custom",
    userId: participant.userId ?? "",
    capsuleId: participant.capsuleId ?? "",
  }));
}

function clamp(value: number, { min, max }: { min?: number; max?: number } = {}): number {
  let result = value;
  if (typeof min === "number") result = Math.max(min, result);
  if (typeof max === "number") result = Math.min(max, result);
  return result;
}

function parseInteger(value: string, fallback: number, options: { min?: number; max?: number } = {}): number {
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return clamp(parsed, options);
}

type NameFieldProps = {
  index: number;
  participant: ParticipantFormState;
  onChangeName: (value: string) => void;
  onSelectSuggestion: (suggestion: ParticipantSuggestion) => void;
};

const NameField = ({ index, participant, onChangeName, onSelectSuggestion }: NameFieldProps) => {
  const [query, setQuery] = React.useState(participant.displayName);
  const [open, setOpen] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<ParticipantSuggestion[]>([]);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    setQuery(participant.displayName);
  }, [participant.displayName]);

  React.useEffect(() => {
    const term = query.trim();
    if (term.length < MIN_NAME_QUERY) {
      abortRef.current?.abort();
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q: term, limit: SUGGESTION_LIMIT }),
          signal: controller.signal,
        });
        if (!response.ok) {
          setSuggestions([]);
          return;
        }
        const data = (await response.json().catch(() => null)) as
          | { sections?: Array<{ type: string; items?: Array<UserSearchResult | CapsuleSearchResult> }> }
          | null;
        const sections = Array.isArray(data?.sections) ? data?.sections : [];
        const users = sections.find((section) => section.type === "users");
        const capsules = sections.find((section) => section.type === "capsules");
        const userSuggestions =
          Array.isArray(users?.items) && users.items.length
            ? (users.items as UserSearchResult[]).slice(0, SUGGESTION_LIMIT).map((user) => ({
                kind: "user" as const,
                id: user.id,
                name: user.name,
                subtitle: user.subtitle,
              }))
            : [];
        const capsuleSuggestions =
          Array.isArray(capsules?.items) && capsules.items.length
            ? (capsules.items as CapsuleSearchResult[]).slice(0, SUGGESTION_LIMIT).map((capsule) => ({
                kind: "capsule" as const,
                id: capsule.id,
                name: capsule.name,
                subtitle: capsule.subtitle,
              }))
            : [];
        setSuggestions([...userSuggestions, ...capsuleSuggestions].slice(0, SUGGESTION_LIMIT));
      } catch {
        setSuggestions([]);
      }
    }, 140);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const handleSelect = (suggestion: ParticipantSuggestion) => {
    setQuery(suggestion.name);
    onSelectSuggestion(suggestion);
    setOpen(false);
  };

  return (
    <div className={styles.memberField}>
      <div className={styles.memberSuggestWrap}>
        <Input
          id={`participant-name-${index}`}
          value={query}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            onChangeName(value);
          }}
          placeholder="Search users or capsules"
        />
        {open && suggestions.length > 0 ? (
          <div className={styles.memberSuggestList} role="listbox" aria-label="Suggested entrants">
            {suggestions.map((suggestion) => (
              <button
                key={`${suggestion.kind}-${suggestion.id}`}
                type="button"
                className={styles.memberSuggestItem}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelect(suggestion)}
              >
                <span className={styles.memberSuggestName}>{suggestion.name}</span>
                <span className={styles.memberSuggestMeta}>
                  {suggestion.kind === "user" ? "User" : "Capsule"}
                  {suggestion.subtitle ? ` • ${suggestion.subtitle}` : ""}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export function TournamentBuilder({ capsules, initialCapsuleId = null }: TournamentBuilderProps) {
  const router = useRouter();
  const [capsuleList, setCapsuleList] = React.useState<CapsuleSummary[]>(capsules);
  const [selectedCapsule, setSelectedCapsule] = React.useState<CapsuleSummary | null>(() => {
    if (!initialCapsuleId) return null;
    return capsules.find((capsule) => capsule.id === initialCapsuleId) ?? null;
  });

  React.useEffect(() => {
    setCapsuleList(capsules);
  }, [capsules]);

  React.useEffect(() => {
    if (!selectedCapsule) return;
    const exists = capsules.some((capsule) => capsule.id === selectedCapsule.id);
    if (!exists) setSelectedCapsule(null);
  }, [capsules, selectedCapsule]);

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
  const [visitedSteps, setVisitedSteps] = React.useState<Record<TournamentStepId, boolean>>({
    blueprint: true,
    details: false,
    format: false,
    content: false,
    participants: false,
    review: false,
  });
  const [showOptions, setShowOptions] = React.useState(false);
  const [showPreviewOverlay, setShowPreviewOverlay] = React.useState(false);
  const formContentRef = React.useRef<HTMLDivElement | null>(null);
  const friendsContext = useOptionalFriendsDataContext();
  const [showInvite, setShowInvite] = React.useState(false);

  const stepIndex = React.useMemo(() => TOURNAMENT_STEP_ORDER.indexOf(activeStep), [activeStep]);
  const previousStepId = stepIndex > 0 ? TOURNAMENT_STEP_ORDER[stepIndex - 1] : null;
  const nextStepId =
    stepIndex >= 0 && stepIndex < TOURNAMENT_STEP_ORDER.length - 1
      ? TOURNAMENT_STEP_ORDER[stepIndex + 1]
      : null;
  const nextStep = nextStepId ? TOURNAMENT_STEPS.find((step) => step.id === nextStepId) : null;

  const resetMessages = React.useCallback(() => {
    setStatusMessage(null);
    setErrorMessage(null);
  }, []);

  const resetFormState = React.useCallback(() => {
    setForm(createDefaultForm());
    setParticipants([createEmptyParticipant(0), createEmptyParticipant(1)]);
    setActiveStep("blueprint");
    setVisitedSteps({
      blueprint: true,
      details: false,
      format: false,
      content: false,
      participants: false,
      review: false,
    });
    resetMessages();
  }, [resetMessages]);

  const handleCapsuleChange = React.useCallback(
    (capsule: CapsuleSummary | null) => {
      setSelectedCapsule(capsule);
      resetMessages();
    },
    [resetMessages],
  );

  const handleStepSelect = React.useCallback((stepId: TournamentStepId) => {
    setActiveStep(stepId);
    setVisitedSteps((prev) => ({ ...prev, [stepId]: true }));
    setShowOptions(false);
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

  const handleParticipantEntityType = React.useCallback(
    (index: number, entityType: ParticipantEntityType) => {
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
    },
    [],
  );

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
          const userId = typeof (record as { userId?: unknown }).userId === "string" ? (record as { userId?: string }).userId?.trim() ?? "" : "";
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
              typeof record.handle === "string" && record.handle.trim().length
                ? record.handle.trim()
                : "",
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
        const message =
          data?.error?.message ?? data?.message ?? "We couldn't generate a tournament blueprint.";
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
        const message =
          payload?.error?.message ?? payload?.message ?? "Unable to create the tournament.";
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
    buildMetaPayload,
  ]);

  const completionMap = React.useMemo(
    () => ({
      blueprint: visitedSteps.blueprint && Boolean(form.overview.trim() || form.rules.trim() || form.broadcast.trim()),
      details: visitedSteps.details && Boolean(form.name.trim()),
      format: visitedSteps.format,
      content:
        visitedSteps.content &&
        Boolean(form.overview.trim() || form.rules.trim() || form.broadcast.trim() || form.updates.trim() || form.aiNotes.trim()),
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
      { id: "overview", title: "Overview", body: form.overview.trim() || form.summary.trim() || "Add an overview to set the tone." },
      { id: "rules", title: "Rules & format", body: form.rules.trim() || "Call out map pools, formats, and disputes." },
      { id: "broadcast", title: "Broadcast & spotlight", body: form.broadcast.trim() || "List casters, streams, or social coverage." },
      { id: "updates", title: "Updates & highlights", body: form.updates.trim() || "Use this for check-ins, results, and recap notes." },
      { id: "notes", title: "AI notes", body: form.aiNotes.trim() || "Production reminders for Capsule AI." },
    ];

    return {
      title: form.name.trim() || "Untitled tournament",
      summary:
        form.summary.trim() ||
        "Capsule AI will narrate highlights, manage seeds, and keep your bracket hype rolling.",
      capsuleName: selectedCapsule?.name ?? "Selected capsule",
      format: `${formatLabel} | Bo${form.bestOf.trim() || "3"} | Max ${maxEntrants}`,
      registration:
        form.registrationType === "open"
          ? "Open registration"
          : form.registrationType === "invite"
            ? "Invite-only"
            : form.registrationType === "waitlist"
              ? "Waitlist"
              : "Mixed",
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
    form.bestOf,
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

  const renderPreviewPanel = () => {
    return (
      <div className={styles.previewEmbed}>
        <div className={styles.previewCard}>
          <div className={styles.previewHeader}>
            <div>
              <span className={styles.previewLabel}>Tournament preview</span>
              <h3 className={styles.previewTitle}>{previewModel.title}</h3>
              {previewModel.summary ? <p className={styles.previewSummary}>{previewModel.summary}</p> : null}
            </div>
            <div className={styles.previewMeta}>
              <div className={styles.previewMetaBlock}>
                <span className={styles.previewMetaLabel}>Capsule</span>
                <span className={styles.previewMetaValue}>{previewModel.capsuleName}</span>
              </div>
              <div className={styles.previewMetaBlock}>
                <span className={styles.previewMetaLabel}>Format</span>
                <span className={styles.previewMetaValue}>{previewModel.format}</span>
                <span className={styles.previewMetaHint}>{previewModel.registration}</span>
              </div>
              <div className={styles.previewMetaBlock}>
                <span className={styles.previewMetaLabel}>Kickoff</span>
                <span className={styles.previewMetaValue}>{previewModel.kickoff}</span>
              </div>
            </div>
          </div>
          <div className={styles.previewSections}>
            {previewModel.sections.map((section) => (
              <div key={section.id} className={styles.previewSection}>
                <h4>{section.title}</h4>
                <p>{section.body}</p>
              </div>
            ))}
          </div>
          <div className={styles.previewRoster}>
            <div className={styles.previewHeader}>
              <div>
                <span className={styles.previewLabel}>Seeds</span>
                <h3 className={styles.previewTitle}>Top entrants</h3>
              </div>
            </div>
            <ul>
              {previewModel.participants.length ? (
                previewModel.participants.slice(0, 12).map((participant, index) => {
                  const initials =
                    participant.name
                      .split(/\s+/)
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((part) => part.charAt(0).toUpperCase())
                      .join("") || "??";
                  return (
                    <li key={`${participant.name}-${index}`} className={styles.previewRosterItem}>
                      <span className={styles.previewAvatar}>
                        <span className={styles.previewAvatarText}>{initials}</span>
                      </span>
                      <div className={styles.previewMemberMeta}>
                        <span className={styles.previewMemberName}>{participant.name}</span>
                        <span className={styles.previewMemberStats}>
                          Seed {participant.seed}
                          {participant.handle ? ` | ${participant.handle}` : ""}
                        </span>
                      </div>
                      <span className={styles.previewTeamChip}>#{participant.seed}</span>
                    </li>
                  );
                })
              ) : (
                <li className={styles.previewEmpty}>Add entrants to preview seeds.</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    );
  };

  const renderStatus = () => {
    if (!errorMessage && !statusMessage) return null;
    return (
      <div className={styles.toastStack}>
        {errorMessage ? (
          <Alert tone="danger">
            <AlertTitle>Tournament builder</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}
        {statusMessage ? (
          <Alert tone="success">
            <AlertTitle>Saved</AlertTitle>
            <AlertDescription>{statusMessage}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    );
  };

  const renderBlueprintStep = () => (
    <div className={styles.sectionCard}>
      <div className={styles.fieldGroup}>
        <p className={styles.fieldHint}>
          Mirror the ladder design ideas: start with a blueprint, keep the neon glass UI, and reuse the same preview + navigation controls.
        </p>
        <div className={styles.fieldGroupRow}>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="blueprint-format">
              Format focus
            </label>
            <Input id="blueprint-format" value={form.format.replace(/_/g, " ")} readOnly aria-readonly />
            <p className={styles.fieldHint}>Pick a different format on the next step if you need to.</p>
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="blueprint-max">
              Max entrants
            </label>
            <Input
              id="blueprint-max"
              value={form.maxEntrants}
              onChange={(event) => handleFormChange("maxEntrants", event.target.value)}
              placeholder="16"
            />
          </div>
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="blueprint-summary">
            What should Capsule AI emphasize?
          </label>
          <textarea
            id="blueprint-summary"
            className={styles.textarea}
            rows={3}
            value={form.summary}
            placeholder="Prize pool, caster notes, format quirks..."
            onChange={(event) => handleFormChange("summary", event.target.value)}
          />
          <p className={styles.fieldHint}>We reuse this prompt when generating overview/rules copy.</p>
        </div>
        <div className={styles.fieldGroupRow}>
          <Button type="button" variant="secondary" onClick={handleGenerateDraft} disabled={generating}>
            {generating ? "Generating..." : "Generate Capsule AI blueprint"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => handleStepSelect("details")}>
            Skip for now
          </Button>
        </div>
      </div>
    </div>
  );

  const renderDetailsStep = () => (
    <div className={styles.sectionCard}>
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="tournament-name">
          Tournament name
        </label>
        <Input
          id="tournament-name"
          value={form.name}
          placeholder="Capsule Clash Invitational"
          onChange={(event) => handleFormChange("name", event.target.value)}
        />
      </div>
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="tournament-summary">
          Summary
        </label>
        <textarea
          id="tournament-summary"
          className={styles.textarea}
          rows={3}
          value={form.summary}
          placeholder="Double-elimination showdown with Capsule AI narrating every upset."
          onChange={(event) => handleFormChange("summary", event.target.value)}
        />
      </div>
      <div className={styles.fieldGroup}>
        <label className={styles.label}>Visibility</label>
        <div className={styles.radioRow}>
          {(["private", "capsule", "public"] as const).map((option) => (
            <label key={option} className={styles.radioLabel}>
              <input
                type="radio"
                name="tournament-visibility"
                checked={form.visibility === option}
                onChange={() => handleFormChange("visibility", option)}
              />
              <span className={styles.radioText}>
                {option === "private"
                  ? "Private (organizers only)"
                  : option === "capsule"
                    ? "Capsule members"
                    : "Public"}
              </span>
            </label>
          ))}
        </div>
      </div>
      <div className={styles.checkboxRow}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={form.publish}
            onChange={(event) => handleFormChange("publish", event.target.checked)}
          />
          <span>Publish to Capsule Events after saving</span>
        </label>
      </div>
    </div>
  );

  const renderFormatStep = () => (
    <div className={styles.sectionCard}>
      <div className={styles.fieldGroup}>
        <label className={styles.label}>Format</label>
        <div className={styles.radioRow}>
          {(["single_elimination", "double_elimination", "round_robin"] as const).map((option) => (
            <label key={option} className={styles.radioLabel}>
              <input
                type="radio"
                name="tournament-format"
                checked={form.format === option}
                onChange={() => handleFormChange("format", option)}
              />
              <span className={styles.radioText}>
                {option === "single_elimination"
                  ? "Single Elimination"
                  : option === "double_elimination"
                    ? "Double Elimination"
                    : "Round Robin"}
              </span>
            </label>
          ))}
        </div>
      </div>
      <div className={styles.fieldGroupRow}>
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="best-of">
            Best-of
          </label>
          <Input
            id="best-of"
            value={form.bestOf}
            onChange={(event) => handleFormChange("bestOf", event.target.value)}
            placeholder="3"
          />
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="max-entrants">
            Max entrants
          </label>
          <Input
            id="max-entrants"
            value={form.maxEntrants}
            onChange={(event) => handleFormChange("maxEntrants", event.target.value)}
            placeholder="16"
          />
        </div>
      </div>
      <div className={styles.fieldGroupRow}>
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="start-time">
            Start time
          </label>
          <Input
            id="start-time"
            value={form.start}
            onChange={(event) => handleFormChange("start", event.target.value)}
            placeholder="Saturday 3pm PT"
          />
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="timezone">
            Timezone
          </label>
          <Input
            id="timezone"
            value={form.timezone}
            onChange={(event) => handleFormChange("timezone", event.target.value)}
            placeholder="Pacific Time"
          />
        </div>
      </div>
      <div className={styles.fieldGroup}>
        <label className={styles.label}>Registration type</label>
        <div className={styles.radioRow}>
          {(["open", "invite", "waitlist", "mixed"] as const).map((option) => (
            <label key={option} className={styles.radioLabel}>
              <input
                type="radio"
                name="registration-type"
                checked={form.registrationType === option}
                onChange={() => handleFormChange("registrationType", option)}
              />
              <span className={styles.radioText}>
                {option === "open"
                  ? "Open to anyone"
                  : option === "invite"
                    ? "Invite-only"
                    : option === "waitlist"
                      ? "Waitlist"
                      : "Mixed"}
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );

  const renderContentStep = () => (
    <div className={styles.sectionCard}>
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="overview">
          Overview
        </label>
        <textarea
          id="overview"
          className={styles.textarea}
          rows={3}
          value={form.overview}
          onChange={(event) => handleFormChange("overview", event.target.value)}
        />
      </div>
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="rules">
          Rules & format
        </label>
        <textarea
          id="rules"
          className={styles.textarea}
          rows={3}
          value={form.rules}
          onChange={(event) => handleFormChange("rules", event.target.value)}
        />
      </div>
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="broadcast">
          Broadcast & coverage
        </label>
        <textarea
          id="broadcast"
          className={styles.textarea}
          rows={3}
          value={form.broadcast}
          onChange={(event) => handleFormChange("broadcast", event.target.value)}
        />
      </div>
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="updates">
          Updates & highlights
        </label>
        <textarea
          id="updates"
          className={styles.textarea}
          rows={3}
          value={form.updates}
          onChange={(event) => handleFormChange("updates", event.target.value)}
        />
      </div>
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="ai-notes">
          AI notes
        </label>
        <textarea
          id="ai-notes"
          className={styles.textarea}
          rows={2}
          value={form.aiNotes}
          placeholder="Key storylines, production cues, or prizing callouts."
          onChange={(event) => handleFormChange("aiNotes", event.target.value)}
        />
      </div>
    </div>
  );

  const renderParticipantsStep = () => (
    <div className={styles.sectionCard}>
      <div className={styles.membersTableWrap}>
        <table className={styles.membersTable}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Handle</th>
              <th>Seed</th>
              <th>Link (user/capsule)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {participants.map((participant, index) => (
              <tr key={participant.id ?? `participant-${index}`}>
                <td>
                  <NameField
                    index={index}
                    participant={participant}
                    onChangeName={(value) => handleParticipantChange(index, "displayName", value)}
                    onSelectSuggestion={(suggestion) => handleParticipantSuggestion(index, suggestion)}
                  />
                </td>
                <td>
                  <Input
                    value={participant.handle}
                    placeholder="@captain or contact"
                    onChange={(event) => handleParticipantChange(index, "handle", event.target.value)}
                  />
                </td>
                <td>
                  <Input
                    value={participant.seed}
                    onChange={(event) => handleParticipantChange(index, "seed", event.target.value)}
                  />
                </td>
                <td>
                  <div className={styles.fieldGroup} style={{ margin: 0 }}>
                    <select
                      className={styles.select}
                      value={participant.entityType}
                      onChange={(event) =>
                        handleParticipantEntityType(index, event.target.value as ParticipantEntityType)
                      }
                    >
                      <option value="custom">Custom name</option>
                      <option value="user">User id</option>
                      <option value="capsule">Capsule id</option>
                    </select>
                    {participant.entityType !== "custom" ? (
                      <Input
                        value={
                          participant.entityType === "user" ? participant.userId : participant.entityType === "capsule" ? participant.capsuleId : ""
                        }
                        placeholder={participant.entityType === "user" ? "user id" : "capsule id"}
                        onChange={(event) => handleParticipantEntityId(index, event.target.value)}
                      />
                    ) : (
                      <p className={styles.fieldHint}>Leave unlinked for custom entrants.</p>
                    )}
                  </div>
                </td>
                <td>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeParticipant(index)}>
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.memberActionsRow}>
        <Button
          type="button"
          variant="secondary"
          className={styles.memberActionButton}
          onClick={addParticipant}
        >
          Add participant
        </Button>
        <Button
          type="button"
          variant="secondary"
          className={styles.memberInviteButton}
          onClick={() => setShowInvite(true)}
        >
          Invite
        </Button>
      </div>
    </div>
  );

  const renderReviewStep = () => (
    <div className={styles.sectionCard}>
      <div className={styles.fieldGroupRow}>
        <div className={styles.fieldGroup}>
          <label className={styles.label}>Visibility</label>
          <p className={styles.fieldHint}>
            {form.visibility === "public" ? "Public" : form.visibility === "capsule" ? "Capsule members" : "Private"}
          </p>
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.label}>Publish state</label>
          <p className={styles.fieldHint}>{form.publish ? "Publish immediately" : "Save as draft"}</p>
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.label}>Seeds</label>
          <p className={styles.fieldHint}>
            {participants.filter((participant) => participant.displayName.trim().length).length} entrants
          </p>
        </div>
      </div>
      <p className={styles.fieldHint}>
        Use the Preview button to confirm the capsule layout matches the ladder design language before publishing.
      </p>
    </div>
  );

  const renderActiveStep = () => {
    if (activeStep === "blueprint") return renderBlueprintStep();
    if (activeStep === "details") return renderDetailsStep();
    if (activeStep === "format") return renderFormatStep();
    if (activeStep === "content") return renderContentStep();
    if (activeStep === "participants") return renderParticipantsStep();
    return renderReviewStep();
  };

  if (!selectedCapsule) {
    return (
      <div className={styles.gateWrap}>
        <CapsuleGate
          capsules={capsuleList}
          defaultCapsuleId={initialCapsuleId ?? null}
          forceSelector
          autoActivate={false}
          selectorTitle="Pick a capsule for your tournament"
          selectorSubtitle="Capsule AI will reference this community when crafting your bracket plan."
          onCapsuleChosen={handleCapsuleChange}
        />
      </div>
    );
  }

  const controlsStart = (
    <>
      <Button type="button" variant="ghost" onClick={handlePreviousStep} disabled={!previousStepId}>
        Back
      </Button>
      <div className={styles.moreActions}>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setShowOptions((prev) => !prev)}
          aria-expanded={showOptions}
        >
          Options
        </Button>
        {showOptions ? (
          <div className={styles.moreMenu} role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                handleCapsuleChange(null);
                setShowOptions(false);
              }}
            >
              Switch capsule
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                resetFormState();
                setShowOptions(false);
              }}
            >
              Reset tournament
            </button>
          </div>
        ) : null}
      </div>
    </>
  );

  const controlsEnd =
    activeStep !== "review" ? (
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
            setVisitedSteps((prev) => ({ ...prev, [activeStep]: true }));
            handleNextStep();
          }}
          disabled={!nextStepId}
        >
          {nextStep ? `Next: ${nextStep.title}` : "Next"}
        </Button>
      </>
    ) : (
      <Button type="button" onClick={createTournament} disabled={isSaving}>
        {isSaving ? "Saving tournament..." : form.publish ? "Publish tournament" : "Save tournament draft"}
      </Button>
    );

  const formContent = (
    <>
      <header className={styles.stepHero}>
        <span className={styles.stepHeroLabel}>Tournament wizard</span>
        <h1 className={styles.stepHeroTitle}>Design your bracket plan</h1>
        <p className={styles.stepHeroSubtitle}>
          Guided steps, blueprint, preview, and controls now mirror the ladder builder so tokens stay cohesive.
        </p>
      </header>

      <div className={styles.selectedCapsuleBanner}>
        <div>
          <div className={styles.capsuleLabel}>Capsule</div>
          <div className={styles.capsuleName}>{selectedCapsule.name}</div>
        </div>
        <Button type="button" variant="ghost" onClick={() => handleCapsuleChange(null)}>
          Switch capsule
        </Button>
      </div>

      {renderStatus()}
      {renderActiveStep()}
    </>
  );

  const previewPanel = renderPreviewPanel();

  return (
    <>
      <div className={styles.builderWrap}>
        <div className={styles.wizardPanel}>
          <div className={styles.panelGlow} aria-hidden />
          <WizardLayout
            stepperLabel="Tournament"
            steps={TOURNAMENT_STEPS}
            activeStepId={activeStep}
            completionMap={completionMap}
            onStepSelect={handleStepSelect}
            formContentRef={formContentRef}
            formContent={formContent}
            controlsStart={controlsStart}
            controlsEnd={controlsEnd}
            previewPanel={previewPanel}
          />
          {showPreviewOverlay ? (
            <div className={styles.mobileSheet} role="dialog" aria-modal="true" aria-label="Tournament preview">
              <div className={styles.mobileSheetBackdrop} onClick={() => setShowPreviewOverlay(false)} />
              <div className={`${styles.mobileSheetBody} ${styles.desktopPreviewSheet}`}>
                <div className={styles.mobileSheetHeader}>
                  <span className={styles.mobileSheetTitle}>Tournament preview</span>
                  <button
                    type="button"
                    className={styles.mobileSheetClose}
                    onClick={() => setShowPreviewOverlay(false)}
                    aria-label="Close tournament preview"
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
        </div>
      </div>
      <ChatStartOverlay
        open={showInvite}
        friends={friendsContext?.friends ?? []}
        busy={false}
        onClose={() => setShowInvite(false)}
        onSubmit={handleInvite}
        mode="tournament"
      />
    </>
  );
}
