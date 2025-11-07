"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { CapsuleGate } from "@/components/capsule/CapsuleGate";
import type { CapsuleSummary } from "@/server/capsules/service";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import styles from "../ladders/LadderBuilder.module.css";
import { StudioStepper, type StepItem } from "../competitive/StudioStepper";

type FormatOption = "single_elimination" | "double_elimination" | "round_robin";
type RegistrationType = "open" | "invite" | "waitlist" | "mixed";

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
};

type TournamentBuilderProps = {
  capsules: CapsuleSummary[];
  initialCapsuleId?: string | null;
};

function trimOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function createEmptyParticipant(index: number): ParticipantFormState {
  return {
    displayName: "",
    handle: "",
    seed: String(index + 1),
  };
}

function normalizeParticipants(list: ParticipantFormState[]): ParticipantFormState[] {
  return list.map((participant, index) => ({
    ...participant,
    seed: participant.seed.trim().length ? participant.seed : String(index + 1),
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

export function TournamentBuilder({ capsules, initialCapsuleId = null }: TournamentBuilderProps) {
  const router = useRouter();
  const stepItems: StepItem[] = [
    { id: "step-details", title: "Details", subtitle: "Name & visibility" },
    { id: "step-format", title: "Format", subtitle: "Bracket & schedule" },
    { id: "step-content", title: "Content", subtitle: "Overview, rules, comms" },
    { id: "step-participants", title: "Participants", subtitle: "Seeds & teams" },
    { id: "step-review", title: "Review", subtitle: "Generate & publish" },
  ];
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

  const [form, setForm] = React.useState<TournamentFormState>({
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
  const [participants, setParticipants] = React.useState<ParticipantFormState[]>([
    createEmptyParticipant(0),
    createEmptyParticipant(1),
  ]);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isSaving, setSaving] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);

  const resetMessages = React.useCallback(() => {
    setStatusMessage(null);
    setErrorMessage(null);
  }, []);

  const handleCapsuleChange = React.useCallback((capsule: CapsuleSummary | null) => {
    setSelectedCapsule(capsule);
    resetMessages();
  }, [resetMessages]);

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
      .map((participant, index) => ({
        displayName: participant.displayName.trim(),
        handle: participant.handle.trim().length ? participant.handle.trim() : null,
        seed: parseInteger(participant.seed, index + 1, { min: 1, max: 256 }),
        rating: 1200,
        wins: 0,
        losses: 0,
        draws: 0,
        streak: 0,
      }));
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
  }, [form.bestOf, form.format, form.maxEntrants, form.registrationType, form.start, form.timezone, form.aiNotes]);

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
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setGenerating(false);
    }
  }, [applyBlueprint, form.format, form.maxEntrants, form.summary, resetMessages, selectedCapsule]);

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

  return (
    <div className={styles.builderWrap}>
      <div className={styles.wizardPanel}>
        <div className={styles.panelGlow} aria-hidden />
        <div className={styles.pageGrid}>
          <aside className={styles.stepperCol}>
            <StudioStepper items={stepItems} />
          </aside>
          <div className={styles.formCol}>
            <header className={styles.stepHero}>
              <span className={styles.stepHeroLabel}>Tournament wizard</span>
              <h1 className={styles.stepHeroTitle}>Design your bracket plan</h1>
              <p className={styles.stepHeroSubtitle}>
                Mirror the capsule onboarding experience with neon gradients, soft shadows, and responsive steps.
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

          {errorMessage ? <div className={styles.errorMessage}>{errorMessage}</div> : null}
          {statusMessage ? <div className={styles.statusMessage}>{statusMessage}</div> : null}

          <section id="step-details" className={styles.grid}>
            <Card>
              <CardHeader>
                <CardTitle>Event details</CardTitle>
                <CardDescription>Name your tournament and set its visibility.</CardDescription>
              </CardHeader>
              <CardContent className={styles.cardContent}>
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
                <div className={styles.fieldGroup}>
                  <label className={styles.label}>Publish immediately?</label>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={form.publish}
                      onChange={(event) => handleFormChange("publish", event.target.checked)}
                    />
                    <span>Publish to Capsule Events after saving</span>
                  </label>
                </div>
              </CardContent>
            </Card>
          </section>

          <section id="step-format" className={styles.grid}>
            <Card>
              <CardHeader>
                <CardTitle>Format & schedule</CardTitle>
                <CardDescription>Set bracket style, best-of count, and kickoff time.</CardDescription>
              </CardHeader>
              <CardContent className={styles.cardContent}>
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
              </CardContent>
            </Card>
          </section>

          <section id="step-content" className={styles.grid}>
            <Card>
              <CardHeader>
                <CardTitle>Content sections</CardTitle>
                <CardDescription>Capsule AI will reuse these sections across announcements.</CardDescription>
              </CardHeader>
              <CardContent className={styles.cardContent}>
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
              </CardContent>
            </Card>
          </section>

          <section id="step-participants" className={styles.grid}>
            <Card>
              <CardHeader>
                <CardTitle>Participants</CardTitle>
                <CardDescription>Seed teams now or leave blank to handle later.</CardDescription>
              </CardHeader>
              <CardContent className={styles.cardContent}>
                <div className={styles.membersTableWrap}>
                  <table className={styles.membersTable}>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Handle</th>
                        <th>Seed</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {participants.map((participant, index) => (
                        <tr key={participant.id ?? `participant-${index}`}>
                          <td>
                            <Input
                              value={participant.displayName}
                              placeholder="Team name"
                              onChange={(event) =>
                                handleParticipantChange(index, "displayName", event.target.value)
                              }
                            />
                          </td>
                          <td>
                            <Input
                              value={participant.handle}
                              placeholder="@captain"
                              onChange={(event) =>
                                handleParticipantChange(index, "handle", event.target.value)
                              }
                            />
                          </td>
                          <td>
                            <Input
                              value={participant.seed}
                              onChange={(event) =>
                                handleParticipantChange(index, "seed", event.target.value)
                              }
                            />
                          </td>
                          <td>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeParticipant(index)}
                            >
                              Remove
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Button type="button" variant="secondary" onClick={addParticipant}>
                  Add participant
                </Button>
              </CardContent>
            </Card>
          </section>

          <div id="step-review" className={styles.actionsRow}>
            <Button type="button" variant="outline" onClick={handleGenerateDraft} disabled={generating}>
              {generating ? "Generating..." : "Generate with Capsule AI"}
            </Button>
            <Button type="button" onClick={createTournament} disabled={isSaving}>
              {isSaving
                ? "Saving tournament..."
                : form.publish
                  ? "Publish tournament"
                  : "Save tournament draft"}
            </Button>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
