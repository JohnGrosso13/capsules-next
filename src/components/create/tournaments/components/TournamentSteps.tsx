import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import styles from "../../ladders/LadderBuilder.module.css";
import { NameField } from "./NameField";
import type {
  ParticipantEntityType,
  ParticipantFormState,
  ParticipantSuggestion,
  TournamentFormState,
  TournamentStepId,
} from "../types";

type FormChangeHandler = <K extends keyof TournamentFormState>(key: K, value: TournamentFormState[K]) => void;

type BlueprintStepProps = {
  form: TournamentFormState;
  generating: boolean;
  onFormChange: FormChangeHandler;
  onGenerateDraft: () => void;
  onSkip: () => void;
};

const BlueprintStep = React.memo(function BlueprintStep({
  form,
  generating,
  onFormChange,
  onGenerateDraft,
  onSkip,
}: BlueprintStepProps) {
  return (
    <div className={styles.sectionCard}>
      <div className={styles.fieldGroup}>
        <p className={styles.fieldHint}>
          Mirror the ladder design ideas: start with a blueprint, keep the neon glass UI, and reuse the same preview +
          navigation controls.
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
              onChange={(event) => onFormChange("maxEntrants", event.target.value)}
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
            onChange={(event) => onFormChange("summary", event.target.value)}
          />
          <p className={styles.fieldHint}>We reuse this prompt when generating overview/rules copy.</p>
        </div>
        <div className={styles.fieldGroupRow}>
          <Button type="button" variant="secondary" onClick={onGenerateDraft} disabled={generating}>
            {generating ? "Generating..." : "Generate Capsule AI blueprint"}
          </Button>
          <Button type="button" variant="ghost" onClick={onSkip}>
            Skip for now
          </Button>
        </div>
      </div>
    </div>
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
        <label className={styles.label} htmlFor="tournament-name">
          Tournament name
        </label>
        <Input
          id="tournament-name"
          value={form.name}
          placeholder="Capsule Clash Invitational"
          onChange={(event) => onFormChange("name", event.target.value)}
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
          onChange={(event) => onFormChange("summary", event.target.value)}
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

type FormatStepProps = {
  form: TournamentFormState;
  onFormChange: FormChangeHandler;
};

const FormatStep = React.memo(function FormatStep({ form, onFormChange }: FormatStepProps) {
  return (
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
                onChange={() => onFormChange("format", option)}
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
          <Input id="best-of" value={form.bestOf} onChange={(event) => onFormChange("bestOf", event.target.value)} placeholder="3" />
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
      <div className={styles.fieldGroupRow}>
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
      <div className={styles.fieldGroup}>
        <label className={styles.label}>Registration type</label>
        <div className={styles.radioRow}>
          {(["open", "invite", "waitlist", "mixed"] as const).map((option) => (
            <label key={option} className={styles.radioLabel}>
              <input
                type="radio"
                name="registration-type"
                checked={form.registrationType === option}
                onChange={() => onFormChange("registrationType", option)}
              />
              <span className={styles.radioText}>
                {option === "open"
                  ? "Open sign-ups"
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
  onSkipBlueprint: () => void;
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
  onSkipBlueprint,
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
        onSkip={onSkipBlueprint}
      />
    );
  }
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
