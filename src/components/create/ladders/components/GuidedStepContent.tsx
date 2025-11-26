"use client";

import * as React from "react";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  type GuidedStepId,
} from "../guidedConfig";
import type { LadderBuilderFormState } from "../builderState";
import type {
  LadderMemberFormValues,
  LadderRegistrationFormValues,
  LadderGameFormValues,
  LadderScoringFormValues,
  LadderScheduleFormValues,
  LadderSectionFormValues,
  SectionKey,
} from "../ladderFormState";
import { matchFormatOptions } from "../ladderFormState";
import { RosterStep } from "./RosterStep";
import { AssistantPrompter } from "./AssistantPrompter";
import type { AssistantMessage } from "../assistantTypes";
import styles from "../LadderBuilder.module.css";

type GuidedStepContentProps = {
  step: GuidedStepId;
  form: LadderBuilderFormState;
  members: LadderMemberFormValues[];
  guidedSummaryIdeas: string[];
  assistantConversation: AssistantMessage[];
  assistantDraft: string;
  assistantBusy?: boolean;
  onAssistantDraftChange: (value: string) => void;
  onAssistantKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onAssistantSend: () => void;
  onFormField: (field: "name" | "summary" | "visibility" | "publish", value: string | boolean) => void;
  onRegistrationChange: (field: keyof LadderRegistrationFormValues, value: string) => void;
  onGameChange: (field: keyof LadderGameFormValues, value: string) => void;
  onScoringChange: (field: keyof LadderScoringFormValues, value: string) => void;
  onScheduleChange: (field: keyof LadderScheduleFormValues, value: string) => void;
  onSectionChange: (key: SectionKey, field: keyof LadderSectionFormValues, value: string) => void;
  onMemberField: (index: number, field: keyof LadderMemberFormValues, value: string) => void;
  onAddMember: () => void;
  onAddMemberWithUser: (user: { id: string; name: string }) => void;
  onRemoveMember: (index: number) => void;
  reviewOverview: React.ReactNode;
  reviewAiPlan: React.ReactNode;
};

const REGISTRATION_TYPE_HELP: Record<LadderRegistrationFormValues["type"], string> = {
  open: "Anyone who can see the ladder can join instantly until you hit any optional max-team limit.",
  invite: "Players request to join or receive invites; you approve each entry before they appear in the ladder.",
  waitlist:
    "Players join a waitlist first. You promote them into active slots when there’s space or a new season starts.",
};

const REQUIREMENT_SUGGESTIONS = [
  "Captains confirm availability by Wednesday",
  "Subs allowed after week two",
  "Screenshots required for score disputes",
];

export function GuidedStepContent(props: GuidedStepContentProps) {
  const [requirementDraft, setRequirementDraft] = React.useState("");
  const onRegistrationChange = props.onRegistrationChange;
  const requirementItems = React.useMemo(() => {
    return (props.form.registration.requirements ?? "")
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }, [props.form.registration.requirements]);

  const syncRequirements = React.useCallback(
    (items: string[]) => {
      onRegistrationChange("requirements", items.join("\n"));
    },
    [onRegistrationChange],
  );

  const handleRequirementAdd = React.useCallback(() => {
    const trimmed = requirementDraft.trim();
    if (!trimmed.length) return;
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

  switch (props.step) {
    case "blueprint":
      return (
        <Card className={styles.namingPanel} variant="ghost">
          <CardHeader className={styles.namingHeader}>
            <CardTitle className={styles.namingTitle}>Describe your ladder</CardTitle>
            <CardDescription>
              Share the vibe, game, format, sign-ups, rules, cadence, and rewards. Your assistant will draft the steps for you.
            </CardDescription>
          </CardHeader>
          <CardContent className={styles.namingBody}>
            <AssistantPrompter
              placeholder="Example: Weekly 3v3 Overwatch ladder, open sign-ups, NA/EU, best-of-three, weekly MVP shoutouts..."
              conversation={props.assistantConversation}
              draft={props.assistantDraft}
              busy={props.assistantBusy ?? false}
              onDraftChange={props.onAssistantDraftChange}
              onKeyDown={props.onAssistantKeyDown}
              onSend={props.onAssistantSend}
            />
          </CardContent>
        </Card>
      );
    case "title":
      return (
        <>
          <Card className={styles.namingPanel} variant="ghost">
            <CardHeader className={styles.namingHeader}>
              <CardTitle className={styles.namingTitle}>Title</CardTitle>
            </CardHeader>
            <CardContent className={styles.namingBody}>
              <div className={styles.fieldGroup}>
                <Input
                  id="guided-name"
                  value={props.form.name}
                  onChange={(event) => props.onFormField("name", event.target.value)}
                  placeholder="Type a title..."
                />
              </div>
              <div className={styles.namingOr}><span>or chat with Capsule AI</span></div>
              <AssistantPrompter
                placeholder="Ask for title ideas or anything you need help with..."
                conversation={props.assistantConversation}
                draft={props.assistantDraft}
                busy={props.assistantBusy ?? false}
                onDraftChange={props.onAssistantDraftChange}
                onKeyDown={props.onAssistantKeyDown}
                onSend={props.onAssistantSend}
              />
            </CardContent>
          </Card>
        </>
      );
    case "summary":
      return (
        <Card className={styles.namingPanel}>
          <CardHeader className={styles.namingHeader}>
            <CardTitle className={styles.namingTitle}>Summary</CardTitle>
            <CardDescription>Explain why this ladder matters in a single sentence.</CardDescription>
          </CardHeader>
          <CardContent className={styles.namingBody}>
            <div className={styles.fieldGroup}>
              <textarea
                id="guided-summary"
                className={styles.textarea}
                value={props.form.summary}
                onChange={(event) => props.onFormField("summary", event.target.value)}
                rows={3}
                placeholder="Weekly Rocket League duels with Capsule AI recaps + spotlight prizes."
              />
            </div>
            <div className={styles.namingOr}>
              <span>or chat with Capsule AI</span>
            </div>
              <AssistantPrompter
                placeholder="Who is this ladder for? What's at stake?"
                conversation={props.assistantConversation}
                draft={props.assistantDraft}
                busy={props.assistantBusy ?? false}
                onDraftChange={props.onAssistantDraftChange}
                onKeyDown={props.onAssistantKeyDown}
                onSend={props.onAssistantSend}
              />
          </CardContent>
        </Card>
      );
    case "registration":
      return (
        <Card className={styles.formCard} variant="ghost">
          <CardHeader className={styles.formCardHeader}>
            <CardTitle className={styles.formCardTitle}>Sign-Ups</CardTitle>
            <CardDescription className={styles.formCardDescription}>
              Choose how teams join. You can optionally add a soft cap and launch requirements, and change these later.
            </CardDescription>
          </CardHeader>
          <CardContent className={`${styles.formCardContent} ${styles.registrationContent}`}>
            <div className={styles.registrationGrid}>
              <section className={`${styles.registrationBlock} ${styles.registrationFieldBlock}`}>
                <div className={styles.registrationBlockHeader}>
                  <h3 className={styles.registrationTitle}>Registration mode</h3>
                  <p className={styles.registrationLead}>
                    Pick whether challengers join instantly or need host approval first.
                  </p>
                </div>
                <div className={styles.registrationFieldRow}>
                  <label className={styles.label} htmlFor="guided-registration-type">
                    Mode
                  </label>
                  <select
                    id="guided-registration-type"
                    className={styles.select}
                    value={props.form.registration.type}
                    onChange={(event) =>
                      props.onRegistrationChange("type", event.target.value as LadderRegistrationFormValues["type"])
                    }
                  >
                    <option value="open">Open sign-ups</option>
                    <option value="invite">Invite-only / host approval</option>
                    <option value="waitlist">Waitlist queue</option>
                  </select>
                </div>
                <div className={styles.registrationHelper}>
                  {REGISTRATION_TYPE_HELP[props.form.registration.type] ?? REGISTRATION_TYPE_HELP.open}
                </div>
              </section>
              <section className={`${styles.registrationBlock} ${styles.registrationFieldBlock}`}>
                <div className={styles.registrationBlockHeader}>
                  <h3 className={styles.registrationTitle}>Max teams / players</h3>
                  <p className={styles.registrationLead}>
                    Set a soft cap so you can pace onboarding, or leave it blank to stay open.
                  </p>
                </div>
                <div className={styles.registrationFieldRow}>
                  <label className={styles.label} htmlFor="guided-max-teams">
                    Soft cap (optional)
                  </label>
                  <Input
                    id="guided-max-teams"
                    type="number"
                    value={props.form.registration.maxTeams}
                    onChange={(event) => props.onRegistrationChange("maxTeams", event.target.value)}
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
                Turn expectations into a short list challengers can scan before joining.
              </p>
              <div className={styles.requirementsComposer}>
                <Input
                  id="guided-registration-reqs"
                  value={requirementDraft}
                  onChange={(event) => setRequirementDraft(event.target.value)}
                  onKeyDown={handleRequirementKeyDown}
                  onPaste={handleRequirementPaste}
                  onBlur={handleRequirementAdd}
                  placeholder="Add a quick rule, e.g. proof screenshots or check-in time"
                  aria-label="Add a requirement"
                  size="md"
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
    case "type":
      return (
        <Card className={styles.formCard} variant="ghost">
            <CardHeader className={styles.formCardHeader}>
              <CardTitle className={styles.formCardTitle}>Basics</CardTitle>
              <CardDescription className={styles.formCardDescription}>
                Capsule AI uses this to suggest rules, playlists, and stats, but you can keep it lightweight to start.
              </CardDescription>
            </CardHeader>
            <CardContent className={styles.formCardContent}>
              <div className={styles.fieldGroup}>
                <label className={styles.label} htmlFor="guided-game-title">
                  Game or title (optional)
                </label>
                <Input
                  id="guided-game-title"
                  value={props.form.game.title}
                  onChange={(event) => props.onGameChange("title", event.target.value)}
                  placeholder="Rocket League"
                />
                <p className={styles.fieldHint}>
                  Name the main game or series you&apos;re featuring, or leave this blank and Capsule will fall back to a generic title.
                </p>
              </div>
              <div className={styles.fieldRow}>
                <div className={styles.fieldGroup}>
                  <label className={styles.label} htmlFor="guided-platform">
                    Platform (optional)
                  </label>
                  <Input
                    id="guided-platform"
                    value={props.form.game.platform ?? ""}
                    onChange={(event) => props.onGameChange("platform", event.target.value)}
                    placeholder="Cross-play"
                  />
                  <p className={styles.fieldHint}>
                    Call out console, PC, or cross-play so challengers know where they&apos;ll be playing.
                  </p>
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.label} htmlFor="guided-region">
                    Region (optional)
                  </label>
                  <Input
                    id="guided-region"
                    value={props.form.game.region ?? ""}
                    onChange={(event) => props.onGameChange("region", event.target.value)}
                    placeholder="NA / EU"
                  />
                  <p className={styles.fieldHint}>
                    Note primary regions or servers (e.g. NA, EU, Asia) to help set expectations around ping and timing.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
    case "format":
      return (
          <Card className={styles.formCard} variant="ghost">
            <CardHeader className={styles.formCardHeader}>
              <CardTitle className={styles.formCardTitle}>Format</CardTitle>
              <CardDescription className={styles.formCardDescription}>
                Pick a scoring style and match format. Elo exposes rating controls; Simple hides them.
              </CardDescription>
            </CardHeader>
            <CardContent className={styles.formCardContent}>
                <div className={styles.scoringModes}>
                  {[
                    {
                      id: "simple",
                      label: "Simple",
                      headline: "Climb quickly by beating higher ranks.",
                      blurb:
                        "Perfect for casual ladders. When an underdog beats someone above them, they jump halfway up the gap.",
                    },
                    {
                      id: "elo",
                      label: "Elo",
                      headline: "Stable ratings that react to every match.",
                      blurb:
                        "Uses a classic rating system to nudge numbers up or down based on opponent strength and K-factor.",
                    },
                    {
                      id: "ai",
                      label: "AI Ranking",
                      headline: "Assistant-curated leaderboards.",
                      blurb:
                        "Your assistant reviews highlights, streams, and activity signals to suggest who feels truly on top.",
                    },
                  ].map((mode) => {
                    const isActive =
                      props.form.scoring.system === mode.id ||
                      (props.form.scoring.system === "points" && mode.id === "simple");
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        className={[
                          styles.scoringModeTile,
                          isActive ? styles.scoringModeTileActive : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        aria-pressed={isActive}
                        onClick={() =>
                          props.onScoringChange("system", mode.id as LadderScoringFormValues["system"])
                        }
                      >
                        <div className={styles.scoringModeHeader}>
                          <span className={styles.scoringModeTitle}>{mode.label}</span>
                          <span className={styles.scoringModeSubtitle}>{mode.headline}</span>
                        </div>
                        <p className={styles.scoringModeBlurb}>{mode.blurb}</p>
                        <div className={styles.scoringModeDetail}>
                          {mode.id === "simple"
                            ? "Example: Rank 10 beats Rank 1 -> moves to Rank 5 (half the distance between them)."
                            : mode.id === "elo"
                              ? "ELO uses your initial rating, K-factor, and placement matches to control how quickly ratings swing."
                              : "Your assistant blends qualitative signals (clips, streams, and consistency) with activity to fine-tune ordering."}
                        </div>
                        {isActive ? <span className={styles.selectedPill}>Selected</span> : null}
                      </button>
                    );
                  })}
                </div>
              <div className={styles.fieldGroup}>
                <span className={styles.label}>Match format</span>
                <div className={styles.matchFormatRow}>
                  {matchFormatOptions.map((option) => {
                    const active = props.form.game.mode === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={`${styles.formatOption} ${active ? styles.formatOptionActive : ""}`.trim()}
                        aria-pressed={active}
                        onClick={() => props.onGameChange("mode", option.value)}
                      >
                        <span className={styles.formatOptionLabel}>{option.label}</span>
                        <span className={styles.formatOptionHint}>
                          {option.value === "1v1"
                            ? "Best for solo ladders and duels."
                            : option.value === "teams"
                              ? "Teams of users compete (set roster size later)."
                              : "Capsule vs Capsule matches at the community level."}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className={styles.fieldHint}>Choose one of the three formats to continue.</p>
              </div>
              {props.form.scoring.system === "elo" ? (
                <>
                  <div className={styles.fieldRow}>
                    <div className={styles.fieldGroup}>
                      <label className={styles.label} htmlFor="guided-initial-rating">
                        Initial rating
                      </label>
                      <Input
                        id="guided-initial-rating"
                        type="number"
                        value={props.form.scoring.initialRating}
                        onChange={(event) => props.onScoringChange("initialRating", event.target.value)}
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
                        value={props.form.scoring.kFactor}
                        onChange={(event) => props.onScoringChange("kFactor", event.target.value)}
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
                        value={props.form.scoring.placementMatches}
                        onChange={(event) => props.onScoringChange("placementMatches", event.target.value)}
                        placeholder="3"
                      />
                    </div>
                  </div>
                  <p className={styles.fieldHint}>
                    These defaults power Capsule&apos;s matchmaking tips. Adjust later if needed.
                  </p>
                </>
              ) : null}
          </CardContent>
        </Card>
      );
    case "overview":
      return (
        <Card className={styles.formCard} variant="ghost">
          <CardHeader className={styles.formCardHeader}>
            <CardTitle className={styles.formCardTitle}>Overview</CardTitle>
            <CardDescription className={styles.formCardDescription}>
              This copy appears at the top of your ladder and in invites.
            </CardDescription>
          </CardHeader>
          <CardContent className={styles.formCardContent}>
            <textarea
              id="guided-overview"
              className={styles.textarea}
              value={props.form.sections.overview.body ?? ""}
              onChange={(event) => props.onSectionChange("overview", "body", event.target.value)}
              rows={5}
              placeholder="Set the stakes, cadence, rewards, and why challengers should care."
            />
            <p className={styles.fieldHint}>
              Mention cadence, platform, or spotlight moments so Capsule can reuse the story across surfaces.
            </p>
            <div className={styles.namingOr}>
              <span>or chat with Capsule AI</span>
            </div>
            <AssistantPrompter
              placeholder="Ask Capsule AI to draft the overview or tighten the hook..."
              conversation={props.assistantConversation}
              draft={props.assistantDraft}
              busy={props.assistantBusy ?? false}
              onDraftChange={props.onAssistantDraftChange}
              onKeyDown={props.onAssistantKeyDown}
              onSend={props.onAssistantSend}
            />
          </CardContent>
        </Card>
      );
    case "rules":
      return (
        <Card className={styles.formCard} variant="ghost">
          <CardHeader className={styles.formCardHeader}>
            <CardTitle className={styles.formCardTitle}>Rules</CardTitle>
            <CardDescription className={styles.formCardDescription}>
              We surface these in every post-match recap.
            </CardDescription>
          </CardHeader>
          <CardContent className={styles.formCardContent}>
            <textarea
              id="guided-rules"
              className={styles.textarea}
              value={props.form.sections.rules.body ?? ""}
              onChange={(event) => props.onSectionChange("rules", "body", event.target.value)}
              rows={4}
              placeholder="Matches are best-of-three. Report scores within 2 hours with screenshots."
            />
            <div className={styles.namingOr}>
              <span>or chat with Capsule AI</span>
            </div>
            <AssistantPrompter
              placeholder="Ask for a full ruleset, anti-cheat notes, or dispute policy..."
              conversation={props.assistantConversation}
              draft={props.assistantDraft}
              busy={props.assistantBusy ?? false}
              onDraftChange={props.onAssistantDraftChange}
              onKeyDown={props.onAssistantKeyDown}
              onSend={props.onAssistantSend}
            />
          </CardContent>
        </Card>
      );
    case "shoutouts":
      return (
        <Card className={styles.formCard} variant="ghost">
          <CardHeader className={styles.formCardHeader}>
            <CardTitle className={styles.formCardTitle}>Shoutouts</CardTitle>
            <CardDescription className={styles.formCardDescription}>
              Feed Capsule AI the themes you want to spotlight every week.
            </CardDescription>
          </CardHeader>
          <CardContent className={styles.formCardContent}>
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="guided-shoutouts-body">
                Story beats
              </label>
              <textarea
                id="guided-shoutouts-body"
                className={styles.textarea}
                value={props.form.sections.shoutouts.body ?? ""}
                onChange={(event) => props.onSectionChange("shoutouts", "body", event.target.value)}
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
              value={props.form.sections.shoutouts.bulletsText ?? ""}
              onChange={(event) => props.onSectionChange("shoutouts", "bulletsText", event.target.value)}
              rows={3}
              placeholder={"Most electrifying play\nFan favorite team\nUnderdog to watch"}
            />
          </div>
          <div className={styles.namingOr}>
            <span>or chat with Capsule AI</span>
          </div>
          <AssistantPrompter
            placeholder="Ask for spotlight themes, weekly awards, or story hooks..."
            conversation={props.assistantConversation}
            draft={props.assistantDraft}
            busy={props.assistantBusy ?? false}
            onDraftChange={props.onAssistantDraftChange}
            onKeyDown={props.onAssistantKeyDown}
            onSend={props.onAssistantSend}
          />
          </CardContent>
        </Card>
      );
    case "timeline":
        return (
          <Card className={styles.formCard}>
            <CardHeader className={styles.formCardHeader}>
              <CardTitle className={styles.formCardTitle}>Timeline</CardTitle>
              <CardDescription className={styles.formCardDescription}>
                You can always return to this step to tweak the cadence.
              </CardDescription>
            </CardHeader>
          <CardContent className={styles.formCardContent}>
            <div className={styles.fieldRow}>
              <div className={styles.fieldGroup}>
                <label className={styles.label} htmlFor="guided-season-length">
                  Season length or arc
                </label>
                <Input
                  id="guided-season-length"
                  value={props.form.schedule.cadence ?? ""}
                  onChange={(event) => props.onScheduleChange("cadence", event.target.value)}
                  placeholder="8 weeks of weekly duels"
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.label} htmlFor="guided-cadence">
                  Match cadence
                </label>
                <Input
                  id="guided-cadence"
                  value={props.form.schedule.kickoff ?? ""}
                  onChange={(event) => props.onScheduleChange("kickoff", event.target.value)}
                  placeholder="Thursdays 7 PM local"
                />
              </div>
            </div>
            <div className={styles.fieldRow}>
              <div className={styles.fieldGroup}>
                <label className={styles.label} htmlFor="guided-kickoff">
                  Kickoff notes
                </label>
                <Input
                  id="guided-kickoff"
                  value={props.form.schedule.kickoff ?? ""}
                  onChange={(event) => props.onScheduleChange("kickoff", event.target.value)}
                  placeholder="Season kickoff stream + Capsule shoutouts"
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.label} htmlFor="guided-timezone">
                  Timezone
                </label>
                <Input
                  id="guided-timezone"
                  value={props.form.schedule.timezone ?? ""}
                  onChange={(event) => props.onScheduleChange("timezone", event.target.value)}
                  placeholder="NA / CET"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      );
    case "roster":
      return (
        <RosterStep
          members={props.members}
          onMemberField={props.onMemberField}
          onAddMember={props.onAddMember}
          onAddMemberWithUser={props.onAddMemberWithUser}
          onRemoveMember={props.onRemoveMember}
        />
      );
    case "rewards":
      return (
        <Card className={styles.formCard}>
          <CardHeader className={styles.formCardHeader}>
            <CardTitle className={styles.formCardTitle}>Rewards</CardTitle>
            <CardDescription className={styles.formCardDescription}>
              Shared in every recap, stream script, and reminder.
            </CardDescription>
          </CardHeader>
          <CardContent className={styles.formCardContent}>
            <textarea
              id="guided-rewards"
              className={styles.textarea}
              value={props.form.sections.results.body ?? ""}
              onChange={(event) => props.onSectionChange("results", "body", event.target.value)}
              rows={4}
              placeholder="Top 3 earn featured posts, MVP gets a custom Capsule portrait."
            />
            <div className={styles.namingOr}>
              <span>or chat with Capsule AI</span>
            </div>
            <AssistantPrompter
              placeholder="Ask for prize ideas, seasonal incentives, or sponsor-friendly rewards..."
              conversation={props.assistantConversation}
              draft={props.assistantDraft}
              busy={props.assistantBusy ?? false}
              onDraftChange={props.onAssistantDraftChange}
              onKeyDown={props.onAssistantKeyDown}
              onSend={props.onAssistantSend}
            />
          </CardContent>
        </Card>
      );
    case "review":
    default:
      return (
        <>
          <div className={styles.guidedReviewStack}>
            {props.reviewOverview}
            <Card className={styles.formCard} variant="ghost">
              <CardHeader className={styles.formCardHeader}>
                <CardTitle className={styles.formCardTitle}>Visibility & publish</CardTitle>
                <CardDescription className={styles.formCardDescription}>
                  Flip to public whenever you&apos;re ready.
                </CardDescription>
              </CardHeader>
              <CardContent className={styles.formCardContent}>
                <div className={styles.fieldGroup}>
                  <label className={styles.label} htmlFor="guided-visibility">
                    Visibility
                  </label>
                  <select
                    id="guided-visibility"
                    className={styles.select}
                    value={props.form.visibility}
                    onChange={(event) =>
                      props.onFormField("visibility", event.target.value as "private" | "capsule" | "public")
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
                    checked={props.form.publish}
                    onChange={(event) => props.onFormField("publish", event.target.checked)}
                  />
                  <label htmlFor="guided-publish">Publish immediately after saving</label>
                </div>
                <p className={styles.fieldHint}>Leave unchecked to save a draft. Capsule will keep everything private.</p>
              </CardContent>
            </Card>
            {props.reviewAiPlan}
          </div>
        </>
      );
  }
}
