"use client";

import * as React from "react";
import { CaretRight, PencilSimple, Sparkle, Trash } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type {
  CapsuleHistoryCandidate,
  CapsuleHistoryCoverage,
  CapsuleHistoryCoverageMetric,
  CapsuleHistoryPeriod,
  CapsuleHistorySection,
  CapsuleHistorySectionContent,
  CapsuleHistorySnapshot,
  CapsuleHistoryContentBlock,
  CapsuleHistoryTimelineEntry,
  CapsuleHistoryPinnedItem,
  CapsuleHistoryTemplatePreset,
  CapsuleHistoryPromptMemory,
} from "@/types/capsules";
import styles from "./CapsuleHistoryCuration.module.css";

type CapsuleHistoryCurationProps = {
  capsuleId: string | null;
  snapshot: CapsuleHistorySnapshot | null;
  loading: boolean;
  error: string | null;
  onRefresh: (force?: boolean) => Promise<void>;
};

type SectionEditorProps = {
  capsuleId: string;
  section: CapsuleHistorySection;
  sources: CapsuleHistorySnapshot["sources"];
  templates: CapsuleHistoryTemplatePreset[];
  onRefresh: (force?: boolean) => Promise<void>;
};

const PERIOD_LABEL: Record<CapsuleHistoryPeriod, string> = {
  weekly: "This Week",
  monthly: "This Month",
  all_time: "All Time",
};

function cloneContentBlock(block: CapsuleHistoryContentBlock): CapsuleHistoryContentBlock {
  return {
    ...block,
    sourceIds: Array.isArray(block.sourceIds) ? [...block.sourceIds] : [],
    metadata:
      block.metadata && typeof block.metadata === "object"
        ? { ...(block.metadata as Record<string, unknown>) }
        : null,
    pinned: Boolean(block.pinned),
    pinId: block.pinId ?? null,
    note: block.note ?? null,
  };
}

function cloneTimelineEntry(entry: CapsuleHistoryTimelineEntry): CapsuleHistoryTimelineEntry {
  return {
    ...cloneContentBlock(entry),
    label: entry.label,
    detail: entry.detail,
    timestamp: entry.timestamp ?? null,
    postId: entry.postId ?? null,
    permalink: entry.permalink ?? null,
  };
}

function cloneSectionContent(content: CapsuleHistorySectionContent): CapsuleHistorySectionContent {
  return {
    summary: cloneContentBlock(content.summary),
    highlights: content.highlights.map((item) => cloneContentBlock(item)),
    articles: Array.isArray(content.articles)
      ? content.articles.map(
          (item) => cloneContentBlock(item) as CapsuleHistorySectionContent["articles"][number],
        )
      : [],
    timeline: content.timeline.map((item) => cloneTimelineEntry(item)),
    nextFocus: content.nextFocus.map((item) => cloneContentBlock(item)),
  };
}

function createEmptyBlock(): CapsuleHistoryContentBlock {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `block-${Date.now()}`;
  return {
    id,
    text: "",
    sourceIds: [],
    pinned: false,
    pinId: null,
    note: null,
    metadata: null,
  };
}

function createEmptyTimelineEntry(): CapsuleHistoryTimelineEntry {
  const base = cloneContentBlock(createEmptyBlock());
  return {
    ...base,
    label: "",
    detail: "",
    timestamp: null,
    postId: null,
    permalink: null,
  };
}

type TemplateDraft = {
  id: string;
  label: string;
  description: string;
  tone: string;
};

function toTemplateDraft(template: CapsuleHistoryTemplatePreset): TemplateDraft {
  return {
    id: template.id,
    label: template.label ?? "",
    description: template.description ?? "",
    tone: template.tone ?? "",
  };
}

function fromTemplateDraft(draft: TemplateDraft): CapsuleHistoryTemplatePreset {
  const normalizedId = draft.id.trim();
  const normalizedLabel = draft.label.trim();
  return {
    id: normalizedId,
    label: normalizedLabel.length ? normalizedLabel : normalizedId || "template",
    description: draft.description.trim() || null,
    tone: draft.tone.trim() || null,
  };
}

function parseMultilineList(value: string): string[] {
  return value
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function CapsuleHistoryCuration({
  capsuleId,
  snapshot,
  loading,
  error,
  onRefresh,
}: CapsuleHistoryCurationProps) {
  const [activePeriod, setActivePeriod] = React.useState<CapsuleHistoryPeriod>("weekly");

  React.useEffect(() => {
    if (!snapshot || snapshot.sections.length === 0) return;
    if (!snapshot.sections.some((section) => section.period === activePeriod)) {
      const fallback = snapshot.sections[0]?.period ?? "weekly";
      setActivePeriod(fallback);
    }
  }, [snapshot, activePeriod]);

  if (!capsuleId) {
    return <div className={styles.wrapper}>Select a capsule to curate its history.</div>;
  }

  if (loading && !snapshot) {
    return <div className={styles.wrapper}>Loading capsule history...</div>;
  }

  if (error) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.statusBar}>
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={() => onRefresh(true)}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.statusBar}>
          <span>No activity yet. Publish posts to build your capsule wiki.</span>
          <Button size="sm" variant="outline" onClick={() => onRefresh(true)}>
            Refresh
          </Button>
        </div>
      </div>
    );
  }

  const resolvedCapsuleId = capsuleId!;
  const activeSection = snapshot.sections.find((section) => section.period === activePeriod);

  return (
    <div className={styles.wrapper}>
      <div className={styles.statusBar}>
        <div>
          <strong>Suggested</strong> updated at {new Date(snapshot.suggestedGeneratedAt).toLocaleString()}
          {snapshot.publishedGeneratedAt
            ? ` | Published ${new Date(snapshot.publishedGeneratedAt).toLocaleString()}`
            : " | Not yet curated"}
        </div>
        <Button size="sm" variant="outline" onClick={() => onRefresh(true)} disabled={loading}>
          Refresh AI Draft
        </Button>
      </div>
      <div className={styles.sectionNav}>
        {snapshot.sections.map((section) => (
          <button
            key={section.period}
            type="button"
            className={cn(styles.sectionButton, section.period === activePeriod && styles.sectionButtonActive)}
            onClick={() => setActivePeriod(section.period)}
          >
            {PERIOD_LABEL[section.period]} | {section.postCount} posts
          </button>
        ))}
      </div>
      {activeSection ? (
        <section className={styles.sectionCard}>
          <SectionEditor
            capsuleId={resolvedCapsuleId}
            section={activeSection}
            sources={snapshot.sources}
            templates={snapshot.templates}
            onRefresh={onRefresh}
          />
        </section>
      ) : null}
      <section className={styles.sectionCard}>
        <PromptMemoryEditor
          capsuleId={resolvedCapsuleId}
          promptMemory={snapshot.promptMemory}
          templates={snapshot.templates}
          onRefresh={onRefresh}
        />
      </section>
    </div>
  );
}

function SectionEditor({ capsuleId, section, sources, templates, onRefresh }: SectionEditorProps) {
  const [draftContent, setDraftContent] = React.useState<CapsuleHistorySectionContent>(() =>
    cloneSectionContent(section.published ?? section.suggested),
  );
  const [notes, setNotes] = React.useState(section.editorNotes ?? "");
  const [templateId, setTemplateId] = React.useState(section.templateId ?? "");
  const [toneRecipeId, setToneRecipeId] = React.useState(section.toneRecipeId ?? "");
  const [reason, setReason] = React.useState("");
  const [instructions, setInstructions] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [refining, setRefining] = React.useState(false);
  const [settingsSaving, setSettingsSaving] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const templateListId = React.useMemo(
    () => `capsule-history-template-${section.period}`,
    [section.period],
  );
  const selectedTemplate = React.useMemo(() => {
    const trimmed = templateId.trim();
    if (!trimmed) return null;
    return templates.find((template) => template.id === trimmed) ?? null;
  }, [templateId, templates]);

  React.useEffect(() => {
    setDraftContent(cloneSectionContent(section.published ?? section.suggested));
    setNotes(section.editorNotes ?? "");
    setTemplateId(section.templateId ?? "");
    setToneRecipeId(section.toneRecipeId ?? "");
    setReason("");
    setStatus(null);
  }, [section]);

  const handleContentChange = React.useCallback(
    (updater: (content: CapsuleHistorySectionContent) => CapsuleHistorySectionContent) => {
      setDraftContent((prev) => updater(cloneSectionContent(prev)));
    },
    [],
  );

  const handleSave = async () => {
    if (!capsuleId) return;
    setSaving(true);
    setStatus(null);
    try {
      const response = await fetch(`/api/capsules/${capsuleId}/history/curate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "publish_section",
          period: section.period,
          content: draftContent,
          title: section.title,
          timeframe: section.timeframe,
          postCount: section.postCount,
          notes,
          templateId: templateId.trim() ? templateId.trim() : null,
          toneRecipeId: toneRecipeId.trim() ? toneRecipeId.trim() : null,
          reason: reason.trim() ? reason.trim() : null,
        }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      await onRefresh(true);
      setStatus("Published section updated.");
      setReason("");
    } catch (error) {
      console.error("publish_section", error);
      setStatus(error instanceof Error ? error.message : "Failed to publish section");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettings = async () => {
    setSettingsSaving(true);
    setStatus(null);
    try {
      const response = await fetch(`/api/capsules/${capsuleId}/history/curate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_settings",
          period: section.period,
          notes,
          templateId: templateId.trim() ? templateId.trim() : null,
          toneRecipeId: toneRecipeId.trim() ? toneRecipeId.trim() : null,
        }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      await onRefresh(true);
      setStatus("Section settings updated.");
    } catch (error) {
      console.error("update_settings", error);
      setStatus(error instanceof Error ? error.message : "Failed to update settings");
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleRefine = async () => {
    if (!capsuleId) return;
    setRefining(true);
    setStatus(null);
    try {
      const response = await fetch(`/api/capsules/${capsuleId}/history/curate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "refine_section",
          period: section.period,
          instructions: instructions || null,
        }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const payload = (await response.json()) as {
        section: CapsuleHistorySectionContent | null;
        snapshot: CapsuleHistorySnapshot;
      };
      if (payload.section) {
        setDraftContent(cloneSectionContent(payload.section));
      }
      await onRefresh(true);
      setStatus("AI refinement completed.");
    } catch (error) {
      console.error("refine_section", error);
      setStatus(error instanceof Error ? error.message : "Failed to refine section");
    } finally {
      setRefining(false);
    }
  };

  const handleAddHighlight = (candidate?: CapsuleHistoryCandidate) => {
    handleContentChange((content) => {
      const highlight = candidate
        ? {
            ...createEmptyBlock(),
            text: candidate.excerpt ?? candidate.title ?? "",
            sourceIds: candidate.sourceIds,
          }
        : createEmptyBlock();
      return {
        ...content,
        highlights: [...content.highlights, highlight],
      };
    });
  };

  const handleAddNextFocus = () => {
    handleContentChange((content) => ({
      ...content,
      nextFocus: [...content.nextFocus, createEmptyBlock()],
    }));
  };

  const handleAddTimeline = (candidate?: CapsuleHistoryCandidate) => {
    handleContentChange((content) => {
      const entry = candidate
        ? {
            ...createEmptyTimelineEntry(),
            label: candidate.title ?? "Update",
            detail: candidate.excerpt ?? "",
            timestamp: candidate.createdAt ?? null,
            postId: candidate.postId ?? null,
            sourceIds: candidate.sourceIds,
          }
        : createEmptyTimelineEntry();
      return {
        ...content,
        timeline: [...content.timeline, entry],
      };
    });
  };

  const handlePinCandidate = async (candidate: CapsuleHistoryCandidate) => {
    if (!capsuleId) return;
    setStatus(null);
    try {
      await fetch(`/api/capsules/${capsuleId}/history/curate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_pin",
          period: section.period,
          type: "highlight",
          postId: candidate.postId ?? null,
          quote: candidate.excerpt ?? null,
          source: { candidateId: candidate.id },
        }),
      });
      await onRefresh(true);
      setStatus("Candidate pinned to highlights.");
    } catch (error) {
      console.error("add_pin", error);
      setStatus(error instanceof Error ? error.message : "Failed to pin candidate");
    }
  };

  const handleExcludeCandidate = async (candidate: CapsuleHistoryCandidate) => {
    if (!capsuleId || !candidate.postId) return;
    setStatus(null);
    try {
      await fetch(`/api/capsules/${capsuleId}/history/curate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_exclusion",
          period: section.period,
          postId: candidate.postId,
        }),
      });
      await onRefresh(true);
      setStatus("Post excluded from future summaries.");
    } catch (error) {
      console.error("add_exclusion", error);
      setStatus(error instanceof Error ? error.message : "Failed to exclude post");
    }
  };

  const handleRemovePin = async (pin: CapsuleHistoryPinnedItem) => {
    if (!capsuleId) return;
    setStatus(null);
    try {
      await fetch(`/api/capsules/${capsuleId}/history/curate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "remove_pin",
          pinId: pin.id,
          period: pin.period,
        }),
      });
      await onRefresh(true);
      setStatus("Pin removed.");
    } catch (error) {
      console.error("remove_pin", error);
      setStatus(error instanceof Error ? error.message : "Failed to remove pin");
    }
  };

  const handleRemoveExclusion = async (postId: string) => {
    if (!capsuleId) return;
    setStatus(null);
    try {
      await fetch(`/api/capsules/${capsuleId}/history/curate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "remove_exclusion",
          period: section.period,
          postId,
        }),
      });
      await onRefresh(true);
      setStatus("Exclusion removed.");
    } catch (error) {
      console.error("remove_exclusion", error);
      setStatus(error instanceof Error ? error.message : "Failed to remove exclusion");
    }
  };

  return (
    <div className={styles.columns}>
      <div className={styles.column}>
        <div className={styles.columnHeader}>
          <h3>AI Suggested</h3>
          <Badge variant="outline">Reference</Badge>
        </div>
        <HistoryReadOnly content={section.suggested} />
        <div className={styles.fieldGroup}>
          <span className={styles.fieldLabel}>Candidates</span>
          {section.candidates.length ? (
            <div className={styles.candidateList}>
              {section.candidates.map((candidate) => (
                <div key={candidate.id} className={styles.candidateItem}>
                  <strong>{candidate.title ?? candidate.kind.toUpperCase()}</strong>
                  {candidate.excerpt ? <p>{candidate.excerpt}</p> : null}
                  <div className={styles.candidateActions}>
                    <Button size="xs" variant="outline" onClick={() => handleAddHighlight(candidate)}>
                      Add to Highlights
                    </Button>
                    <Button size="xs" variant="outline" onClick={() => handleAddTimeline(candidate)}>
                      Add to Timeline
                    </Button>
                    <Button size="xs" variant="outline" onClick={() => handlePinCandidate(candidate)}>
                      Pin
                    </Button>
                    {candidate.postId ? (
                      <Button size="xs" variant="ghost" onClick={() => handleExcludeCandidate(candidate)}>
                        Exclude
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <span className={styles.statusMessage}>No suggested candidates for this period.</span>
          )}
        </div>
      </div>
      <div className={styles.column}>
        <div className={styles.columnHeader}>
          <h3>Published Snapshot</h3>
          <Badge variant="outline">Editable</Badge>
        </div>
        <div className={styles.fieldGroup}>
          <span className={styles.fieldLabel}>Summary</span>
          <textarea
            className={styles.textarea}
            value={draftContent.summary.text}
            onChange={(event) =>
              handleContentChange((content) => ({
                ...content,
                summary: { ...content.summary, text: event.target.value },
              }))
            }
          />
        </div>
        <EditableList
          label="Highlights"
          items={draftContent.highlights}
          onChange={(items) =>
            setDraftContent((prev) => ({
              ...prev,
              highlights: items,
            }))
          }
          onAdd={() => handleAddHighlight()}
        />
        <EditableTimeline
          items={draftContent.timeline}
          onChange={(items) =>
            setDraftContent((prev) => ({
              ...prev,
              timeline: items,
            }))
          }
          onAdd={() => handleAddTimeline()}
        />
        <EditableList
          label="Next Focus"
          items={draftContent.nextFocus}
          onChange={(items) =>
            setDraftContent((prev) => ({
              ...prev,
              nextFocus: items,
            }))
          }
          onAdd={handleAddNextFocus}
        />
        <div className={styles.fieldGroup}>
          <span className={styles.fieldLabel}>Editor Notes</span>
          <textarea className={styles.textarea} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </div>
        <div className={styles.columns}>
          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>Template</span>
            <Input
              list={templateListId}
              value={templateId}
              onChange={(event) => setTemplateId(event.target.value)}
              placeholder="Select a preset or type a custom id"
            />
            {templates.length ? (
              <datalist id={templateListId}>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.label ?? template.id}
                  </option>
                ))}
              </datalist>
            ) : null}
            {selectedTemplate ? (
              <span className={styles.statusMessage}>
                {selectedTemplate.description ?? "Template preset ready."}
              </span>
            ) : null}
          </div>
          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>Tone Recipe</span>
            <Input
              value={toneRecipeId}
              onChange={(event) => setToneRecipeId(event.target.value)}
              placeholder="Optional tone preset"
            />
          </div>
        </div>
        <div className={styles.fieldGroup}>
          <span className={styles.fieldLabel}>Publish Notes</span>
          <textarea
            className={styles.textarea}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="What changed in this revision?"
          />
        </div>
        <div className={styles.actionRow}>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Published Section"}
          </Button>
          <Button variant="outline" onClick={handleSaveSettings} disabled={settingsSaving}>
            {settingsSaving ? "Saving..." : "Save Settings"}
          </Button>
          <Button variant="outline" onClick={() => setDraftContent(cloneSectionContent(section.suggested))}>
            Reset to Suggested
          </Button>
        </div>
        <div className={styles.fieldGroup}>
          <span className={styles.fieldLabel}>Refine with AI</span>
          <div className={styles.listItem}>
            <textarea
              className={styles.textarea}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="Give the assistant guidance (e.g. emphasize community wins)."
            />
            <Button onClick={handleRefine} disabled={refining} variant="outline">
              {refining ? "Refining..." : "Generate Revision"}
            </Button>
          </div>
        </div>
        {status ? <span className={styles.statusMessage}>{status}</span> : null}
        <PinnedHighlights pins={section.pinned} onRemove={handleRemovePin} sources={sources} />
        <ExcludedPosts excluded={section.excludedPostIds} onRemove={handleRemoveExclusion} />
        <CoverageOverview coverage={section.coverage} />
        <VersionTimeline versions={section.versions} />
      </div>
    </div>
  );
}

function PromptMemoryEditor({
  capsuleId,
  promptMemory,
  templates,
  onRefresh,
}: {
  capsuleId: string;
  promptMemory: CapsuleHistoryPromptMemory;
  templates: CapsuleHistoryTemplatePreset[];
  onRefresh: (force?: boolean) => Promise<void>;
}) {
  const [tone, setTone] = React.useState(promptMemory.tone ?? "");
  const [guidelines, setGuidelines] = React.useState(
    promptMemory.guidelines.join("\n"),
  );
  const [mustInclude, setMustInclude] = React.useState(
    promptMemory.mustInclude.join("\n"),
  );
  const [autoLinkTopics, setAutoLinkTopics] = React.useState(
    promptMemory.autoLinkTopics.join("\n"),
  );
  const [templateDrafts, setTemplateDrafts] = React.useState<TemplateDraft[]>(
    () => templates.map(toTemplateDraft),
  );
  const [saving, setSaving] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);

  const resetState = React.useCallback(() => {
    setTone(promptMemory.tone ?? "");
    setGuidelines(promptMemory.guidelines.join("\n"));
    setMustInclude(promptMemory.mustInclude.join("\n"));
    setAutoLinkTopics(promptMemory.autoLinkTopics.join("\n"));
    setTemplateDrafts(templates.map(toTemplateDraft));
    setStatus(null);
  }, [promptMemory, templates]);

  React.useEffect(() => {
    resetState();
  }, [resetState]);

  const handleSave = React.useCallback(async () => {
    setSaving(true);
    setStatus(null);
    try {
      const hasEmptyTemplateId = templateDrafts.some(
        (template) => !template.id.trim(),
      );
      if (hasEmptyTemplateId) {
        setStatus("Template id is required for every preset.");
        return;
      }

      const response = await fetch(`/api/capsules/${capsuleId}/history/curate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_prompt",
          promptMemory: {
            guidelines: parseMultilineList(guidelines),
            tone: tone.trim() ? tone.trim() : null,
            mustInclude: parseMultilineList(mustInclude),
            autoLinkTopics: parseMultilineList(autoLinkTopics),
          },
          templates: templateDrafts.map(fromTemplateDraft),
        }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      await onRefresh(true);
      setStatus("Prompt settings updated.");
    } catch (error) {
      console.error("update_prompt", error);
      setStatus(error instanceof Error ? error.message : "Failed to update prompt settings");
    } finally {
      setSaving(false);
    }
  }, [autoLinkTopics, capsuleId, guidelines, mustInclude, onRefresh, templateDrafts, tone]);

  return (
    <>
      <div className={styles.columnHeader}>
        <h3>Prompt Memory & Templates</h3>
        <Badge variant="outline">Capsule Wide</Badge>
      </div>
      <div className={styles.fieldGroup}>
        <span className={styles.fieldLabel}>Tone Guidance</span>
        <Input
          value={tone}
          onChange={(event) => setTone(event.target.value)}
          placeholder="Example: upbeat, celebratory, keep it tight"
        />
      </div>
      <div className={styles.fieldGroup}>
        <span className={styles.fieldLabel}>Guidelines (one per line)</span>
        <textarea
          className={styles.textarea}
          value={guidelines}
          onChange={(event) => setGuidelines(event.target.value)}
          placeholder="Highlight major launches first&#10;Mention top contributors by name"
        />
      </div>
      <div className={styles.fieldGroup}>
        <span className={styles.fieldLabel}>Must Include Links</span>
        <textarea
          className={styles.textarea}
          value={mustInclude}
          onChange={(event) => setMustInclude(event.target.value)}
          placeholder="One per line (URLs or keywords)"
        />
      </div>
      <div className={styles.fieldGroup}>
        <span className={styles.fieldLabel}>Auto Link Topics</span>
        <textarea
          className={styles.textarea}
          value={autoLinkTopics}
          onChange={(event) => setAutoLinkTopics(event.target.value)}
          placeholder="Tournament, Roadmap, Launch"
        />
      </div>
      <div className={styles.fieldGroup}>
        <span className={styles.fieldLabel}>Template Presets</span>
        <TemplatesEditor templates={templateDrafts} onChange={setTemplateDrafts} />
      </div>
      <div className={styles.actionRow}>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Prompt Settings"}
        </Button>
        <Button variant="outline" onClick={resetState} disabled={saving}>
          Reset
        </Button>
      </div>
      {status ? <span className={styles.statusMessage}>{status}</span> : null}
    </>
  );
}

function TemplatesEditor({
  templates,
  onChange,
}: {
  templates: TemplateDraft[];
  onChange: (templates: TemplateDraft[]) => void;
}) {
  const handleTemplateChange = (
    index: number,
    field: keyof TemplateDraft,
    value: string,
  ) => {
    onChange(
      templates.map((template, idx) =>
        idx === index ? { ...template, [field]: value } : template,
      ),
    );
  };

  const handleRemove = (index: number) => {
    onChange(templates.filter((_, idx) => idx !== index));
  };

  const handleAdd = () => {
    onChange([
      ...templates,
      { id: "", label: "", description: "", tone: "" },
    ]);
  };

  return (
    <div className={styles.list}>
      {templates.length ? (
        templates.map((template, index) => (
          <div
            key={template.id || `template-${index}`}
            className={styles.listItem}
          >
            <div className={styles.listItemHeader}>
              <span>
                <Sparkle size={14} /> Template #{index + 1}
              </span>
              <div className={styles.listItemActions}>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => handleRemove(index)}
                >
                  <Trash size={14} />
                </Button>
              </div>
            </div>
            <Input
              value={template.id}
              onChange={(event) =>
                handleTemplateChange(index, "id", event.target.value)
              }
              placeholder="Identifier (e.g. community-recap)"
            />
            <Input
              value={template.label}
              onChange={(event) =>
                handleTemplateChange(index, "label", event.target.value)
              }
              placeholder="Label shown to editors"
            />
            <textarea
              className={styles.textarea}
              value={template.description}
              onChange={(event) =>
                handleTemplateChange(index, "description", event.target.value)
              }
              placeholder="Describe how this preset should read"
            />
            <Input
              value={template.tone}
              onChange={(event) =>
                handleTemplateChange(index, "tone", event.target.value)
              }
              placeholder="Tone hint (optional)"
            />
          </div>
        ))
      ) : (
        <span className={styles.statusMessage}>No templates defined yet.</span>
      )}
      <Button size="sm" variant="outline" onClick={handleAdd}>
        Add Template
      </Button>
    </div>
  );
}

function EditableList({
  label,
  items,
  onChange,
  onAdd,
}: {
  label: string;
  items: CapsuleHistoryContentBlock[];
  onChange: (items: CapsuleHistoryContentBlock[]) => void;
  onAdd: () => void;
}) {
  const handleChange = (index: number, value: string) => {
    onChange(items.map((item, idx) => (idx === index ? { ...item, text: value } : item)));
  };
  const handleRemove = (index: number) => {
    onChange(items.filter((_, idx) => idx !== index));
  };
  return (
    <div className={styles.fieldGroup}>
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.list}>
        {items.map((item, index) => (
          <div key={item.id} className={styles.listItem}>
            <div className={styles.listItemHeader}>
              <span>
                <PencilSimple size={14} /> {label.slice(0, -1)} #{index + 1}
              </span>
              <div className={styles.listItemActions}>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => handleRemove(index)}
                  disabled={items.length === 1}
                >
                  <Trash size={14} />
                </Button>
              </div>
            </div>
            <textarea
              className={styles.textarea}
              value={item.text}
              onChange={(event) => handleChange(index, event.target.value)}
            />
          </div>
        ))}
      </div>
      <Button size="sm" variant="outline" onClick={onAdd}>
        Add {label.slice(0, -1)}
      </Button>
    </div>
  );
}

function EditableTimeline({
  items,
  onChange,
  onAdd,
}: {
  items: CapsuleHistoryTimelineEntry[];
  onChange: (items: CapsuleHistoryTimelineEntry[]) => void;
  onAdd: () => void;
}) {
  const updateEntry = (index: number, patch: Partial<CapsuleHistoryTimelineEntry>) => {
    onChange(items.map((item, idx) => (idx === index ? { ...item, ...patch } : item)));
  };
  const removeEntry = (index: number) => {
    onChange(items.filter((_, idx) => idx !== index));
  };
  return (
    <div className={styles.fieldGroup}>
      <span className={styles.fieldLabel}>Timeline</span>
      <div className={styles.list}>
        {items.map((item, index) => (
          <div key={item.id} className={styles.listItem}>
            <div className={styles.listItemHeader}>
              <span>
                <Sparkle size={14} /> Entry #{index + 1}
              </span>
              <div className={styles.listItemActions}>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => removeEntry(index)}
                  disabled={items.length === 1}
                >
                  <Trash size={14} />
                </Button>
              </div>
            </div>
            <Input
              value={item.label}
              onChange={(event) => updateEntry(index, { label: event.target.value })}
              placeholder="Label"
            />
            <textarea
              className={styles.textarea}
              value={item.detail}
              onChange={(event) => updateEntry(index, { detail: event.target.value })}
              placeholder="Detail"
            />
            <div className={styles.columns}>
              <Input
                value={item.postId ?? ""}
                onChange={(event) => updateEntry(index, { postId: event.target.value || null })}
                placeholder="Related post ID (optional)"
              />
              <Input
                value={item.timestamp ?? ""}
                onChange={(event) => updateEntry(index, { timestamp: event.target.value || null })}
                placeholder="Timestamp"
              />
            </div>
          </div>
        ))}
      </div>
      <Button size="sm" variant="outline" onClick={onAdd}>
        Add Timeline Entry
      </Button>
    </div>
  );
}

function PinnedHighlights({
  pins,
  onRemove,
  sources,
}: {
  pins: CapsuleHistoryPinnedItem[];
  onRemove: (pin: CapsuleHistoryPinnedItem) => void;
  sources: CapsuleHistorySnapshot["sources"];
}) {
  if (!pins.length) {
    return null;
  }
  return (
    <div className={styles.fieldGroup}>
      <span className={styles.fieldLabel}>Pinned Items</span>
      <div className={styles.list}>
        {pins.map((pin) => {
          const source = pin.sourceId ? sources[pin.sourceId] : null;
          return (
            <div key={pin.id} className={styles.listItemHeader}>
              <span>
                {pin.type.toUpperCase()} {pin.postId ? `| ${pin.postId}` : ""}
              </span>
              <div className={styles.listItemActions}>
                <Button size="xs" variant="ghost" onClick={() => onRemove(pin)}>
                  <Trash size={14} />
                </Button>
              </div>
              {pin.quote ? <div>{pin.quote}</div> : null}
              {source?.label ? <span className={styles.statusMessage}>{source.label}</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExcludedPosts({
  excluded,
  onRemove,
}: {
  excluded: string[];
  onRemove: (postId: string) => void;
}) {
  if (!excluded.length) return null;
  return (
    <div className={styles.fieldGroup}>
      <span className={styles.fieldLabel}>Excluded Posts</span>
      <div className={styles.list}>
        {excluded.map((postId) => (
          <div key={postId} className={styles.listItemHeader}>
            <span>{postId}</span>
            <Button size="xs" variant="ghost" onClick={() => onRemove(postId)}>
              <Trash size={14} />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function CoverageOverview({ coverage }: { coverage: CapsuleHistoryCoverage }) {
  return (
    <div className={styles.fieldGroup}>
      <span className={styles.fieldLabel}>Coverage</span>
      <div className={styles.coverageGrid}>
        <CoverageCard title="Authors" items={coverage.authors} />
        <CoverageCard title="Themes" items={coverage.themes} />
        <CoverageCard title="Time Spans" items={coverage.timeSpans} />
      </div>
      <span className={styles.statusMessage}>
        Completeness: {(coverage.completeness * 100).toFixed(0)}%
      </span>
    </div>
  );
}

function CoverageCard({
  title,
  items,
}: {
  title: string;
  items: CapsuleHistoryCoverageMetric[];
}) {
  if (!items.length) {
    return (
      <div className={styles.coverageCard}>
        <strong>{title}</strong>
        <span className={styles.statusMessage}>No data tracked yet.</span>
      </div>
    );
  }
  return (
    <div className={styles.coverageCard}>
      <strong>{title}</strong>
      {items.map((item) => (
        <div key={item.id} className={styles.statusMessage}>
          {item.covered ? "[x]" : "[ ]"} {item.label} ({item.weight})
        </div>
      ))}
    </div>
  );
}

function VersionTimeline({
  versions,
}: {
  versions: CapsuleHistorySection["versions"];
}) {
  if (!versions.length) return null;
  return (
    <div className={styles.fieldGroup}>
      <span className={styles.fieldLabel}>Revision History</span>
      <div className={styles.versionsList}>
        {versions.map((version) => (
          <div key={version.id} className={styles.listItemHeader}>
            <span>
              <CaretRight size={14} /> {version.changeType}
            </span>
            <span className={styles.statusMessage}>
              {version.createdAt ? new Date(version.createdAt).toLocaleString() : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryReadOnly({ content }: { content: CapsuleHistorySectionContent }) {
  return (
    <div className={styles.list}>
      <div className={styles.listItem}>
        <strong>Summary</strong>
        <p>{content.summary.text}</p>
      </div>
      <div className={styles.listItem}>
        <strong>Highlights</strong>
        <ul>
          {content.highlights.map((highlight) => (
            <li key={highlight.id}>{highlight.text}</li>
          ))}
        </ul>
      </div>
      <div className={styles.listItem}>
        <strong>Timeline</strong>
        <ul>
          {content.timeline.map((entry) => (
            <li key={entry.id}>
              <span className={styles.statusMessage}>{entry.label}</span>
              <div>{entry.detail}</div>
            </li>
          ))}
        </ul>
      </div>
      <div className={styles.listItem}>
        <strong>Next Focus</strong>
        <ul>
          {content.nextFocus.map((entry) => (
            <li key={entry.id}>{entry.text}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default CapsuleHistoryCuration;


