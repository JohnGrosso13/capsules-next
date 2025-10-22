/**
 * Shared helpers for constructing image prompts that keep the user request
 * front-and-center while optionally layering reusable style cues.
 */

export type PromptCueKind = "composition" | "lighting" | "palette" | "medium" | "mood" | "texture";

export type PromptCueMap = Partial<Record<PromptCueKind, string[]>>;

export interface StyleModifier {
  id: string;
  label: string;
  description: string;
  aliases?: string[];
  enrich?: Partial<Record<PromptCueKind, string[]>>;
  override?: Partial<Record<PromptCueKind, string[]>>;
  suppress?: PromptCueKind[];
  addConstraints?: string[];
  removeConstraints?: string[];
  notes?: string[];
}

const STYLE_MODIFIERS = {
  "capsule-default": {
    id: "capsule-default",
    label: "Capsule Default",
    description: "Balanced, product-friendly palette with gentle lighting and approachable mood.",
    enrich: {
      palette: ["Favor clean, modern hues with gentle contrast."],
      lighting: ["Keep lighting soft and flattering without harsh shadows."],
      mood: ["Friendly and welcoming atmosphere that fits the Capsule product."],
    },
  },
  "vibrant-future": {
    id: "vibrant-future",
    label: "Vibrant Future",
    description: "Bold neon accents, energetic lighting, optimistic futurist energy.",
    aliases: ["neon", "vivid"],
    enrich: {
      palette: ["Use saturated, high-contrast colors with luminous highlights."],
      lighting: ["Introduce energetic rim lights and crisp reflections."],
      mood: ["Confident, forward-looking energy with a touch of futurism."],
    },
  },
  "soft-pastel": {
    id: "soft-pastel",
    label: "Soft Pastel",
    description: "Airy pastel palette, diffused light, calm and approachable feel.",
    aliases: ["pastel", "soft"],
    enrich: {
      palette: ["Favor gentle pastels with plenty of breathable white space."],
      lighting: ["Diffuse, cloud-soft lighting with minimal shadows."],
      mood: ["Calm, soothing, and inclusive tone."],
    },
  },
  "noir-spotlight": {
    id: "noir-spotlight",
    label: "Noir Spotlight",
    description: "High-contrast monochrome with dramatic lighting and cinematic mood.",
    aliases: ["noir", "dramatic"],
    enrich: {
      palette: ["Primarily monochrome with a single accent color for focus."],
      lighting: ["Sharp key light with deep, moody shadows and subtle grain."],
      mood: ["Mysterious, cinematic atmosphere with confident posture."],
    },
    addConstraints: ["Keep backgrounds minimal so the spotlight effect remains clear."],
  },
  "minimal-matte": {
    id: "minimal-matte",
    label: "Minimal Matte",
    description: "Muted colors, matte finish, emphasise negative space and restraint.",
    aliases: ["minimal", "matte"],
    suppress: ["palette", "mood"],
    enrich: {
      composition: ["Lean into simple shapes, generous negative space, and clean silhouettes."],
      medium: ["Matte, softly textured surfaces rather than glossy highlights."],
    },
    addConstraints: ["Avoid adding ornamental flourishes or complex patterns."],
  },
} satisfies Record<string, StyleModifier>;

export type StyleModifierId = keyof typeof STYLE_MODIFIERS;

export const STYLE_MODIFIER_CATALOG = Object.freeze(Object.values(STYLE_MODIFIERS));

const CUE_DISPLAY_ORDER: PromptCueKind[] = [
  "composition",
  "lighting",
  "palette",
  "medium",
  "mood",
  "texture",
];

const CUE_LABELS: Record<PromptCueKind, string> = {
  composition: "Composition",
  lighting: "Lighting",
  palette: "Palette",
  medium: "Medium",
  mood: "Mood",
  texture: "Texture",
};

const WHITESPACE_REGEX = /\s+/g;

function normalizeLine(line: string): string {
  return line.replace(WHITESPACE_REGEX, " ").trim();
}

function cloneCueMap(source: PromptCueMap): PromptCueMap {
  const clone: PromptCueMap = {};
  for (const key of Object.keys(source) as PromptCueKind[]) {
    const lines = source[key];
    if (!lines || !lines.length) continue;
    clone[key] = lines.map(normalizeLine).filter(Boolean);
  }
  return clone;
}

function dedupeLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const raw of lines) {
    const line = normalizeLine(raw);
    if (!line || seen.has(line)) continue;
    seen.add(line);
    deduped.push(line);
  }
  return deduped;
}

function applyModifier(
  baseCues: PromptCueMap,
  baseConstraints: string[],
  modifier: StyleModifier | null,
): { cues: PromptCueMap; constraints: string[] } {
  const cues = cloneCueMap(baseCues);
  let constraints = dedupeLines(baseConstraints);

  if (!modifier) {
    return { cues, constraints };
  }

  if (modifier.suppress?.length) {
    for (const key of modifier.suppress) {
      delete cues[key];
    }
  }

  if (modifier.override) {
    for (const entry of Object.entries(modifier.override)) {
      const cueKey = entry[0] as PromptCueKind;
      const lines = entry[1];
      if (!lines || !lines.length) {
        delete cues[cueKey];
        continue;
      }
      cues[cueKey] = dedupeLines(lines);
    }
  }

  if (modifier.enrich) {
    for (const entry of Object.entries(modifier.enrich)) {
      const cueKey = entry[0] as PromptCueKind;
      const additions = entry[1];
      if (!additions || !additions.length) continue;
      const existing = cues[cueKey] ?? [];
      cues[cueKey] = dedupeLines(existing.concat(additions));
    }
  }

  if (modifier.removeConstraints?.length) {
    const removals = new Set(modifier.removeConstraints.map(normalizeLine));
    constraints = constraints.filter((line) => !removals.has(normalizeLine(line)));
  }

  if (modifier.addConstraints?.length) {
    constraints = dedupeLines(constraints.concat(modifier.addConstraints));
  }

  return { cues, constraints };
}

function presentCues(cues: PromptCueMap): string[] {
  const lines: string[] = [];

  for (const key of CUE_DISPLAY_ORDER) {
    const cueLines = cues[key];
    if (!cueLines || !cueLines.length) continue;
    lines.push(`- ${CUE_LABELS[key]}: ${cueLines.join(" ")}`);
  }

  return lines;
}

function presentConstraints(constraints: string[]): string[] {
  if (!constraints.length) return [];
  return constraints.map((line) => `- ${line}`);
}

export interface ComposeUserLedPromptOptions {
  userPrompt: string;
  objective: string;
  subjectContext?: string;
  baseCues: PromptCueMap;
  baseConstraints?: string[];
  styleId?: string | null;
  style?: StyleModifier | null;
}

export function resolveStyleModifier(rawId?: string | null): StyleModifier | null {
  if (!rawId) return null;
  const normalized = rawId.trim().toLowerCase();
  if (!normalized) return null;

  if (normalized in STYLE_MODIFIERS) {
    return STYLE_MODIFIERS[normalized as StyleModifierId];
  }

  for (const modifier of STYLE_MODIFIER_CATALOG) {
    if (modifier.id === normalized) return modifier;
    const aliases = (modifier as { aliases?: string[] }).aliases;
    if (Array.isArray(aliases) && aliases.some((alias) => alias.toLowerCase() === normalized)) {
      return modifier;
    }
  }

  return null;
}

export function composeUserLedPrompt(options: ComposeUserLedPromptOptions): string {
  const {
    userPrompt,
    objective,
    subjectContext,
    baseCues,
    baseConstraints = [],
    style,
    styleId,
  } = options;

  const trimmedPrompt = normalizeLine(userPrompt);
  const trimmedObjective = normalizeLine(objective);
  const trimmedSubject = subjectContext ? normalizeLine(subjectContext) : "";

  const selectedStyle = style ?? resolveStyleModifier(styleId);
  const { cues, constraints } = applyModifier(baseCues, baseConstraints, selectedStyle);

  const sections: string[] = [];

  sections.push(`User prompt: ${trimmedPrompt}`);
  sections.push(`Primary objective: ${trimmedObjective}`);

  if (trimmedSubject) {
    sections.push(`Subject context: ${trimmedSubject}`);
  }

  sections.push("Always prioritize the user prompt; use the cues below only when they enhance it.");

  const cueLines = presentCues(cues);
  if (cueLines.length) {
    sections.push(["Optional cues:", ...cueLines].join("\n"));
  }

  const constraintLines = presentConstraints(constraints);
  if (constraintLines.length) {
    sections.push(["Core constraints:", ...constraintLines].join("\n"));
  }

  if (selectedStyle) {
    const modifierSummary = `Style focus (${selectedStyle.label}): ${normalizeLine(
      selectedStyle.description,
    )}`;
    if (selectedStyle.notes?.length) {
      sections.push(
        [modifierSummary]
          .concat(selectedStyle.notes.map((note) => `- ${normalizeLine(note)}`))
          .join("\n"),
      );
    } else {
      sections.push(modifierSummary);
    }
  }

  return sections.join("\n\n");
}
