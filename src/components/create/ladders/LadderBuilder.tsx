"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { CapsuleGate } from "@/components/capsule/CapsuleGate";
import type { CapsuleSummary } from "@/server/capsules/service";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import styles from "./LadderBuilder.module.css";

type SectionKey = "overview" | "rules" | "shoutouts" | "upcoming" | "results";

type SectionFormState = {
  title: string;
  body: string;
  bullets: string;
};

type CustomSectionFormState = SectionFormState & { id: string };

type GameFormState = {
  title: string;
  mode: string;
  platform: string;
  region: string;
};

type ScoringFormState = {
  initialRating: string;
  kFactor: string;
  placementMatches: string;
};

type ScheduleFormState = {
  cadence: string;
  kickoff: string;
  timezone: string;
};

type RegistrationFormState = {
  type: "open" | "invite" | "waitlist";
  maxTeams: string;
  requirements: string;
};

type MemberFormState = {
  id?: string;
  displayName: string;
  handle: string;
  seed: string;
  rating: string;
  wins: string;
  losses: string;
  draws: string;
  streak: string;
};

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

const SECTION_KEYS: SectionKey[] = ["overview", "rules", "shoutouts", "upcoming", "results"];

function trimOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function clampInteger(value: number, { min, max }: { min?: number; max?: number } = {}): number {
  let result = value;
  if (typeof min === "number") {
    result = Math.max(min, result);
  }
  if (typeof max === "number") {
    result = Math.min(max, result);
  }
  return result;
}

function parseIntegerInput(
  value: string,
  fallback: number,
  options: { min?: number; max?: number } = {},
): number {
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return clampInteger(parsed, options);
}

function parseOptionalIntegerInput(
  value: string,
  options: { min?: number; max?: number } = {},
): number | null {
  const trimmed = value.trim();
  if (!trimmed.length) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) return null;
  return clampInteger(parsed, options);
}

function createEmptyMember(index: number): MemberFormState {
  return {
    displayName: "",
    handle: "",
    seed: String(index + 1),
    rating: "1200",
    wins: "0",
    losses: "0",
    draws: "0",
    streak: "0",
  };
}

function normalizeMemberList(list: MemberFormState[]): MemberFormState[] {
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

function createDefaultSections(): Record<SectionKey, SectionFormState> {
  return {
    overview: { title: "Ladder Overview", body: "", bullets: "" },
    rules: { title: "Core Rules", body: "", bullets: "" },
    shoutouts: { title: "Shoutouts & Highlights", body: "", bullets: "" },
    upcoming: { title: "Upcoming Challenges", body: "", bullets: "" },
    results: { title: "Recent Results", body: "", bullets: "" },
  };
}

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

  const [form, setForm] = React.useState(() => ({
    name: "",
    summary: "",
    visibility: "capsule" as "private" | "capsule" | "public",
    publish: false,
    sections: createDefaultSections(),
    customSections: [] as CustomSectionFormState[],
    game: { title: "", mode: "", platform: "", region: "" } satisfies GameFormState,
    scoring: { initialRating: "1200", kFactor: "32", placementMatches: "3" } satisfies ScoringFormState,
    schedule: { cadence: "Weekly rounds", kickoff: "Mondays 7 PM", timezone: "" } satisfies ScheduleFormState,
    registration: {
      type: "open" as RegistrationFormState["type"],
      maxTeams: "",
      requirements: "",
    } satisfies RegistrationFormState,
  }));

  const [members, setMembers] = React.useState<MemberFormState[]>(() => [createEmptyMember(0)]);
  const [aiPlan, setAiPlan] = React.useState<AiPlanState | null>(null);
  const [meta, setMeta] = React.useState<Record<string, unknown>>({ variant: "ladder" });

  const [seed, setSeed] = React.useState({
    goal: "",
    audience: "",
    tone: "",
    capsuleBrief: "",
    seasonLengthWeeks: "",
    participants: "",
    timezone: "",
    registrationNotes: "",
    existingRules: "",
    notes: "",
    gameTitle: "",
    gameMode: "",
    gamePlatform: "",
    gameRegion: "",
    prizeIdeas: "",
    announcementsFocus: "",
    shoutouts: "",
  });

  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isGenerating, setGenerating] = React.useState(false);
  const [isSaving, setSaving] = React.useState(false);

  const handleCapsuleChange = React.useCallback((capsule: CapsuleSummary | null) => {
    setSelectedCapsule(capsule);
    setStatusMessage(null);
    setErrorMessage(null);
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

  const handleSectionChange = React.useCallback(
    (key: SectionKey, field: keyof SectionFormState, value: string) => {
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
    },
    [],
  );

  const handleGameChange = React.useCallback((field: keyof GameFormState, value: string) => {
    setForm((prev) => ({
      ...prev,
      game: {
        ...prev.game,
        [field]: value,
      },
    }));
  }, []);

  const handleScoringChange = React.useCallback((field: keyof ScoringFormState, value: string) => {
    setForm((prev) => ({
      ...prev,
      scoring: {
        ...prev.scoring,
        [field]: value,
      },
    }));
  }, []);

  const handleScheduleChange = React.useCallback(
    (field: keyof ScheduleFormState, value: string) => {
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
    (field: keyof RegistrationFormState, value: string) => {
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
    (index: number, field: keyof MemberFormState, value: string) => {
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
    setMembers((prev) => normalizeMemberList([...prev, createEmptyMember(prev.length)]));
  }, []);

  const removeMember = React.useCallback((index: number) => {
    setMembers((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) {
        return [createEmptyMember(0)];
      }
      return normalizeMemberList(next);
    });
  }, []);

  const resetMessages = React.useCallback(() => {
    setStatusMessage(null);
    setErrorMessage(null);
  }, []);

  const applyBlueprint = React.useCallback((data: LadderBlueprint) => {
    const ladder = data.ladder;

    setForm((prev) => {
      const next = { ...prev };
      next.name = ladder.name ?? prev.name;
      next.summary = ladder.summary ?? "";
      next.visibility = ladder.visibility;
      next.publish = ladder.publish;

      const sections = ladder.sections && typeof ladder.sections === "object" ? ladder.sections : {};
      const updatedSections = { ...createDefaultSections() };
      SECTION_KEYS.forEach((key) => {
        const raw = (sections as Record<string, unknown>)[key];
        if (raw && typeof raw === "object") {
          const source = raw as Record<string, unknown>;
          updatedSections[key] = {
            title: typeof source.title === "string" ? source.title : updatedSections[key].title,
            body: typeof source.body === "string" ? source.body : "",
            bullets: Array.isArray(source.bulletPoints)
              ? (source.bulletPoints as unknown[])
                  .map((entry) => (typeof entry === "string" ? entry : ""))
                  .filter((entry) => entry.trim().length)
                  .join("\n")
              : "",
          };
        }
      });
      next.sections = updatedSections;

      if (Array.isArray((sections as Record<string, unknown>).custom)) {
        const customList = ((sections as Record<string, unknown>).custom as unknown[])
          .map((entry) => {
            if (!entry || typeof entry !== "object") return null;
            const block = entry as Record<string, unknown>;
            const title =
              typeof block.title === "string" && block.title.trim().length
                ? block.title
                : "Custom Section";
            const body = typeof block.body === "string" ? block.body : "";
            const bullets = Array.isArray(block.bulletPoints)
              ? (block.bulletPoints as unknown[])
                  .map((b) => (typeof b === "string" ? b : ""))
                  .filter((b) => b.trim().length)
                  .join("\n")
              : "";
            return {
              id: (typeof block.id === "string" && block.id.trim().length ? block.id : crypto.randomUUID()),
              title,
              body,
              bullets,
            };
          })
          .filter((entry): entry is CustomSectionFormState => Boolean(entry));
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
        initialRating:
          typeof scoring.initialRating === "number"
            ? String(scoring.initialRating)
            : typeof scoring.initialRating === "string"
              ? scoring.initialRating
              : "1200",
        kFactor:
          typeof scoring.kFactor === "number"
            ? String(scoring.kFactor)
            : typeof scoring.kFactor === "string"
              ? scoring.kFactor
              : "32",
        placementMatches:
          typeof scoring.placementMatches === "number"
            ? String(scoring.placementMatches)
            : typeof scoring.placementMatches === "string"
              ? scoring.placementMatches
              : "3",
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
        timezone: typeof schedule.timezone === "string" ? schedule.timezone : "",
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
      };

      return next;
    });

    const blueprintMembers: MemberFormState[] = [];
    data.members.forEach((entry, index) => {
      const record = entry as Record<string, unknown>;
      const displayName =
        typeof record.displayName === "string"
          ? record.displayName.trim()
          : typeof record.name === "string"
            ? record.name.trim()
            : "";
      if (!displayName.length) {
        return;
      }
      const handleValue =
        typeof record.handle === "string"
          ? record.handle
          : typeof record.gamertag === "string"
            ? record.gamertag
            : "";
      const seedRaw =
        typeof record.seed === "string"
          ? record.seed
          : typeof record.seed === "number"
            ? String(record.seed)
            : "";
      const ratingRaw =
        typeof record.rating === "string"
          ? record.rating
          : typeof record.rating === "number"
            ? String(record.rating)
            : "";
      const winsRaw =
        typeof record.wins === "string"
          ? record.wins
          : typeof record.wins === "number"
            ? String(record.wins)
            : "";
      const lossesRaw =
        typeof record.losses === "string"
          ? record.losses
          : typeof record.losses === "number"
            ? String(record.losses)
            : "";
      const drawsRaw =
        typeof record.draws === "string"
          ? record.draws
          : typeof record.draws === "number"
            ? String(record.draws)
            : "";
      const streakRaw =
        typeof record.streak === "string"
          ? record.streak
          : typeof record.streak === "number"
            ? String(record.streak)
            : "";

      const seedValue =
        parseOptionalIntegerInput(seedRaw, { min: 1, max: 999 }) ?? index + 1;
      const member: MemberFormState = {
        displayName,
        handle: handleValue.trim(),
        seed: String(seedValue),
        rating: String(parseIntegerInput(ratingRaw, 1200, { min: 100, max: 4000 })),
        wins: String(parseIntegerInput(winsRaw, 0, { min: 0, max: 500 })),
        losses: String(parseIntegerInput(lossesRaw, 0, { min: 0, max: 500 })),
        draws: String(parseIntegerInput(drawsRaw, 0, { min: 0, max: 500 })),
        streak: String(parseIntegerInput(streakRaw, 0, { min: -20, max: 20 })),
      };
      if (typeof record.id === "string" && record.id.trim().length) {
        member.id = record.id.trim();
      }
      blueprintMembers.push(member);
    });
    setMembers(
      normalizeMemberList(
        blueprintMembers.length ? blueprintMembers : [createEmptyMember(0)],
      ),
    );

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
  }, []);

  React.useEffect(() => {
    void router;
  }, [router]);

  const convertSectionsToPayload = React.useCallback(() => {
    const sections: Record<string, unknown> = {};
    SECTION_KEYS.forEach((key) => {
      const section = form.sections[key];
      const title = section.title.trim().length ? section.title.trim() : key;
      const body = trimOrNull(section.body);
      const bulletPoints = section.bullets
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
          const body = trimOrNull(section.body);
          const bulletPoints = section.bullets
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
      const handle = trimOrNull(member.handle);
      const seedValue = parseOptionalIntegerInput(member.seed, { min: 1, max: 999 });
      const rating = parseIntegerInput(member.rating, 1200, { min: 100, max: 4000 });
      const wins = parseIntegerInput(member.wins, 0, { min: 0, max: 500 });
      const losses = parseIntegerInput(member.losses, 0, { min: 0, max: 500 });
      const draws = parseIntegerInput(member.draws, 0, { min: 0, max: 500 });
      const streak = parseIntegerInput(member.streak, 0, { min: -20, max: 20 });

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
    const initialRating = parseIntegerInput(form.scoring.initialRating, 1200, {
      min: 100,
      max: 4000,
    });
    const kFactor = parseIntegerInput(form.scoring.kFactor, 32, { min: 1, max: 128 });
    const placementMatches = parseIntegerInput(form.scoring.placementMatches, 3, {
      min: 0,
      max: 20,
    });
    const maxTeams = parseOptionalIntegerInput(form.registration.maxTeams, {
      min: 2,
      max: 999,
    });
    const requirements = form.registration.requirements
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

    const cadence = form.schedule.cadence.trim();
    const kickoff = form.schedule.kickoff.trim();
    const summary = form.summary.trim();

    const config: Record<string, unknown> = {
      scoring: {
        system: "elo",
        initialRating,
        kFactor,
        placementMatches,
      },
      schedule: {
        cadence: cadence.length ? cadence : "Weekly cadence",
        kickoff: kickoff.length ? kickoff : "TBD",
        timezone: trimOrNull(form.schedule.timezone),
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
      mode: trimOrNull(mode),
      platform: trimOrNull(platform),
      region: trimOrNull(region),
    };
  }, [form.game]);

  const generateDraft = React.useCallback(async () => {
    if (!selectedCapsule) {
      setErrorMessage("Pick a capsule to ground the ladder plan.");
      return;
    }
    resetMessages();
    setGenerating(true);
    try {
      const response = await fetch(
        `/api/capsules/${selectedCapsule.id}/ladders/draft`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            goal: seed.goal || undefined,
            audience: seed.audience || undefined,
            tone: seed.tone || undefined,
            capsuleBrief: seed.capsuleBrief || undefined,
            seasonLengthWeeks: seed.seasonLengthWeeks
              ? Number(seed.seasonLengthWeeks)
              : undefined,
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
        },
      );

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
      setStatusMessage("Draft created. Review the sections, roster, and config before publishing.");
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setGenerating(false);
    }
  }, [applyBlueprint, resetMessages, seed, selectedCapsule]);

  const createLadder = React.useCallback(async () => {
    if (!selectedCapsule) {
      setErrorMessage("Choose a capsule before creating the ladder.");
      return;
    }
    if (!form.name.trim().length) {
      setErrorMessage("Give your ladder a name.");
      return;
    }
    resetMessages();
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
          game: convertGameToPayload(),
          config: convertConfigToPayload(),
          sections: convertSectionsToPayload(),
          aiPlan: aiPlan ?? undefined,
          meta: meta ?? undefined,
          members: convertMembersToPayload(),
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message =
          payload?.error?.message ?? payload?.message ?? "Unable to create the ladder.";
        throw new Error(message);
      }

      const { ladder } = await response.json();
      setStatusMessage(
        form.publish
          ? "Ladder published! Check your Capsule Events tab to confirm the listing."
          : "Ladder saved as draft. Publish it from the Capsule Events tab when you're ready.",
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
    aiPlan,
    convertConfigToPayload,
    convertGameToPayload,
    convertMembersToPayload,
    convertSectionsToPayload,
    form.name,
    form.publish,
    form.summary,
    form.visibility,
    meta,
    resetMessages,
    router,
    selectedCapsule,
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
        <div className={styles.actionsRow}>
          <Button type="button" onClick={generateDraft} disabled={isGenerating}>
            {isGenerating ? "Drafting..." : "Generate Ladder Plan"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderGeneralForm = () => (
    <Card>
      <CardHeader>
        <CardTitle>Ladder basics</CardTitle>
        <CardDescription>Name it, decide visibility, and preview launch state.</CardDescription>
      </CardHeader>
      <CardContent className={styles.cardContent}>
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="ladder-name">
            Ladder name
          </label>
          <Input
            id="ladder-name"
            value={form.name}
            onChange={(event) => handleFormField("name", event.target.value)}
            placeholder="Community Champions S3"
          />
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="ladder-summary">
            Ladder summary
          </label>
          <textarea
            id="ladder-summary"
            className={styles.textarea}
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
            <select
              id="ladder-visibility"
              className={styles.select}
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
                  value={section.body}
                  onChange={(event) => handleSectionChange(key, "body", event.target.value)}
                  placeholder="Narrative or summary copy. Markdown accepted."
                  rows={4}
                />
                <textarea
                  className={styles.textarea}
                  value={section.bullets}
                  onChange={(event) => handleSectionChange(key, "bullets", event.target.value)}
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
        <CardDescription>{"Fine-tune the ladder's structure, scoring curve, and cadence."}</CardDescription>
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
                handleRegistrationChange("type", event.target.value as RegistrationFormState["type"])
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
        <CardTitle>Roster seeds</CardTitle>
        <CardDescription>Populate optional starting seeds or leave blank to onboard later.</CardDescription>
      </CardHeader>
      <CardContent className={styles.cardContent}>
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
              {members.map((member, index) => (
                <tr key={member.id ?? `member-${index}`}>
                  <td>
                    <Input
                      value={member.displayName}
                      onChange={(event) =>
                        handleMemberField(index, "displayName", event.target.value)}
                      placeholder="Player name"
                    />
                  </td>
                  <td>
                    <Input
                      value={member.handle}
                      onChange={(event) => handleMemberField(index, "handle", event.target.value)}
                      placeholder="@handle"
                    />
                  </td>
                  <td>
                    <Input
                      value={member.seed}
                      onChange={(event) => handleMemberField(index, "seed", event.target.value)}
                    />
                  </td>
                  <td>
                    <Input
                      value={member.rating}
                      onChange={(event) => handleMemberField(index, "rating", event.target.value)}
                    />
                  </td>
                  <td>
                    <Input
                      value={member.wins}
                      onChange={(event) => handleMemberField(index, "wins", event.target.value)}
                    />
                  </td>
                  <td>
                    <Input
                      value={member.losses}
                      onChange={(event) => handleMemberField(index, "losses", event.target.value)}
                    />
                  </td>
                  <td>
                    <Input
                      value={member.draws}
                      onChange={(event) => handleMemberField(index, "draws", event.target.value)}
                    />
                  </td>
                  <td>
                    <Input
                      value={member.streak}
                      onChange={(event) => handleMemberField(index, "streak", event.target.value)}
                    />
                  </td>
                  <td>
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
              ))}
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
  if (!selectedCapsule) {
    return (
      <div className={styles.gateWrap}>
        <CapsuleGate
          capsules={capsuleList}
          defaultCapsuleId={initialCapsuleId ?? null}
          forceSelector
          autoActivate={false}
          selectorTitle="Pick a capsule for your ladder"
          selectorSubtitle="Weâ€™ll use this spaceâ€™s community profile when drafting copy and formats."
          onCapsuleChosen={handleCapsuleChange}
        />
      </div>
    );
  }

  return (
    <div className={styles.builderWrap}>
      <div className={styles.selectedCapsuleBanner}>
        <div>
          <div className={styles.capsuleLabel}>Capsule</div>
          <div className={styles.capsuleName}>{selectedCapsule.name}</div>
        </div>
        <Button type="button" variant="ghost" onClick={() => handleCapsuleChange(null)}>
          Switch capsule
        </Button>
      </div>

      {errorMessage ? <div className={styles.errorMessage}>{errorMessage}</div> : null}
      {statusMessage ? <div className={styles.statusMessage}>{statusMessage}</div> : null}

      <div className={styles.grid}>
        {renderGeneralForm()}
        {renderSeedForm()}
      </div>

      <div className={styles.grid}>
        {renderSectionsForm()}
        {renderConfigForm()}
      </div>

      <div className={styles.grid}>
        {renderMembersForm()}
        {renderAiPlan()}
      </div>

      <div className={styles.actionsRow}>
        <Button type="button" onClick={createLadder} disabled={isSaving}>
          {isSaving ? "Saving ladder..." : form.publish ? "Publish ladder" : "Save ladder draft"}
        </Button>
      </div>
    </div>
  );
}


