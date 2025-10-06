import { NORMALIZE_THEME_VARS_BOOTSTRAP_SOURCE } from "./shared";

export const THEME_BOOTSTRAP_SCRIPT = `(function(){
  var sanitizeThemeVars = ${NORMALIZE_THEME_VARS_BOOTSTRAP_SOURCE};
  function canonicalizeVariants(input) {
    var canonical = { light: {}, dark: {} };
    if (!input || typeof input !== "object") return canonical;
    var candidate = input;
    var hasLight = candidate.light && typeof candidate.light === "object" && candidate.light !== null;
    var hasDark = candidate.dark && typeof candidate.dark === "object" && candidate.dark !== null;
    if (hasLight || hasDark) {
      if (hasLight) canonical.light = sanitizeThemeVars(candidate.light);
      if (hasDark) canonical.dark = sanitizeThemeVars(candidate.dark);
    } else {
      var fallback = sanitizeThemeVars(candidate);
      canonical.light = Object.assign({}, fallback);
      canonical.dark = Object.assign({}, fallback);
    }
    if (!Object.keys(canonical.light).length && Object.keys(canonical.dark).length) {
      canonical.light = Object.assign({}, canonical.dark);
    } else if (!Object.keys(canonical.dark).length && Object.keys(canonical.light).length) {
      canonical.dark = Object.assign({}, canonical.light);
    }
    return canonical;
  }
  function collectVariantKeys(variants) {
    var keys = [];
    var seen = {};
    ["light", "dark"].forEach(function(mode) {
      var map = variants[mode];
      if (!map || typeof map !== "object") return;
      Object.keys(map).forEach(function(key) {
        if (key && key.indexOf("--") === 0 && !seen[key]) {
          seen[key] = true;
          keys.push(key);
        }
      });
    });
    return keys;
  }
  function resolveSystemMode() {
    try {
      if (window.matchMedia) {
        var prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
        if (prefersDark.matches) return "dark";
        var prefersLight = window.matchMedia("(prefers-color-scheme: light)");
        if (prefersLight.matches) return "light";
      }
    } catch (error) {}
    try {
      var hours = new Date().getHours();
      if (hours >= 6 && hours < 18) return "light";
    } catch (error) {}
    return "dark";
  }
  function readStoredVariants() {
    try {
      var raw = localStorage.getItem("themeVars");
      if (!raw) return { light: {}, dark: {} };
      var parsed = JSON.parse(raw) || {};
      return canonicalizeVariants(parsed);
    } catch (error) {
      return { light: {}, dark: {} };
    }
  }
  function readPreference() {
    try {
      var raw = localStorage.getItem("theme");
      if (raw === "light" || raw === "dark" || raw === "system") return raw;
    } catch (error) {}
    return "system";
  }
  try {
    if (typeof document === "undefined") return;
    var root = document.documentElement;
    var preference = readPreference();
    var mode = preference === "system" ? resolveSystemMode() : preference;
    root.dataset.themePreference = preference;
    root.dataset.theme = mode;
    var variants = readStoredVariants();
    var keys = collectVariantKeys(variants);
    keys.forEach(function(key) {
      root.style.removeProperty(key);
    });
    var active = variants[mode];
    if (!active || typeof active !== "object" || !Object.keys(active).length) {
      var fallbackMode = mode === "light" ? "dark" : "light";
      active = variants[fallbackMode] || {};
    }
    Object.keys(active).forEach(function(key) {
      root.style.setProperty(key, active[key]);
    });
  } catch (error) {}
})();`;
