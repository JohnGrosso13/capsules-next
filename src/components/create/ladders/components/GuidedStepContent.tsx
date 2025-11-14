"use client";

import * as React from "react";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import {
  LADDER_TEMPLATE_PRESETS,
  RULE_SNIPPETS,
  REWARD_SNIPPETS,
  type GuidedStepId,
  type LadderTemplatePreset,
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
import { RosterStep } from "./RosterStep";
import { AssistantPrompter } from "./AssistantPrompter";
import type { AssistantMessage } from "../assistantTypes";
import styles from "../LadderBuilder.module.css";

type GuidedStepContentProps = {
  step: GuidedStepId;
  form: LadderBuilderFormState;
  members: LadderMemberFormValues[];
  guidedSummaryIdeas: string[];
  guidedTemplateId: string | null;
  assistantConversation: AssistantMessage[];
  assistantDraft: string;
  onAssistantDraftChange: (value: string) => void;
  onAssistantKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onAssistantSend: () => void;
  onFormField: (field: "name" | "summary" | "visibility" | "publish", value: string | boolean) => void;
  onRegistrationChange: (field: keyof LadderRegistrationFormValues, value: string) => void;
  onGameChange: (field: keyof LadderGameFormValues, value: string) => void;
  onScoringChange: (field: keyof LadderScoringFormValues, value: string) => void;
  onScheduleChange: (field: keyof LadderScheduleFormValues, value: string) => void;
  onSectionChange: (key: SectionKey, field: keyof LadderSectionFormValues, value: string) => void;
  onApplyTemplatePreset: (preset: LadderTemplatePreset) => void;
  onAppendRuleSnippet: (snippet: string) => void;
  onAppendRewardSnippet: (snippet: string) => void;
  onMemberField: (index: number, field: keyof LadderMemberFormValues, value: string) => void;
  onAddMember: () => void;
  onRemoveMember: (index: number) => void;
  reviewOverview: React.ReactNode;
  reviewAiPlan: React.ReactNode;
};

export function GuidedStepContent(props: GuidedStepContentProps) {
  switch (props.step) {
    case "title":
      return (
        <>
          <Card className={styles.namingPanel}>
            <CardHeader className={styles.namingHeader}>
              <CardTitle className={styles.namingTitle}>Pick a title</CardTitle>
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
            <CardTitle className={styles.namingTitle}>One-line summary</CardTitle>
            <CardDescription>Appears anywhere this ladder is referenced inside Capsule.</CardDescription>
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
              onDraftChange={props.onAssistantDraftChange}
              onKeyDown={props.onAssistantKeyDown}
              onSend={props.onAssistantSend}
            />
          </CardContent>
        </Card>
      );
    case "registration":
      return (
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
                  value={props.form.registration.type}
                  onChange={(event) =>
                    props.onRegistrationChange("type", event.target.value as LadderRegistrationFormValues["type"])
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
                  value={props.form.registration.maxTeams}
                  onChange={(event) => props.onRegistrationChange("maxTeams", event.target.value)}
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
                value={props.form.registration.requirements}
                onChange={(event) => props.onRegistrationChange("requirements", event.target.value)}
                rows={3}
                placeholder={"Captains must confirm by Wednesday\nSubs allowed after week 2\nScreenshots required"}
              />
            </div>
          </CardContent>
        </Card>
      );
    case "type":
      return (
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
                value={props.form.game.title}
                onChange={(event) => props.onGameChange("title", event.target.value)}
                placeholder="Rocket League"
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="guided-game-mode">
                Format
              </label>
              <Input
                id="guided-game-mode"
                value={props.form.game.mode}
                onChange={(event) => props.onGameChange("mode", event.target.value)}
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
                  value={props.form.game.platform ?? ""}
                  onChange={(event) => props.onGameChange("platform", event.target.value)}
                  placeholder="Cross-play"
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.label} htmlFor="guided-region">
                  Region
                </label>
                <Input
                  id="guided-region"
                  value={props.form.game.region ?? ""}
                  onChange={(event) => props.onGameChange("region", event.target.value)}
                  placeholder="NA / EU"
                />
              </div>
            </div>
            <div className={styles.templateGrid}>
              {LADDER_TEMPLATE_PRESETS.map((preset) => {
                const isActive = props.guidedTemplateId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={styles.templateButton}
                    data-state={isActive ? "active" : "idle"}
                    onClick={() => props.onApplyTemplatePreset(preset)}
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
      );
    case "format":
      return (
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
            <p className={styles.fieldHint}>These defaults power Capsule&apos;s matchmaking tips. Adjust later if needed.</p>
          </CardContent>
        </Card>
      );
    case "overview":
      return (
        <Card>
          <CardHeader>
            <CardTitle>Ladder overview</CardTitle>
            <CardDescription>This copy appears at the top of your ladder and in invites.</CardDescription>
          </CardHeader>
          <CardContent className={styles.cardContent}>
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
          </CardContent>
        </Card>
      );
    case "rules":
      return (
        <Card>
          <CardHeader>
            <CardTitle>Rules snapshot</CardTitle>
            <CardDescription>We surface these in every post-match recap.</CardDescription>
          </CardHeader>
          <CardContent className={styles.cardContent}>
            <textarea
              id="guided-rules"
              className={styles.textarea}
              value={props.form.sections.rules.body ?? ""}
              onChange={(event) => props.onSectionChange("rules", "body", event.target.value)}
              rows={4}
              placeholder="Matches are best-of-three. Report scores within 2 hours with screenshots."
            />
            <div className={styles.pillGroup}>
              {RULE_SNIPPETS.map((snippet) => (
                <button
                  key={snippet}
                  type="button"
                  className={styles.pillButton}
                  onClick={() => props.onAppendRuleSnippet(snippet)}
                >
                  {snippet}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      );
    case "shoutouts":
      return (
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
          </CardContent>
        </Card>
      );
    case "timeline":
      return (
        <Card>
          <CardHeader>
            <CardTitle>Timeline & cadence</CardTitle>
            <CardDescription>You can always return to this step to tweak the cadence.</CardDescription>
          </CardHeader>
          <CardContent className={styles.cardContent}>
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
          onRemoveMember={props.onRemoveMember}
        />
      );
    case "rewards":
      return (
        <Card>
          <CardHeader>
            <CardTitle>Rewards & spotlight</CardTitle>
            <CardDescription>Shared in every recap, stream script, and reminder.</CardDescription>
          </CardHeader>
          <CardContent className={styles.cardContent}>
            <textarea
              id="guided-rewards"
              className={styles.textarea}
              value={props.form.sections.results.body ?? ""}
              onChange={(event) => props.onSectionChange("results", "body", event.target.value)}
              rows={4}
              placeholder="Top 3 earn featured posts, MVP gets a custom Capsule portrait."
            />
            <div className={styles.pillGroup}>
              {REWARD_SNIPPETS.map((snippet) => (
                <button
                  key={snippet}
                  type="button"
                  className={styles.pillButton}
                  onClick={() => props.onAppendRewardSnippet(snippet)}
                >
                  {snippet}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      );
    case "review":
    default:
      return (
        <>
          <div className={styles.guidedReviewStack}>
            {props.reviewOverview}
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
