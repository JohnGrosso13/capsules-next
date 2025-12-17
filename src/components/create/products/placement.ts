import {
  PLACEMENT_OFFSET_FACTOR,
  PLACEMENT_OFFSET_RANGE,
  clampPlacementOffset,
  clampPlacementScale,
  defaultPlacementPlan,
  type PlacementPlan,
  type PlacementPrintArea,
  type PlacementSurfaceConfig,
  type PlacementSurfaceId,
  type ResolvedPlacement,
  type PrintfulPosition,
  type PlacementSummary,
} from "./placement-types";
import type { ProductTemplate } from "./templates";

const PRINTFUL_AREA_WIDTH = 1800;
const PRINTFUL_AREA_HEIGHT = 2400;

function ensureSurface(
  surfaces: PlacementSurfaceConfig[],
  desired?: PlacementSurfaceId | null,
): PlacementSurfaceConfig {
  if (!surfaces.length) {
    return {
      id: "front",
      label: "Front",
      printArea: { x: 0.2, y: 0.2, width: 0.6, height: 0.5 },
      printfulPlacement: "front",
    };
  }
  if (desired) {
    const match = surfaces.find((surface) => surface.id === desired);
    if (match) return match;
  }
  return surfaces[0]!;
}

function normalizePrintArea(area?: Partial<PlacementPrintArea> | null): PlacementPrintArea {
  return {
    x: typeof area?.x === "number" ? area.x : 0.2,
    y: typeof area?.y === "number" ? area.y : 0.2,
    width: typeof area?.width === "number" ? area.width : 0.6,
    height: typeof area?.height === "number" ? area.height : 0.5,
  };
}

export function resolveTemplateSurfaces(template: ProductTemplate): PlacementSurfaceConfig[] {
  const placements = template.mockup?.placements;
  if (placements?.length) {
    return placements.map((entry) => ({
      ...entry,
      printArea: normalizePrintArea(entry.printArea),
      printfulPlacement: entry.printfulPlacement ?? template.mockup?.printful?.placement ?? null,
      defaultScale: clampPlacementScale(entry.defaultScale ?? 0.75, 0.75),
    }));
  }

  const baseArea = normalizePrintArea(template.mockup?.printArea);
  return [
    {
      id: "front",
      label: "Front",
      printArea: baseArea,
      printfulPlacement: template.mockup?.printful?.placement ?? "front",
      defaultScale: clampPlacementScale(0.75, 0.75),
    },
  ];
}

export function normalizePlacementPlan(
  plan: PlacementPlan | null | undefined,
  surfaces: PlacementSurfaceConfig[],
): PlacementPlan {
  const surfaceConfig = ensureSurface(surfaces, plan?.surface);
  const surface = surfaceConfig.id;
  const fallbackScale = surfaceConfig.defaultScale ?? 0.75;
  return {
    surface,
    scale: clampPlacementScale(plan?.scale ?? fallbackScale, fallbackScale),
    offsetX: clampPlacementOffset(plan?.offsetX ?? 0),
    offsetY: clampPlacementOffset(plan?.offsetY ?? 0),
    fit: plan?.fit ?? "standard",
    prompt: plan?.prompt ?? null,
    summary: plan?.summary ?? null,
    source: plan?.source ?? "user",
  };
}

function resolvePrintfulPosition(plan: PlacementPlan, area?: PlacementPrintArea): PrintfulPosition {
  const areaWidth = Math.max(1, Math.round(PRINTFUL_AREA_WIDTH * (area?.width ?? 1)));
  const areaHeight = Math.max(1, Math.round(PRINTFUL_AREA_HEIGHT * (area?.height ?? 1)));
  const scale = clampPlacementScale(plan.scale, 0.75);
  const fitBoost = plan.fit === "cover" ? 1.08 : 1;
  const width = Math.round(areaWidth * scale * fitBoost);
  const height = Math.round(areaHeight * scale * fitBoost);

  const centerLeft = (areaWidth - width) / 2;
  const centerTop = (areaHeight - height) / 2;
  const maxShiftX = areaWidth * (PLACEMENT_OFFSET_FACTOR / 100);
  const maxShiftY = areaHeight * (PLACEMENT_OFFSET_FACTOR / 100);

  const left = Math.round(
    Math.min(
      Math.max(centerLeft + plan.offsetX * maxShiftX, 0),
      Math.max(areaWidth - width, 0),
    ),
  );
  const top = Math.round(
    Math.min(
      Math.max(centerTop + plan.offsetY * maxShiftY, 0),
      Math.max(areaHeight - height, 0),
    ),
  );

  return {
    areaWidth,
    areaHeight,
    width,
    height,
    top,
    left,
  };
}

function summarizePlan(plan: PlacementPlan, surface: PlacementSurfaceConfig): PlacementSummary {
  const positionWords: string[] = [];
  if (plan.offsetY <= -0.5) positionWords.push("toward top");
  else if (plan.offsetY >= 0.5) positionWords.push("toward bottom");

  if (plan.offsetX <= -0.5) positionWords.push("left");
  else if (plan.offsetX >= 0.5) positionWords.push("right");

  if (!positionWords.length) positionWords.push("centered");

  const sizeLabel =
    plan.fit === "cover"
      ? "full-bleed"
      : plan.scale >= 1.05
      ? "full-bleed"
      : plan.scale >= 0.9
        ? "large"
        : plan.scale >= 0.7
          ? "medium"
          : plan.scale >= 0.5
            ? "small"
            : "very small";

  return {
    text: `${surface.label}: ${sizeLabel}, ${positionWords.join(" ")}`,
    surfaceLabel: surface.label,
    warnings: [],
  };
}

export function resolvePlacement(
  template: ProductTemplate,
  planInput?: PlacementPlan | null,
): ResolvedPlacement {
  const surfaces = resolveTemplateSurfaces(template);
  const normalizedPlan = normalizePlacementPlan(planInput ?? defaultPlacementPlan(surfaces[0]?.id), surfaces);
  const surface = ensureSurface(surfaces, normalizedPlan.surface);
  const printArea = normalizePrintArea(surface.printArea ?? template.mockup?.printArea);
  const summary = summarizePlan(normalizedPlan, surface);
  const printfulPlacement = surface.printfulPlacement ?? template.mockup?.printful?.placement ?? "front";
  const printfulPosition = resolvePrintfulPosition(normalizedPlan, printArea);

  return {
    plan: normalizedPlan,
    surface,
    printArea,
    printful: {
      placement: printfulPlacement ?? null,
      position: printfulPosition,
    },
    summary,
  };
}

export function applyPlanAdjustments(
  plan: PlacementPlan,
  change: { scale?: number; offsetX?: number; offsetY?: number },
): PlacementPlan {
  return {
    ...plan,
    scale:
      change.scale !== undefined
        ? clampPlacementScale(change.scale, plan.scale)
        : clampPlacementScale(plan.scale, 0.75),
    offsetX:
      change.offsetX !== undefined
        ? clampPlacementOffset(change.offsetX, plan.offsetX)
        : clampPlacementOffset(plan.offsetX, 0),
    offsetY:
      change.offsetY !== undefined
        ? clampPlacementOffset(change.offsetY, plan.offsetY)
        : clampPlacementOffset(plan.offsetY, 0),
  };
}

export function limitOffsets(
  offset: number,
  range = PLACEMENT_OFFSET_RANGE,
  factor = PLACEMENT_OFFSET_FACTOR,
): number {
  const clamped = Math.min(Math.max(offset, range.min), range.max);
  return Math.min(Math.max(clamped * factor, -100), 100);
}
