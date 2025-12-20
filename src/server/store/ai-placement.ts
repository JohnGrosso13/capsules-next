import "server-only";

import { callOpenAIChat, extractJSON, type JsonSchema } from "@/lib/ai/prompter";
import { getCapsuleSummaryForViewer } from "@/server/capsules/service";
import { resolvePlacement, resolveTemplateSurfaces } from "@/components/create/products/placement";
import {
  clampPlacementOffset,
  clampPlacementScale,
  defaultPlacementPlan,
  type PlacementPlan,
  type PlacementSurfaceId,
} from "@/components/create/products/placement-types";
import { findTemplateById } from "@/components/create/products/templates";

type PlacementInferenceRequest = {
  capsuleId: string;
  actorId: string;
  templateId: string;
  text: string;
  currentPlan?: Partial<PlacementPlan> | null;
};

type PlacementInferenceResult = {
  plan: PlacementPlan;
  summary: string;
  surfaceLabel: string;
  message: string;
  warnings: string[];
};

const PLACEMENT_SCHEMA: JsonSchema = {
  name: "placement_plan",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      surface: { type: "string", minLength: 3, maxLength: 32 },
      scale: { type: "number", minimum: 0.4, maximum: 1.4 },
      offsetX: { type: "number", minimum: -1, maximum: 1 },
      offsetY: { type: "number", minimum: -1, maximum: 1 },
      fit: { type: "string", enum: ["standard", "cover", "contain"] },
      message: { type: "string" },
      warnings: { type: "array", items: { type: "string" } },
    },
    required: ["surface", "scale", "offsetX", "offsetY"],
  },
};

function normalizePlan(plan: Partial<PlacementPlan> | null | undefined): PlacementPlan {
  return {
    surface: (plan?.surface as PlacementPlan["surface"]) ?? "front",
    scale: clampPlacementScale(plan?.scale ?? 0.75, 0.75),
    offsetX: clampPlacementOffset(plan?.offsetX ?? 0),
    offsetY: clampPlacementOffset(plan?.offsetY ?? 0),
    fit: plan?.fit ?? "standard",
    prompt: plan?.prompt ?? null,
    summary: plan?.summary ?? null,
    source: "ai",
  };
}

export async function inferProductPlacement(
  params: PlacementInferenceRequest,
): Promise<PlacementInferenceResult> {
  const template = findTemplateById(params.templateId);
  if (!template) {
    throw new Error("Unknown product template");
  }
  const surfaces = resolveTemplateSurfaces(template);
  const capsule = await getCapsuleSummaryForViewer(params.capsuleId, params.actorId);
  const capsuleName = capsule?.name ?? "Capsule store";

  const basePlan = normalizePlan(
    (params.currentPlan ?? defaultPlacementPlan(surfaces[0]?.id ?? "front")) as Partial<PlacementPlan>,
  );
  const currentPlacement = resolvePlacement(template, basePlan);

  const systemMessage = {
    role: "system" as const,
    content:
      "You are an assistant turning casual placement requests into precise mockup coordinates for merch. Pick the best surface from the provided list, decide a sensible size, and nudge the design using normalized offsets (-1..1 from center). Use larger scale and fit=cover for full-bleed or wrap requests. Stay within allowed surfaces and keep tone concise.",
  };

  const surfaceLines = surfaces.map(
    (surface) =>
      `- ${surface.label} (${surface.id}) — print area ${Math.round(surface.printArea.width * 100)}% wide, ${Math.round(surface.printArea.height * 100)}% tall.`,
  );

  const sizeGuidance = [
    "Size hints: pocket/crest/sleeve small => scale ~0.5-0.6.",
    "Normal centered front/back => scale ~0.72-0.82.",
    "Large or front-and-center => scale ~0.9.",
    "Full-bleed/wrap/all-over => scale 1.05-1.2 and fit=cover.",
  ];

  const offsetGuidance = [
    "Offsets use -1..1 relative to center. Negative Y moves up; positive Y moves down. Negative X moves left; positive X moves right.",
    "Examples: top center => offsetY -0.6; bottom => +0.6; left sleeve near cuff => surface sleeve_left with offsetY +0.5 and small scale.",
  ];

  const userMessage = {
    role: "user" as const,
    content: [
      `Capsule: ${capsuleName}`,
      `Template: ${template.label} (${template.categoryLabel}${template.base ? `, ${template.base}` : ""})`,
      "Available surfaces:",
      ...surfaceLines,
      "",
      "Current placement:",
      `- Surface: ${currentPlacement.surface.label}`,
      `- Scale: ${currentPlacement.plan.scale.toFixed(2)}`,
      `- Offset: x ${currentPlacement.plan.offsetX.toFixed(2)}, y ${currentPlacement.plan.offsetY.toFixed(2)}`,
      "",
      "User request:",
      params.text,
      "",
      ...sizeGuidance,
      ...offsetGuidance,
      "",
      "Respond ONLY with JSON matching the placement_plan schema.",
    ].join("\n"),
  };

  const { content } = await callOpenAIChat([systemMessage, userMessage], PLACEMENT_SCHEMA, {
    temperature: 0.25,
    timeoutMs: 45_000,
  });

  const parsed =
    extractJSON<Record<string, unknown>>(content) ??
    (JSON.parse(content) as Record<string, unknown>);

  const desiredSurface = typeof parsed.surface === "string" ? parsed.surface : currentPlacement.surface.id;
  const surfaceId =
    surfaces.find((entry) => entry.id === desiredSurface)?.id ??
    surfaces.find((entry) => entry.id === currentPlacement.surface.id)?.id ??
    surfaces[0]?.id ??
    "front";

  const fitValue: PlacementPlan["fit"] =
    typeof parsed.fit === "string"
      ? (parsed.fit as PlacementPlan["fit"])
      : currentPlacement.plan.fit;

  const planInput: Partial<PlacementPlan> = {
    surface: surfaceId as PlacementSurfaceId,
    scale: typeof parsed.scale === "number" ? parsed.scale : currentPlacement.plan.scale,
    offsetX: typeof parsed.offsetX === "number" ? parsed.offsetX : currentPlacement.plan.offsetX,
    offsetY: typeof parsed.offsetY === "number" ? parsed.offsetY : currentPlacement.plan.offsetY,
    source: "ai",
  };
  if (fitValue) {
    planInput.fit = fitValue;
  }

  const plan = normalizePlan(planInput);

  const resolved = resolvePlacement(template, plan);
  const warnings = Array.isArray(parsed.warnings)
    ? parsed.warnings.filter((value) => typeof value === "string" && value.trim().length)
    : [];

  const message =
    typeof parsed.message === "string" && parsed.message.trim().length
      ? parsed.message.trim()
      : `Placed it on the ${resolved.surface.label.toLowerCase()} (${resolved.summary.text}).`;

  return {
    plan: resolved.plan,
    summary: resolved.summary.text,
    surfaceLabel: resolved.surface.label,
    message,
    warnings,
  };
}
