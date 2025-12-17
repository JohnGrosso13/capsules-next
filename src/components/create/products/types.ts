import type { PlacementPlan, ResolvedPlacement } from "./placement-types";

export type ProductStepId = "design" | "title" | "details" | "pricing" | "review";

export type ProductFormState = {
  templateId: string;
  title: string;
  summary: string;
  price: number;
  currency: string;
  featured: boolean;
  publish: boolean;
  designUrl: string;
  designPrompt: string;
  placementPlan: PlacementPlan;
  placementWarnings: string[];
  mockScale: number;
  mockOffsetX: number;
  mockOffsetY: number;
  availableColors: string[];
  availableSizes: string[];
  selectedColors: string[];
  selectedSizes: string[];
};

export type ProductPreviewModel = {
  title: string;
  summary: string;
  price: number;
  currency: string;
  imageUrl: string | null;
  templateLabel: string;
  templateId: string;
  capsuleName: string;
  colors: string[];
  primaryColor: string | null;
  sizes: string[];
  featured: boolean;
  publish: boolean;
  placement: ResolvedPlacement;
  placementScale: number;
  placementOffsetX: number;
  placementOffsetY: number;
};
