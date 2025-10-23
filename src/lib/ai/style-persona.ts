import type { PromptCueMap } from "./prompt-styles";

export type StylePersonaPromptData = {
  palette?: string | null;
  medium?: string | null;
  camera?: string | null;
  notes?: string | null;
};

function appendCue(
  target: PromptCueMap,
  key: keyof PromptCueMap,
  value: string | null | undefined,
): void {
  if (!value) return;
  const trimmed = value.trim();
  if (!trimmed) return;
  target[key] = [...(target[key] ?? []), trimmed];
}

export function mergePersonaCues(
  base: PromptCueMap,
  persona: StylePersonaPromptData | null,
): PromptCueMap {
  if (!persona) return base;
  const merged: PromptCueMap = { ...base };
  appendCue(merged, "palette", persona.palette);
  appendCue(merged, "medium", persona.medium);
  appendCue(merged, "composition", persona.camera);
  appendCue(merged, "mood", persona.notes);
  return merged;
}
