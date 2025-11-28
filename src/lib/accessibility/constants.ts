export const REDUCE_MOTION_STORAGE_KEY = "capsules:accessibility:reduce-motion";
export const TEXT_SCALE_STORAGE_KEY = "capsules:accessibility:text-scale";

export const TEXT_SCALE_DEFAULT = 1;
export const TEXT_SCALE_MIN = 0.9;
export const TEXT_SCALE_MAX = 1.3;
export const TEXT_SCALE_STEP = 0.05;

export function clampTextScale(value: number): number {
  if (Number.isNaN(value)) return TEXT_SCALE_DEFAULT;
  return Math.min(Math.max(value, TEXT_SCALE_MIN), TEXT_SCALE_MAX);
}
