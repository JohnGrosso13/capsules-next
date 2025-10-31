"use client";

import * as React from "react";
import { Sparkle, Trash } from "@phosphor-icons/react/dist/ssr";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  CapsuleHistoryPromptMemory,
  CapsuleHistoryTemplatePreset,
} from "@/types/capsules";

import styles from "./CapsuleHistoryCuration.module.css";

type CapsuleHistoryPromptSettingsProps = {
  capsuleId: string;
  promptMemory: CapsuleHistoryPromptMemory;
  templates: CapsuleHistoryTemplatePreset[];
  onRefresh: (force?: boolean) => Promise<void>;
};

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

export function CapsuleHistoryPromptSettings({
  capsuleId,
  promptMemory,
  templates,
  onRefresh,
}: CapsuleHistoryPromptSettingsProps) {
  const [tone, setTone] = React.useState(promptMemory.tone ?? "");
  const [guidelines, setGuidelines] = React.useState(promptMemory.guidelines.join("\n"));
  const [mustInclude, setMustInclude] = React.useState(promptMemory.mustInclude.join("\n"));
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
      const hasEmptyTemplateId = templateDrafts.some((template) => !template.id.trim());
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
    <div className={styles.column}>
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
    </div>
  );
}

function TemplatesEditor({
  templates,
  onChange,
}: {
  templates: TemplateDraft[];
  onChange: (templates: TemplateDraft[]) => void;
}) {
  const handleTemplateChange = (index: number, field: keyof TemplateDraft, value: string) => {
    onChange(
      templates.map((template, idx) => (idx === index ? { ...template, [field]: value } : template)),
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
          <div key={template.id || `template-${index}`} className={styles.listItem}>
            <div className={styles.listItemHeader}>
              <span>
                <Sparkle size={14} /> Template #{index + 1}
              </span>
              <div className={styles.listItemActions}>
                <Button size="xs" variant="ghost" onClick={() => handleRemove(index)}>
                  <Trash size={14} />
                </Button>
              </div>
            </div>
            <Input
              value={template.id}
              onChange={(event) => handleTemplateChange(index, "id", event.target.value)}
              placeholder="Identifier (e.g. community-recap)"
            />
            <Input
              value={template.label}
              onChange={(event) => handleTemplateChange(index, "label", event.target.value)}
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
              onChange={(event) => handleTemplateChange(index, "tone", event.target.value)}
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

export default CapsuleHistoryPromptSettings;
