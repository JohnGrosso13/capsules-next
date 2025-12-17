export type PlacementSurfaceId =
  | "front"
  | "back"
  | "sleeve_left"
  | "sleeve_right"
  | "wrap"
  | "pocket"
  | "hood"
  | "unknown";

export type PlacementFit = "standard" | "cover" | "contain";

export type PlacementPlan = {
  surface: PlacementSurfaceId;
  scale: number;
  offsetX: number;
  offsetY: number;
  fit?: PlacementFit;
  prompt?: string | null;
  summary?: string | null;
  source?: "user" | "ai";
};

export type PlacementPrintArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PlacementSurfaceConfig = {
  id: PlacementSurfaceId;
  label: string;
  description?: string;
  printArea: PlacementPrintArea;
  printfulPlacement?: string | null;
  defaultScale?: number;
  method?: "dtg" | "embroidery" | "allover";
};

export type PlacementSummary = {
  text: string;
  surfaceLabel: string;
  warnings: string[];
};

export type PrintfulPosition = {
  areaWidth: number;
  areaHeight: number;
  width: number;
  height: number;
  top: number;
  left: number;
};

export type ResolvedPlacement = {
  plan: PlacementPlan;
  surface: PlacementSurfaceConfig;
  printArea: PlacementPrintArea;
  printful: {
    placement: string | null;
    position: PrintfulPosition;
  };
  summary: PlacementSummary;
};

export const PLACEMENT_SCALE_RANGE = { min: 0.4, max: 1.4 };
export const PLACEMENT_OFFSET_RANGE = { min: -1, max: 1 };
export const PLACEMENT_OFFSET_FACTOR = 18;

export function clampPlacementScale(value: number, fallback = 1): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, PLACEMENT_SCALE_RANGE.min), PLACEMENT_SCALE_RANGE.max);
}

export function clampPlacementOffset(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, PLACEMENT_OFFSET_RANGE.min), PLACEMENT_OFFSET_RANGE.max);
}

export function defaultPlacementPlan(surface: PlacementSurfaceId = "front"): PlacementPlan {
  return {
    surface,
    scale: 0.75,
    offsetX: 0,
    offsetY: 0,
    fit: "standard",
    prompt: null,
    summary: null,
    source: "user",
  };
}
