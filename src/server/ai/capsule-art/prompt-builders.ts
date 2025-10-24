"use strict";

import {
  deriveStyleSummary,
  getDefaultCapsuleStyleSelection,
  resolveCapsuleStyleInstructions,
  sanitizeCapsuleStyleSelection,
  type CapsuleArtAssetType,
  type CapsuleStyleSelection,
  type CapsuleStyleSelectionInput,
} from "@/shared/capsule-style";

type PromptBuilderInput = {
  userPrompt: string;
  asset: CapsuleArtAssetType;
  subjectName?: string | null;
  style?: CapsuleStyleSelectionInput;
};

export type CapsulePromptBuildResult = {
  prompt: string;
  style: CapsuleStyleSelection;
  styleInstructions: string[];
};

const assetDescriptors: Record<CapsuleArtAssetType, { noun: string; summary: string }> = {
  banner: { noun: "capsule hero banner", summary: "16:9 hero banner" },
  storeBanner: { noun: "capsule store banner", summary: "5:2 storefront banner" },
  tile: { noun: "capsule promo tile", summary: "9:16 promo tile" },
  logo: { noun: "capsule logo", summary: "square logo mark" },
  avatar: { noun: "profile avatar", summary: "circular avatar" },
};

function formatSubjectName(name?: string | null): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed.length) return null;
  return trimmed.length > 160 ? `${trimmed.slice(0, 157)}...` : trimmed;
}

function getFoundationGuardrails(asset: CapsuleArtAssetType, subject: string | null): string[] {
  switch (asset) {
    case "banner":
      return [
        "Frame for a 16:9 hero layout with safe margins for UI elements.",
        "Maintain one clear focal subject with layered depth.",
        "Avoid embedded text, logos, or watermarks.",
        subject ? `Let the scene reflect the energy of "${subject}" without literal typography.` : null,
      ].filter((value): value is string => Boolean(value));
    case "storeBanner":
      return [
        "Compose in a panoramic 5:2 layout suitable for storefront shelves.",
        "Balance hero product or scene moments across the width with breathing room.",
        "Avoid embedded text or logos; rely on imagery and lighting.",
        subject ? `Echo the merchandising vibe of "${subject}" without literal labels.` : null,
      ].filter((value): value is string => Boolean(value));
    case "tile":
      return [
        "Design for a vertical 9:16 format with safe space at the top and bottom.",
        "Center a bold focal element that reads when cropped for feed tiles.",
        "Do not add baked-in text, watermarks, or QR codes.",
        subject ? `Ensure the tile feels instantly recognizable for "${subject}".` : null,
      ].filter((value): value is string => Boolean(value));
    case "logo":
      return [
        "Deliver a clean square mark that stays crisp at 64×64 pixels.",
        "Use vector-friendly shapes with strong silhouettes and limited layering.",
        "Replace long words with initials or symbolic forms; no slogans or detailed typography.",
        subject ? `Capture the personality of "${subject}" without literal phrasing.` : null,
      ].filter((value): value is string => Boolean(value));
    case "avatar":
      return [
        "Compose for a circular crop with the subject centered and framed confidently.",
        "Keep lighting flattering with soft falloff and subtle background separation.",
        "Avoid embedded text, logos, or busy borders so it reads clearly at small sizes.",
        subject ? `Let the portrait feel welcoming for "${subject}".` : null,
      ].filter((value): value is string => Boolean(value));
    default:
      return [];
  }
}

function buildPromptSections(sections: Array<string | null | undefined>): string {
  return sections
    .map((section) => section?.trim())
    .filter((section): section is string => Boolean(section) && section.length > 0)
    .join("\n\n");
}

function buildUserConceptSection(userPrompt: string): string {
  const trimmed = userPrompt.trim();
  if (!trimmed.length) {
    return "User concept: Follow their intent exactly, even if brief.";
  }
  return `User concept (verbatim):\n${trimmed}`;
}

function buildStyleSection(styleLines: string[]): string | null {
  if (!styleLines.length) return null;
  const bullets = styleLines.map((line) => `- ${line}`).join("\n");
  return `Optional style cues:\n${bullets}`;
}

export function buildCapsuleArtGenerationPrompt(
  input: PromptBuilderInput,
): CapsulePromptBuildResult {
  const subject = formatSubjectName(input.subjectName);
  const sanitizedStyle = sanitizeCapsuleStyleSelection(input.asset, input.style);
  const styleInstructions = resolveCapsuleStyleInstructions(input.asset, sanitizedStyle);
  const descriptor = assetDescriptors[input.asset];

  const sections: string[] = [];
  sections.push(buildUserConceptSection(input.userPrompt));

  const contextLine = subject
    ? `Context: The ${descriptor.summary} supports the capsule "${subject}".`
    : `Context: Produce a ${descriptor.summary} that performs well in production UI.`;
  sections.push(contextLine);

  const guardrails = getFoundationGuardrails(input.asset, subject);
  if (guardrails.length) {
    sections.push(
      `Output guardrails:\n${guardrails.map((line) => `- ${line}`).join("\n")}`,
    );
  }

  const styleSection = buildStyleSection(styleInstructions);
  if (styleSection) {
    sections.push(styleSection);
  }

  sections.push(
    [
      "Respect inclusivity and safety. Produce original work—no copyrighted characters or real-world logos.",
      `Deliver one polished ${descriptor.noun} ready for Capsule surfaces.`,
    ].join(" "),
  );

  return {
    prompt: buildPromptSections(sections),
    style: sanitizedStyle,
    styleInstructions,
  };
}

export function buildCapsuleArtEditInstruction(
  input: PromptBuilderInput,
): CapsulePromptBuildResult {
  const subject = formatSubjectName(input.subjectName);
  const sanitizedStyle = sanitizeCapsuleStyleSelection(input.asset, input.style);
  const styleInstructions = resolveCapsuleStyleInstructions(input.asset, sanitizedStyle);
  const descriptor = assetDescriptors[input.asset];

  const sections: string[] = [];
  sections.push("Enhance the existing asset with the edits below while preserving its strengths.");
  sections.push(buildUserConceptSection(input.userPrompt));

  const guardrails = getFoundationGuardrails(input.asset, subject);
  if (guardrails.length) {
    sections.push(
      `Edit guardrails:\n${guardrails.map((line) => `- ${line}`).join("\n")}`,
    );
  }

  const styleSection = buildStyleSection(styleInstructions);
  if (styleSection) {
    sections.push(styleSection);
  }

  sections.push(
    `Keep proportions consistent, avoid artifacts, and match the previous exposure unless directed otherwise. Deliver an updated ${descriptor.noun}.`,
  );

  return {
    prompt: buildPromptSections(sections),
    style: sanitizedStyle,
    styleInstructions,
  };
}

export function getDefaultCapsuleArtStyle(asset: CapsuleArtAssetType): CapsuleStyleSelection {
  return getDefaultCapsuleStyleSelection(asset);
}

export function sanitizeCapsuleArtStyle(
  asset: CapsuleArtAssetType,
  incoming: CapsuleStyleSelectionInput | null | undefined,
): CapsuleStyleSelection {
  return sanitizeCapsuleStyleSelection(asset, incoming);
}

export function deriveStyleDebugSummary(selection: CapsuleStyleSelection): string | null {
  return deriveStyleSummary(selection);
}
