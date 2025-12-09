import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getIdentityAccent } from "@/lib/identity/teams";
import type { LadderVisibility } from "@/types/ladders";

import styles from "../../ladders/LadderBuilder.module.css";
import { AssistantPrompter } from "../../ladders/components/AssistantPrompter";
import { ReviewOverviewCard } from "../../ladders/components/ReviewOverviewCard";
import { AiPlanCard, type AiPlanLike } from "../../ladders/components/AiPlanCard";
import type { AssistantMessage } from "../../ladders/assistantTypes";
import { NameField } from "./NameField";
import type {
  ParticipantFormState,
  ParticipantSuggestion,
  RegistrationType,
  TournamentFormState,
  TournamentStepId,
} from "../types";

type FormChangeHandler = <K extends keyof TournamentFormState>(key: K, value: TournamentFormState[K]) => void;

const REGISTRATION_TYPE_HELP: Record<RegistrationType, string> = {
  open: "Anyone who can see the event can join until you hit any optional entrant cap.",
  invite: "Hosts hand-pick players or teams. Great for creator cups or featured brackets.",
  waitlist: "Collect interest first, then promote players into the final bracket as spots open.",
  mixed: "Blend invites and open slots so you can spotlight featured players while keeping room for qualifiers.",
};

const REQUIREMENT_SUGGESTIONS = [
  "Captains confirm availability by Wednesday",
  "Subs allowed after week two",
  "Screenshots required for score disputes",
];

type BlueprintStepProps = {
  form: TournamentFormState;
  generating: boolean;
  onFormChange: FormChangeHandler;
  onGenerateDraft: () => void;
  stepControls?: React.ReactNode;
};

const BlueprintStep = React.memo(function BlueprintStep({
  form,
  generating,
  onFormChange,
  onGenerateDraft,
  stepControls,
}: BlueprintStepProps) {
  const conversation = React.useMemo<AssistantMessage[]>(
    () => [
      {
        id: "tournament-ai-welcome",
        sender: "ai",
        text: "Tell me the vibe, game, who it's for, and what's at stake. I can help with a title, one-line summary, rules, or rewards-whatever you need.",
        timestamp: Date.now(),
      },
    ],
    [],
  );

  const handleSend = React.useCallback(() => {
    if (!form.summary.trim().length || generating) return;
    onGenerateDraft();
  }, [form.summary, generating, onGenerateDraft]);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <Card className={styles.namingPanel} variant="ghost">
      <CardHeader className={styles.namingHeader}>
        <CardTitle className={styles.namingTitle}>Describe your tournament</CardTitle>
      </CardHeader>
      <CardContent className={styles.namingBody}>
        <div className={styles.namingPrimary} aria-hidden="true" />
        <div className={styles.namingOr}>
          <span>or chat with Capsule AI</span>
        </div>
        <AssistantPrompter
          placeholder="Example: Weekend 16-team Valorant bracket, double elimination, NA/EU, best-of-three, co-stream friendly finals..."
          conversation={conversation}
          draft={form.summary}
          busy={generating}
          onDraftChange={(value) => onFormChange("summary", value)}
          onKeyDown={handleKeyDown}
          onSend={handleSend}
        />
        {stepControls}
      </CardContent>
    </Card>
  );
});

type TitleStepProps = {
  form: TournamentFormState;
  onFormChange: FormChangeHandler;
};

const TitleStep = React.memo(function TitleStep({
  form,
  onFormChange,
  stepControls,
}: TitleStepProps & { stepControls?: React.ReactNode }) {
  const conversation = React.useMemo<AssistantMessage[]>(
    () => [
      {
        id: "tournament-title-ai-welcome",
        sender: "ai",
        text: "Tell me the tournament vibe and I can help punch up the title.",
        timestamp: Date.now(),
      },
    ],
    [],
  );

  return (
    <Card className={styles.namingPanel} variant="ghost">
      <CardHeader className={styles.namingHeader}>
        <CardTitle className={styles.namingTitle}>Title</CardTitle>
      </CardHeader>
      <CardContent className={styles.namingBody}>
        <div className={styles.fieldGroup}>
          <textarea
            id="tournament-title"
            className={styles.namingTextArea}
            value={form.name}
            onChange={(event) => onFormChange("name", event.target.value)}
            rows={2}
            placeholder="Type a title..."
          />
        </div>
        <div className={styles.namingOr}>
          <span>or chat with Capsule AI</span>
        </div>
        <AssistantPrompter
          placeholder="Ask for title ideas or anything you need help with..."
          conversation={conversation}
          draft={form.name}
          busy={false}
          onDraftChange={(value) => onFormChange("name", value)}
          onKeyDown={() => {}}
          onSend={() => {}}
        />
        {stepControls}
      </CardContent>
    </Card>
  );
});

type SummaryStepProps = {
  form: TournamentFormState;
  onFormChange: FormChangeHandler;
};

const SummaryStep = React.memo(function SummaryStep({
  form,
  onFormChange,
  stepControls,
}: SummaryStepProps & { stepControls?: React.ReactNode }) {
  const conversation = React.useMemo<AssistantMessage[]>(
    () => [
      {
        id: "tournament-summary-ai-welcome",
        sender: "ai",
        text: "Tell me who it's for and what's at stake. I'll help you tighten the one-line summary.",
        timestamp: Date.now(),
      },
    ],
    [],
  );

  return (
    <Card className={styles.namingPanel}>
      <CardHeader className={styles.namingHeader}>
        <CardTitle className={styles.namingTitle}>Summary</CardTitle>
      </CardHeader>
      <CardContent className={styles.namingBody}>
        <div className={styles.fieldGroup}>
          <textarea
            id="tournament-summary"
            className={styles.namingTextArea}
            value={form.summary}
            onChange={(event) => onFormChange("summary", event.target.value)}
            rows={3}
            placeholder="Double-elimination showdown with Capsule AI narrating every upset."
          />
        </div>
        <div className={styles.namingOr}>
          <span>or chat with Capsule AI</span>
        </div>
        <AssistantPrompter
          placeholder="Who is this tournament for? What's at stake?"
          conversation={conversation}
          draft={form.summary}
          busy={false}
          onDraftChange={(value) => onFormChange("summary", value)}
          onKeyDown={() => {}}
          onSend={() => {}}
        />
        {stepControls}
      </CardContent>
    </Card>
  );
});

type SignupsStepProps = {
  form: TournamentFormState;
  onFormChange: FormChangeHandler;
};

const SignupsStep = React.memo(function SignupsStep({ form, onFormChange }: SignupsStepProps) {
  const [requirementDraft, setRequirementDraft] = React.useState("");

  const requirementItems = React.useMemo(() => {
    return (form.registrationRequirements ?? "")
      .split("\n")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length);
  }, [form.registrationRequirements]);

  const syncRequirements = React.useCallback(
    (items: string[]) => {
      onFormChange("registrationRequirements", items.join("\n"));
    },
    [onFormChange],
  );

  const handleRequirementAdd = React.useCallback(() => {
    const trimmed = requirementDraft.trim();
    if (!trimmed.length) return;
    if (requirementItems.includes(trimmed)) {
      setRequirementDraft("");
      return;
    }
    syncRequirements([...requirementItems, trimmed]);
    setRequirementDraft("");
  }, [requirementDraft, requirementItems, syncRequirements]);

  const handleRequirementRemove = React.useCallback(
    (index: number) => {
      syncRequirements(requirementItems.filter((_, itemIndex) => itemIndex !== index));
    },
    [requirementItems, syncRequirements],
  );

  const handleRequirementSuggestion = React.useCallback(
    (suggestion: string) => {
      if (requirementItems.includes(suggestion)) return;
      syncRequirements([...requirementItems, suggestion]);
      setRequirementDraft("");
    },
    [requirementItems, syncRequirements],
  );

  const handleRequirementKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleRequirementAdd();
      }
    },
    [handleRequirementAdd],
  );

  const handleRequirementPaste = React.useCallback(
    (event: React.ClipboardEvent<HTMLInputElement>) => {
      const pasted = event.clipboardData.getData("text");
      if (!pasted.includes("\n")) return;
      const entries = pasted
        .split("\n")
        .map((entry) => entry.trim())
        .filter(Boolean);
      if (!entries.length) return;
      event.preventDefault();
      syncRequirements([...requirementItems, ...entries]);
      setRequirementDraft("");
    },
    [requirementItems, syncRequirements],
  );

  return (
    <Card className={styles.namingPanel} variant="ghost">
      <CardHeader className={styles.namingHeader}>
        <CardTitle className={styles.namingTitle}>Sign-Ups</CardTitle>
      </CardHeader>
      <CardContent className={`${styles.namingBody} ${styles.registrationContent}`}>
        <div className={styles.registrationGrid}>
          <section className={`${styles.registrationBlock} ${styles.registrationFieldBlock}`}>
            <div className={styles.registrationBlockHeader}>
              <h3 className={styles.registrationTitle}>Registration mode</h3>
              <p className={styles.registrationLead}>
                Pick whether players join instantly or need host approval first.
              </p>
            </div>
            <div className={styles.registrationFieldRow}>
              <label className={styles.label} htmlFor="tournament-registration-type">
                Mode
              </label>
              <select
                id="tournament-registration-type"
                className={styles.select}
                value={form.registrationType}
                onChange={(event) =>
                  onFormChange("registrationType", event.target.value as TournamentFormState["registrationType"])
                }
              >
                <option value="open">Open sign-ups</option>
                <option value="invite">Invite-only / host approval</option>
                <option value="waitlist">Waitlist queue</option>
                <option value="mixed">Mixed (invites + qualifiers)</option>
              </select>
            </div>
            <div className={styles.registrationHelper}>
              {REGISTRATION_TYPE_HELP[form.registrationType] ?? REGISTRATION_TYPE_HELP.open}
            </div>
          </section>
          <section className={`${styles.registrationBlock} ${styles.registrationFieldBlock}`}>
            <div className={styles.registrationBlockHeader}>
              <h3 className={styles.registrationTitle}>Max teams / players</h3>
              <p className={styles.registrationLead}>
                Set a soft cap so you can pace sign-ups, or leave it blank to stay open.
              </p>
            </div>
            <div className={styles.registrationFieldRow}>
              <label className={styles.label} htmlFor="tournament-max-entrants">
                Soft cap (optional)
              </label>
              <Input
                id="tournament-max-entrants"
                type="number"
                value={form.maxEntrants}
                onChange={(event) => onFormChange("maxEntrants", event.target.value)}
                placeholder="32"
              />
            </div>
            <div className={styles.registrationHelper}>
              Leave blank for no explicit cap. You can still remove or add players manually at any time.
            </div>
          </section>
        </div>
        <section className={`${styles.registrationBlock} ${styles.requirementsBlock}`}>
          <p className={styles.registrationEyebrow}>Launch checklist</p>
          <div className={styles.requirementsHeader}>
            <h3 className={styles.registrationTitle}>Requirements</h3>
            <span className={styles.blockBadge}>Optional</span>
          </div>
          <p className={styles.registrationLead}>
            Turn expectations into a short list players can scan before joining.
          </p>
          <div className={styles.requirementsComposer}>
            <Input
              id="tournament-registration-reqs"
              value={requirementDraft}
              onChange={(event) => setRequirementDraft(event.target.value)}
              onKeyDown={handleRequirementKeyDown}
              onPaste={handleRequirementPaste}
              onBlur={handleRequirementAdd}
              placeholder="Add a quick rule, e.g. proof screenshots or check-in time"
              aria-label="Add a requirement"
              className={styles.requirementInput}
            />
            <Button variant="secondary" size="sm" onClick={handleRequirementAdd}>
              Add requirement
            </Button>
          </div>
          <div className={styles.requirementChips}>
            {REQUIREMENT_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className={styles.requirementChip}
                onClick={() => handleRequirementSuggestion(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
          <div className={styles.requirementsListShell}>
            {requirementItems.length ? (
              <ul className={styles.requirementsList}>
                {requirementItems.map((item, index) => (
                  <li key={`${item}-${index}`} className={styles.requirementItem}>
                    <span className={styles.requirementBullet} aria-hidden="true" />
                    <div className={styles.requirementText}>{item}</div>
                    <button
                      type="button"
                      className={styles.requirementAction}
                      onClick={() => handleRequirementRemove(index)}
                      aria-label={`Remove requirement: ${item}`}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.requirementsEmpty}>
                Add a few quick hits like check-in windows, roster limits, or proof requirements.
              </div>
            )}
          </div>
        </section>
      </CardContent>
    </Card>
  );
});

type OverviewStepProps = {
  form: TournamentFormState;
  onFormChange: FormChangeHandler;
};

const OverviewStep = React.memo(function OverviewStep({
  form,
  onFormChange,
  stepControls,
}: OverviewStepProps & { stepControls?: React.ReactNode }) {
  const conversation = React.useMemo<AssistantMessage[]>(
    () => [
      {
        id: "tournament-overview-ai-welcome",
        sender: "ai",
        text: "Tell me who this bracket is for and what the stakes are. I can help draft an overview or tighten the hook.",
        timestamp: Date.now(),
      },
    ],
    [],
  );

  return (
    <Card className={styles.namingPanel}>
      <CardHeader className={styles.namingHeader}>
        <CardTitle className={styles.namingTitle}>Overview</CardTitle>
      </CardHeader>
      <CardContent className={styles.namingBody}>
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="tournament-overview">
            Overview copy
          </label>
          <textarea
            id="tournament-overview"
            className={styles.namingTextArea}
            value={form.overview}
            onChange={(event) => onFormChange("overview", event.target.value)}
            rows={3}
            placeholder="Set the stakes, cadence, rewards, and why challengers should care."
          />
        </div>
        <div className={styles.namingOr}>
          <span>or chat with Capsule AI</span>
        </div>
        <AssistantPrompter
          placeholder="Ask Capsule AI to draft the overview or tighten the hook..."
          conversation={conversation}
          draft={form.overview}
          busy={false}
          onDraftChange={(value) => onFormChange("overview", value)}
          onKeyDown={() => {}}
          onSend={() => {}}
        />
        {stepControls}
      </CardContent>
    </Card>
  );
});

type RulesStepProps = {
  form: TournamentFormState;
  onFormChange: FormChangeHandler;
};

const RulesStep = React.memo(function RulesStep({
  form,
  onFormChange,
  stepControls,
}: RulesStepProps & { stepControls?: React.ReactNode }) {
  const conversation = React.useMemo<AssistantMessage[]>(
    () => [
      {
        id: "tournament-rules-ai-welcome",
        sender: "ai",
        text: "Describe formats, disputes, and check-ins. I can help draft a clear ruleset.",
        timestamp: Date.now(),
      },
    ],
    [],
  );

  return (
    <Card className={styles.namingPanel}>
      <CardHeader className={styles.namingHeader}>
        <CardTitle className={styles.namingTitle}>Rules</CardTitle>
      </CardHeader>
      <CardContent className={styles.namingBody}>
        <div className={styles.fieldGroup}>
          <textarea
            id="tournament-rules"
            className={styles.namingTextArea}
            value={form.rules}
            onChange={(event) => onFormChange("rules", event.target.value)}
            rows={3}
            placeholder="Matches are best-of-three. Report scores within 2 hours with screenshots."
          />
        </div>
        <div className={styles.namingOr}>
          <span>or chat with Capsule AI</span>
        </div>
        <AssistantPrompter
          placeholder="Ask for a full ruleset, anti-cheat notes, or dispute policy..."
          conversation={conversation}
          draft={form.rules}
          busy={false}
          onDraftChange={(value) => onFormChange("rules", value)}
          onKeyDown={() => {}}
          onSend={() => {}}
        />
        {stepControls}
      </CardContent>
    </Card>
  );
});

type ShoutoutsStepProps = {
  form: TournamentFormState;
  onFormChange: FormChangeHandler;
};

const ShoutoutsStep = React.memo(function ShoutoutsStep({
  form,
  onFormChange,
  stepControls,
}: ShoutoutsStepProps & { stepControls?: React.ReactNode }) {
  const conversation = React.useMemo<AssistantMessage[]>(
    () => [
      {
        id: "tournament-shoutouts-ai-welcome",
        sender: "ai",
        text: "Call out rivalries, MVPs, clutch moments, or sponsor beats. I can help shape spotlight storylines.",
        timestamp: Date.now(),
      },
    ],
    [],
  );

  return (
    <Card className={styles.namingPanel}>
      <CardHeader className={styles.namingHeader}>
        <CardTitle className={styles.namingTitle}>Shoutouts</CardTitle>
      </CardHeader>
      <CardContent className={styles.namingBody}>
        <div className={styles.fieldGroup}>
          <textarea
            id="tournament-shoutouts"
            className={styles.namingTextArea}
            value={form.broadcast}
            onChange={(event) => onFormChange("broadcast", event.target.value)}
            rows={3}
            placeholder="Call out rivalries, MVP awards, clutch moments, or rookie spotlights."
          />
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="tournament-updates">
            Schedule &amp; updates
          </label>
          <textarea
            id="tournament-updates"
            className={styles.namingTextArea}
            value={form.updates}
            onChange={(event) => onFormChange("updates", event.target.value)}
            rows={3}
            placeholder="Round timing, check-ins, deadlines..."
          />
        </div>
        <div className={styles.namingOr}>
          <span>or chat with Capsule AI</span>
        </div>
        <AssistantPrompter
          placeholder="Ask for spotlight themes, weekly awards, or story hooks..."
          conversation={conversation}
          draft={form.broadcast}
          busy={false}
          onDraftChange={(value) => onFormChange("broadcast", value)}
          onKeyDown={() => {}}
          onSend={() => {}}
        />
        {stepControls}
      </CardContent>
    </Card>
  );
});

type BasicsStepProps = {
  form: TournamentFormState;
  onFormChange: FormChangeHandler;
};

const BasicsStep = React.memo(function BasicsStep({
  form,
  onFormChange,
  stepControls,
}: BasicsStepProps & { stepControls?: React.ReactNode }) {
  return (
    <Card className={styles.namingPanel} variant="ghost">
      <CardHeader className={styles.namingHeader}>
        <CardTitle className={styles.namingTitle}>Basics</CardTitle>
        <CardDescription className={styles.formCardDescription}>
          Capsule AI uses this to suggest rules, playlists, stats, and the timeline, but you can keep it lightweight to
          start.
        </CardDescription>
      </CardHeader>
      <CardContent className={styles.namingBody}>
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="tournament-game-title">
            Game or title (optional)
          </label>
          <Input
            id="tournament-game-title"
            value={form.gameTitle}
            onChange={(event) => onFormChange("gameTitle", event.target.value)}
            placeholder="Rocket League"
          />
          <p className={styles.fieldHint}>
            Name the main game or series you&apos;re featuring, or leave this blank and Capsule will fall back to a
            generic title.
          </p>
        </div>
        <div className={styles.fieldRow}>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="tournament-platform">
              Platform (optional)
            </label>
            <Input
              id="tournament-platform"
              value={form.gamePlatform}
              onChange={(event) => onFormChange("gamePlatform", event.target.value)}
              placeholder="Cross-play"
            />
            <p className={styles.fieldHint}>
              Call out console, PC, or cross-play so challengers know where they&apos;ll be playing.
            </p>
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="tournament-region">
              Region (optional)
            </label>
            <Input
              id="tournament-region"
              value={form.gameRegion}
              onChange={(event) => onFormChange("gameRegion", event.target.value)}
              placeholder="NA / EU"
            />
            <p className={styles.fieldHint}>
              Note primary regions or servers (e.g. NA, EU, Asia) to help set expectations around ping and timing.
            </p>
          </div>
        </div>
        <div className={styles.namingDivider} />
        <p className={styles.fieldHint}>Timeline & cadence</p>
        <div className={styles.fieldRow}>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="tournament-season-length">
              Season length or arc
            </label>
            <Input
              id="tournament-season-length"
              value={form.seasonLength}
              onChange={(event) => onFormChange("seasonLength", event.target.value)}
              placeholder="8 weeks of weekly duels"
            />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="tournament-match-cadence">
              Match cadence
            </label>
            <Input
              id="tournament-match-cadence"
              value={form.matchCadence}
              onChange={(event) => onFormChange("matchCadence", event.target.value)}
              placeholder="Thursdays 7 PM local"
            />
          </div>
        </div>
        <div className={styles.fieldRow}>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="tournament-kickoff-notes">
              Kickoff notes
            </label>
            <Input
              id="tournament-kickoff-notes"
              value={form.kickoffNotes}
              onChange={(event) => onFormChange("kickoffNotes", event.target.value)}
              placeholder="Season kickoff stream + Capsule shoutouts"
            />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="tournament-basics-timezone">
              Timezone
            </label>
            <Input
              id="tournament-basics-timezone"
              value={form.timezone}
              onChange={(event) => onFormChange("timezone", event.target.value)}
              placeholder="NA / CET"
            />
          </div>
        </div>
        {stepControls}
      </CardContent>
    </Card>
  );
});

type FormatStepProps = {
  form: TournamentFormState;
  onFormChange: FormChangeHandler;
};

const FormatStep = React.memo(function FormatStep({ form, onFormChange }: FormatStepProps) {
  const bracketModes = [
    {
      id: "single_elimination" as TournamentFormState["format"],
      label: "Single elimination",
      headline: "Lose once and you're out.",
      blurb: "Fast, high-stakes brackets. Great for weekend events and clear winners.",
    },
    {
      id: "double_elimination" as TournamentFormState["format"],
      label: "Double elimination",
      headline: "Second chances, bigger storylines.",
      blurb: "Upper + lower brackets so upsets can fight back through the lower side.",
    },
    {
      id: "round_robin" as TournamentFormState["format"],
      label: "Round robin",
      headline: "Everyone plays everyone.",
      blurb: "Best for leagues, groups, and fair seeding before playoffs.",
    },
  ];

  return (
    <div className={styles.sectionCard}>
      <div className={styles.fieldGroup}>
        <label className={styles.label}>Bracket style</label>
        <p className={styles.fieldHint}>Pick how entrants progress through the tournament.</p>
        <div className={styles.scoringModes}>
          {bracketModes.map((mode) => {
            const isActive = form.format === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                className={[styles.scoringModeTile, isActive ? styles.scoringModeTileActive : ""].filter(Boolean).join(" ")}
                aria-pressed={isActive}
                onClick={() => onFormChange("format", mode.id)}
              >
                <div className={styles.scoringModeHeader}>
                  <span className={styles.scoringModeTitle}>{mode.label}</span>
                  <span className={styles.scoringModeSubtitle}>{mode.headline}</span>
                </div>
                <p className={styles.scoringModeBlurb}>{mode.blurb}</p>
                {isActive ? <span className={styles.selectedPill}>Selected</span> : null}
              </button>
            );
          })}
        </div>
      </div>
      <div className={styles.fieldGroup}>
        <span className={styles.label}>Match defaults</span>
        <div className={styles.fieldRow}>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="best-of">
              Best-of
            </label>
            <Input
              id="best-of"
              value={form.bestOf}
              onChange={(event) => onFormChange("bestOf", event.target.value)}
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
              onChange={(event) => onFormChange("maxEntrants", event.target.value)}
              placeholder="16"
            />
          </div>
        </div>
        <div className={styles.fieldRow}>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="start-time">
              Start time
            </label>
            <Input
              id="start-time"
              value={form.start}
              onChange={(event) => onFormChange("start", event.target.value)}
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
              onChange={(event) => onFormChange("timezone", event.target.value)}
              placeholder="Pacific Time"
            />
          </div>
        </div>
      </div>
      <div className={styles.fieldGroup}>
        <span className={styles.label}>Match format</span>
        <div className={styles.matchFormatRow}>
          {[
            {
              id: "1v1" as NonNullable<TournamentFormState["matchMode"]>,
              label: "1v1 (player vs player)",
              hint: "Best for solo ladders and duels.",
            },
            {
              id: "teams" as NonNullable<TournamentFormState["matchMode"]>,
              label: "Teams (users vs users)",
              hint: "Teams of users compete (set roster size later).",
            },
            {
              id: "capsule_vs_capsule" as NonNullable<TournamentFormState["matchMode"]>,
              label: "Capsule vs Capsule",
              hint: "Capsule vs Capsule matches at the community level.",
            },
          ].map((mode) => {
            const active = (form.matchMode ?? "1v1") === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                className={`${styles.formatOption} ${active ? styles.formatOptionActive : ""}`.trim()}
                aria-pressed={active}
                onClick={() => onFormChange("matchMode", mode.id)}
              >
                <span className={styles.formatOptionLabel}>{mode.label}</span>
                <span className={styles.formatOptionHint}>{mode.hint}</span>
              </button>
            );
          })}
        </div>
        <p className={styles.fieldHint}>Choose one of the three formats to continue.</p>
      </div>
    </div>
  );
});

type RewardsStepProps = {
  form: TournamentFormState;
  onFormChange: FormChangeHandler;
};

const RewardsStep = React.memo(function RewardsStep({
  form,
  onFormChange,
  stepControls,
}: RewardsStepProps & { stepControls?: React.ReactNode }) {
  const conversation = React.useMemo<AssistantMessage[]>(
    () => [
      {
        id: "tournament-rewards-ai-welcome",
        sender: "ai",
        text: "Describe prizes, titles, and perks. I can help polish reward tiers or sponsor-friendly incentives.",
        timestamp: Date.now(),
      },
    ],
    [],
  );

  return (
    <Card className={styles.namingPanel}>
      <CardHeader className={styles.namingHeader}>
        <CardTitle className={styles.namingTitle}>Rewards</CardTitle>
      </CardHeader>
      <CardContent className={styles.namingBody}>
        <div className={styles.fieldGroup}>
          <textarea
            id="tournament-rewards"
            className={styles.namingTextArea}
            value={form.rewards}
            onChange={(event) => onFormChange("rewards", event.target.value)}
            rows={3}
            placeholder="Top 3 earn featured posts, MVP gets a custom Capsule portrait."
          />
        </div>
        <div className={styles.namingOr}>
          <span>or chat with Capsule AI</span>
        </div>
        <AssistantPrompter
          placeholder="Ask for prize ideas, seasonal incentives, or sponsor-friendly rewards..."
          conversation={conversation}
          draft={form.rewards}
          busy={false}
          onDraftChange={(value) => onFormChange("rewards", value)}
          onKeyDown={() => {}}
          onSend={() => {}}
        />
        {stepControls}
      </CardContent>
    </Card>
  );
});

type ParticipantsStepProps = {
  participants: ParticipantFormState[];
  matchMode: TournamentFormState["matchMode"];
  onParticipantChange: (index: number, field: keyof ParticipantFormState, value: string) => void;
  onParticipantSuggestion: (index: number, suggestion: ParticipantSuggestion) => void;
  onAddParticipant: () => void;
  onRemoveParticipant: (index: number) => void;
  onInviteClick: () => void;
};

const ParticipantsStep = React.memo(function ParticipantsStep({
  participants,
  matchMode,
  onParticipantChange,
  onParticipantSuggestion,
  onAddParticipant,
  onRemoveParticipant,
  onInviteClick,
}: ParticipantsStepProps) {
  const [expandedIndex, setExpandedIndex] = React.useState<number | null>(null);
  const isTeamsMode = (matchMode ?? "1v1") === "teams";

  return (
    <Card className={styles.formCard} variant="ghost">
      <CardHeader className={styles.formCardHeader}>
        <CardTitle className={styles.formCardTitle}>Roster seeds &amp; stats</CardTitle>
      </CardHeader>
      <CardContent className={styles.formCardContent}>
        <p className={styles.fieldHint}>
          {isTeamsMode
            ? "Each row represents a team. Set names, optional tags, and starting stats for your entrants."
            : (
              <>
                <abbr
                  className={styles.helperAbbr}
                  title="ELO updates player skill after every match. Keep new brackets near 1200 and adjust with K-factor for larger swings."
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
              </>
              )}
        </p>
        <div className={styles.membersTableWrap}>
          <table className={styles.membersTable}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Seed</th>
                <th>Rating</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {participants.map((participant, index) => {
                const accent = getIdentityAccent(participant.displayName || `Seed ${index + 1}`, index);
                const accentStyle = {
                  "--identity-color": accent.primary,
                  "--identity-glow": accent.glow,
                  "--identity-border": accent.border,
                  "--identity-surface": accent.surface,
                  "--identity-text": accent.text,
                } as React.CSSProperties;
                return (
                  <React.Fragment key={participant.id ?? `participant-${index}`}>
                    <tr>
                      <td>
                        <NameField
                          index={index}
                          participant={participant}
                          onChangeName={(value) => onParticipantChange(index, "displayName", value)}
                          onSelectSuggestion={(suggestion) => onParticipantSuggestion(index, suggestion)}
                        />
                      </td>
                      <td>
                        <Input
                          id={`participant-seed-${index}`}
                          value={participant.seed}
                          className={styles.memberNumberInput}
                          onChange={(event) => onParticipantChange(index, "seed", event.target.value)}
                          placeholder={String(index + 1)}
                        />
                      </td>
                      <td>
                        <Input
                          id={`participant-rating-${index}`}
                          value={participant.rating}
                          className={styles.memberNumberInput}
                          onChange={(event) => onParticipantChange(index, "rating", event.target.value)}
                          placeholder="1200"
                        />
                      </td>
                      <td className={styles.memberActions}>
                        <span className={styles.memberChip} style={accentStyle}>
                          Seed {participant.seed || index + 1}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedIndex(expandedIndex === index ? null : index)}
                        >
                          {expandedIndex === index ? "Hide stats" : "Edit stats"}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => onRemoveParticipant(index)}>
                          Remove
                        </Button>
                      </td>
                    </tr>
                    {expandedIndex === index ? (
                      <tr className={styles.memberAdvancedRow}>
                        <td colSpan={4}>
                          <div className={styles.memberAdvanced}>
                            <div className={styles.memberAdvancedFields}>
                            <div className={styles.memberAdvancedField}>
                              <label className={styles.label} htmlFor={`participant-handle-${index}`}>
                                {isTeamsMode ? "Team tag" : "Handle or team tag"}
                              </label>
                              <Input
                                id={`participant-handle-${index}`}
                                value={participant.handle}
                                className={styles.memberNumberInput}
                                onChange={(event) => onParticipantChange(index, "handle", event.target.value)}
                                placeholder={isTeamsMode ? "Team tag (optional)" : "@handle"}
                              />
                              </div>
                              <div className={styles.memberAdvancedField}>
                                <label className={styles.label} htmlFor={`participant-wins-${index}`}>
                                  Wins
                                </label>
                                <Input
                                  id={`participant-wins-${index}`}
                                  value={participant.wins}
                                  className={styles.memberNumberInput}
                                  onChange={(event) => onParticipantChange(index, "wins", event.target.value)}
                                />
                              </div>
                              <div className={styles.memberAdvancedField}>
                                <label className={styles.label} htmlFor={`participant-losses-${index}`}>
                                  Losses
                                </label>
                                <Input
                                  id={`participant-losses-${index}`}
                                  value={participant.losses}
                                  className={styles.memberNumberInput}
                                  onChange={(event) => onParticipantChange(index, "losses", event.target.value)}
                                />
                              </div>
                              <div className={styles.memberAdvancedField}>
                                <label className={styles.label} htmlFor={`participant-draws-${index}`}>
                                  Draws
                                </label>
                                <Input
                                  id={`participant-draws-${index}`}
                                  value={participant.draws}
                                  className={styles.memberNumberInput}
                                  onChange={(event) => onParticipantChange(index, "draws", event.target.value)}
                                />
                              </div>
                              <div className={styles.memberAdvancedField}>
                                <label className={styles.label} htmlFor={`participant-streak-${index}`}>
                                  Streak
                                </label>
                                <Input
                                  id={`participant-streak-${index}`}
                                  value={participant.streak}
                                  className={styles.memberNumberInput}
                                  onChange={(event) => onParticipantChange(index, "streak", event.target.value)}
                                />
                              </div>
                            </div>
                            <p className={styles.memberAdvancedHint}>
                              Optional: set starting records and tags for returning seasons or migrated tournaments. Leave
                              blank for new brackets.
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className={styles.memberActionsRow}>
          <Button
            type="button"
            variant="secondary"
            className={styles.memberActionButton}
            onClick={onAddParticipant}
          >
            Add participant
          </Button>
          <Button
            type="button"
            variant="secondary"
            className={styles.memberInviteButton}
            onClick={onInviteClick}
          >
            Invite
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});

type ReviewStepProps = {
  form: TournamentFormState;
  participants: ParticipantFormState[];
  capsuleName: string | null;
  sectionsReady: number;
  aiPlan: AiPlanLike;
  onFormChange: FormChangeHandler;
  stepControls?: React.ReactNode;
};

const ReviewStep = React.memo(function ReviewStep({
  form,
  participants,
  capsuleName,
  sectionsReady,
  aiPlan,
  onFormChange,
  stepControls,
}: ReviewStepProps) {
  const membersCount = React.useMemo(
    () => participants.filter((participant) => participant.displayName.trim().length).length,
    [participants],
  );
  return (
    <Card className={styles.namingPanel} variant="ghost">
      <CardHeader className={styles.namingHeader}>
        <CardTitle className={styles.namingTitle}>Review &amp; publish</CardTitle>
      </CardHeader>
      <CardContent className={styles.namingBody}>
        <div className={styles.guidedReviewStack}>
          <ReviewOverviewCard
            capsuleName={capsuleName}
            visibility={form.visibility as LadderVisibility}
            publish={form.publish}
            membersCount={membersCount}
            sectionsReady={sectionsReady}
          />
          <Card className={styles.formCard} variant="ghost">
            <CardHeader className={styles.formCardHeader}>
              <CardTitle className={styles.formCardTitle}>Visibility &amp; publish</CardTitle>
              <CardDescription className={styles.formCardDescription}>
                Flip to public whenever you&apos;re ready.
              </CardDescription>
            </CardHeader>
            <CardContent className={styles.formCardContent}>
              <div className={styles.fieldGroup}>
                <label className={styles.label} htmlFor="tournament-visibility">
                  Visibility
                </label>
                <select
                  id="tournament-visibility"
                  className={styles.select}
                  value={form.visibility}
                  onChange={(event) =>
                    onFormChange("visibility", event.target.value as TournamentFormState["visibility"])
                  }
                >
                  <option value="capsule">Capsule members</option>
                  <option value="private">Managers only</option>
                  <option value="public">Public showcase</option>
                </select>
              </div>
              <div className={styles.checkboxRow}>
                <input
                  id="tournament-publish"
                  type="checkbox"
                  checked={form.publish}
                  onChange={(event) => onFormChange("publish", event.target.checked)}
                />
                <label htmlFor="tournament-publish">Publish immediately after saving</label>
              </div>
              <p className={styles.fieldHint}>
                Leave unchecked to save a draft. Capsule will keep everything private.
              </p>
            </CardContent>
          </Card>
          <AiPlanCard plan={aiPlan} />
        </div>
        {stepControls}
      </CardContent>
    </Card>
  );
});

type TournamentStepContentProps = {
  activeStep: TournamentStepId;
  form: TournamentFormState;
  participants: ParticipantFormState[];
  generating: boolean;
  capsuleName: string | null;
  sectionsReady: number;
  aiPlan: AiPlanLike;
  onFormChange: FormChangeHandler;
  onGenerateDraft: () => void;
  onParticipantChange: (index: number, field: keyof ParticipantFormState, value: string) => void;
  onParticipantSuggestion: (index: number, suggestion: ParticipantSuggestion) => void;
  onAddParticipant: () => void;
  onRemoveParticipant: (index: number) => void;
  onInviteClick: () => void;
};

export const TournamentStepContent = React.memo(function TournamentStepContent({
  activeStep,
  form,
  participants,
  generating,
  capsuleName,
  sectionsReady,
  aiPlan,
  onFormChange,
  onGenerateDraft,
  onParticipantChange,
  onParticipantSuggestion,
  onAddParticipant,
  onRemoveParticipant,
  onInviteClick,
  stepControls,
}: TournamentStepContentProps & { stepControls?: React.ReactNode }) {
  if (activeStep === "blueprint") {
    return (
      <BlueprintStep
        form={form}
        generating={generating}
        onFormChange={onFormChange}
        onGenerateDraft={onGenerateDraft}
        stepControls={stepControls}
      />
    );
  }
  if (activeStep === "title") return <TitleStep form={form} onFormChange={onFormChange} stepControls={stepControls} />;
  if (activeStep === "summary") return <SummaryStep form={form} onFormChange={onFormChange} stepControls={stepControls} />;
  if (activeStep === "signups") return <SignupsStep form={form} onFormChange={onFormChange} />;
  if (activeStep === "basics") return <BasicsStep form={form} onFormChange={onFormChange} stepControls={stepControls} />;
  if (activeStep === "overview") return <OverviewStep form={form} onFormChange={onFormChange} stepControls={stepControls} />;
  if (activeStep === "rules") return <RulesStep form={form} onFormChange={onFormChange} stepControls={stepControls} />;
  if (activeStep === "shoutouts") return <ShoutoutsStep form={form} onFormChange={onFormChange} stepControls={stepControls} />;
  if (activeStep === "format") return <FormatStep form={form} onFormChange={onFormChange} />;
  if (activeStep === "rewards") return <RewardsStep form={form} onFormChange={onFormChange} stepControls={stepControls} />;
  if (activeStep === "participants") {
    return (
      <ParticipantsStep
        participants={participants}
        matchMode={form.matchMode}
        onParticipantChange={onParticipantChange}
        onParticipantSuggestion={onParticipantSuggestion}
        onAddParticipant={onAddParticipant}
        onRemoveParticipant={onRemoveParticipant}
        onInviteClick={onInviteClick}
      />
    );
  }
  return (
    <ReviewStep
      form={form}
      participants={participants}
      capsuleName={capsuleName}
      sectionsReady={sectionsReady}
      aiPlan={aiPlan}
      onFormChange={onFormChange}
      stepControls={stepControls}
    />
  );
});
