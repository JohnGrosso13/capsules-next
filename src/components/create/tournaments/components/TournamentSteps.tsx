import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import styles from "../../ladders/LadderBuilder.module.css";
import { AssistantPrompter } from "../../ladders/components/AssistantPrompter";
import type { AssistantMessage } from "../../ladders/assistantTypes";
import { NameField } from "./NameField";
import type {
  ParticipantEntityType,
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
};

const BlueprintStep = React.memo(function BlueprintStep({
  form,
  generating,
  onFormChange,
  onGenerateDraft,
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
      </CardContent>
    </Card>
  );
});

type DetailsStepProps = {
  form: TournamentFormState;
  onFormChange: FormChangeHandler;
};

const DetailsStep = React.memo(function DetailsStep({ form, onFormChange }: DetailsStepProps) {
  return (
    <div className={styles.sectionCard}>
      <div className={styles.fieldGroup}>
        <label className={styles.label}>Visibility</label>
        <div className={styles.radioRow}>
          {(["private", "capsule", "public"] as const).map((option) => (
            <label key={option} className={styles.radioLabel}>
              <input
                type="radio"
                name="tournament-visibility"
                checked={form.visibility === option}
                onChange={() => onFormChange("visibility", option)}
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
            onChange={(event) => onFormChange("publish", event.target.checked)}
          />
          <span>Publish to Capsule Events after saving</span>
        </label>
      </div>
    </div>
  );
});

type TitleStepProps = {
  form: TournamentFormState;
  onFormChange: FormChangeHandler;
};

const TitleStep = React.memo(function TitleStep({ form, onFormChange }: TitleStepProps) {
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
      </CardContent>
    </Card>
  );
});

type SummaryStepProps = {
  form: TournamentFormState;
  onFormChange: FormChangeHandler;
};

const SummaryStep = React.memo(function SummaryStep({ form, onFormChange }: SummaryStepProps) {
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
    </div>
  );
});

type ContentStepProps = {
  form: TournamentFormState;
  onFormChange: FormChangeHandler;
};

const ContentStep = React.memo(function ContentStep({ form, onFormChange }: ContentStepProps) {
  return (
    <div className={styles.sectionCard}>
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="overview">
          Overview
        </label>
        <textarea
          id="overview"
          className={styles.textarea}
          rows={4}
          value={form.overview}
          placeholder="What makes this tournament exciting?"
          onChange={(event) => onFormChange("overview", event.target.value)}
        />
      </div>
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="rules">
          Rules &amp; format
        </label>
        <textarea
          id="rules"
          className={styles.textarea}
          rows={4}
          value={form.rules}
          placeholder="Formats, disputes, check-ins..."
          onChange={(event) => onFormChange("rules", event.target.value)}
        />
      </div>
      <div className={styles.fieldGroupRow}>
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="broadcast">
            Broadcast &amp; spotlight
          </label>
          <textarea
            id="broadcast"
            className={styles.textarea}
            rows={3}
            value={form.broadcast}
            placeholder="Caster notes, highlight ideas..."
            onChange={(event) => onFormChange("broadcast", event.target.value)}
          />
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="updates">
            Schedule &amp; updates
          </label>
          <textarea
            id="updates"
            className={styles.textarea}
            rows={3}
            value={form.updates}
            placeholder="Round timing, check-ins, deadlines..."
            onChange={(event) => onFormChange("updates", event.target.value)}
          />
        </div>
      </div>
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="ai-notes">
          Production notes
        </label>
        <textarea
          id="ai-notes"
          className={styles.textarea}
          rows={3}
          value={form.aiNotes}
          placeholder="Shoutouts, sponsors, themes..."
          onChange={(event) => onFormChange("aiNotes", event.target.value)}
        />
      </div>
    </div>
  );
});

type ParticipantsStepProps = {
  participants: ParticipantFormState[];
  onParticipantChange: (index: number, field: keyof ParticipantFormState, value: string) => void;
  onParticipantEntityType: (index: number, entityType: ParticipantEntityType) => void;
  onParticipantEntityId: (index: number, value: string) => void;
  onParticipantSuggestion: (index: number, suggestion: ParticipantSuggestion) => void;
  onAddParticipant: () => void;
  onRemoveParticipant: (index: number) => void;
  onInviteClick: () => void;
};

const ParticipantsStep = React.memo(function ParticipantsStep({
  participants,
  onParticipantChange,
  onParticipantEntityType,
  onParticipantEntityId,
  onParticipantSuggestion,
  onAddParticipant,
  onRemoveParticipant,
  onInviteClick,
}: ParticipantsStepProps) {
  return (
    <div className={styles.sectionCard}>
      <div className={styles.fieldGroup}>
        <p className={styles.fieldHint}>Add seeds manually or pull from Capsule users/capsules.</p>
      </div>
      <div className={styles.memberGrid}>
        {participants.map((participant, index) => (
          <div key={participant.id ?? index} className={styles.memberCard}>
            <div className={styles.fieldGroupRow}>
              <div className={styles.fieldGroupWide}>
                <label className={styles.label} htmlFor={`participant-name-${index}`}>
                  Participant name
                </label>
                <NameField
                  index={index}
                  participant={participant}
                  onChangeName={(value) => onParticipantChange(index, "displayName", value)}
                  onSelectSuggestion={(suggestion) => onParticipantSuggestion(index, suggestion)}
                />
              </div>
              <div className={styles.fieldGroupNarrow}>
                <label className={styles.label} htmlFor={`participant-seed-${index}`}>
                  Seed
                </label>
                <Input
                  id={`participant-seed-${index}`}
                  value={participant.seed}
                  onChange={(event) => onParticipantChange(index, "seed", event.target.value)}
                  placeholder={String(index + 1)}
                />
              </div>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor={`participant-handle-${index}`}>
                Handle or team tag
              </label>
              <Input
                id={`participant-handle-${index}`}
                value={participant.handle}
                onChange={(event) => onParticipantChange(index, "handle", event.target.value)}
                placeholder="@handle"
              />
            </div>
            <div className={styles.fieldGroupRow}>
              <div className={styles.fieldGroup}>
                <label className={styles.label} htmlFor={`participant-type-${index}`}>
                  Entity type
                </label>
                <select
                  id={`participant-type-${index}`}
                  className={styles.select}
                  value={participant.entityType}
                  onChange={(event) => onParticipantEntityType(index, event.target.value as ParticipantEntityType)}
                >
                  <option value="custom">Custom</option>
                  <option value="user">User</option>
                  <option value="capsule">Capsule</option>
                </select>
              </div>
              {participant.entityType !== "custom" ? (
                <div className={styles.fieldGroup}>
                  <label className={styles.label} htmlFor={`participant-entity-${index}`}>
                    {participant.entityType === "user" ? "User ID" : "Capsule ID"}
                  </label>
                  <Input
                    id={`participant-entity-${index}`}
                    value={participant.entityType === "user" ? participant.userId : participant.capsuleId}
                    onChange={(event) => onParticipantEntityId(index, event.target.value)}
                    placeholder={participant.entityType === "user" ? "user_123" : "capsule_123"}
                  />
                </div>
              ) : null}
            </div>
            <div className={styles.memberActions}>
              <Button type="button" variant="ghost" onClick={() => onRemoveParticipant(index)}>
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>
      <div className={styles.memberActions}>
        <Button type="button" variant="secondary" onClick={onAddParticipant}>
          Add participant
        </Button>
        <Button type="button" variant="secondary" className={styles.memberInviteButton} onClick={onInviteClick}>
          Invite
        </Button>
      </div>
    </div>
  );
});

type ReviewStepProps = {
  form: TournamentFormState;
  participants: ParticipantFormState[];
};

const ReviewStep = React.memo(function ReviewStep({ form, participants }: ReviewStepProps) {
  return (
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
});

type TournamentStepContentProps = {
  activeStep: TournamentStepId;
  form: TournamentFormState;
  participants: ParticipantFormState[];
  generating: boolean;
  onFormChange: FormChangeHandler;
  onGenerateDraft: () => void;
  onParticipantChange: (index: number, field: keyof ParticipantFormState, value: string) => void;
  onParticipantEntityType: (index: number, entityType: ParticipantEntityType) => void;
  onParticipantEntityId: (index: number, value: string) => void;
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
  onFormChange,
  onGenerateDraft,
  onParticipantChange,
  onParticipantEntityType,
  onParticipantEntityId,
  onParticipantSuggestion,
  onAddParticipant,
  onRemoveParticipant,
  onInviteClick,
}: TournamentStepContentProps) {
  if (activeStep === "blueprint") {
    return (
      <BlueprintStep
        form={form}
        generating={generating}
        onFormChange={onFormChange}
        onGenerateDraft={onGenerateDraft}
      />
    );
  }
  if (activeStep === "title") return <TitleStep form={form} onFormChange={onFormChange} />;
  if (activeStep === "summary") return <SummaryStep form={form} onFormChange={onFormChange} />;
  if (activeStep === "signups") return <SignupsStep form={form} onFormChange={onFormChange} />;
  if (activeStep === "details") return <DetailsStep form={form} onFormChange={onFormChange} />;
  if (activeStep === "format") return <FormatStep form={form} onFormChange={onFormChange} />;
  if (activeStep === "content") return <ContentStep form={form} onFormChange={onFormChange} />;
  if (activeStep === "participants") {
    return (
      <ParticipantsStep
        participants={participants}
        onParticipantChange={onParticipantChange}
        onParticipantEntityType={onParticipantEntityType}
        onParticipantEntityId={onParticipantEntityId}
        onParticipantSuggestion={onParticipantSuggestion}
        onAddParticipant={onAddParticipant}
        onRemoveParticipant={onRemoveParticipant}
        onInviteClick={onInviteClick}
      />
    );
  }
  return <ReviewStep form={form} participants={participants} />;
});
