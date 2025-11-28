import {
  REDUCE_MOTION_STORAGE_KEY,
  TEXT_SCALE_STORAGE_KEY,
  TEXT_SCALE_MIN,
  TEXT_SCALE_MAX,
  TEXT_SCALE_DEFAULT,
} from "./constants";

const clampExpr = `(value) => {
  const num = parseFloat(value);
  if (Number.isNaN(num)) return ${TEXT_SCALE_DEFAULT};
  if (num < ${TEXT_SCALE_MIN}) return ${TEXT_SCALE_MIN};
  if (num > ${TEXT_SCALE_MAX}) return ${TEXT_SCALE_MAX};
  return num;
}`;

export const ACCESSIBILITY_BOOTSTRAP_SCRIPT = `
(function() {
  try {
    var root = document.documentElement;
    var reduce = localStorage.getItem("${REDUCE_MOTION_STORAGE_KEY}");
    if (reduce === "1" || reduce === "true") {
      root.setAttribute("data-reduce-motion", "true");
    }
    var rawScale = localStorage.getItem("${TEXT_SCALE_STORAGE_KEY}");
    if (rawScale) {
      var clamp = ${clampExpr};
      var nextScale = clamp(rawScale);
      root.style.setProperty("--accessibility-text-scale", String(nextScale));
    }
  } catch (error) {
    // Swallow to avoid blocking hydration.
  }
})();`;
