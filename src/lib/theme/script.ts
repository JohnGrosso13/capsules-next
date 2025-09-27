import { normalizeThemeVars } from "./shared";

const normalizeThemeVarsSource = normalizeThemeVars.toString();

export const THEME_BOOTSTRAP_SCRIPT = `(function(){
  try {
    var theme = localStorage.getItem('theme');
    if (theme !== 'light' && theme !== 'dark') {
      theme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
    }
    document.documentElement.dataset.theme = theme;
    var stored = localStorage.getItem('themeVars');
    if (stored) {
      try {
        var parsed = JSON.parse(stored) || {};
        var sanitizeThemeVars = ${normalizeThemeVarsSource};
        var normalized = sanitizeThemeVars(parsed);
        var root = document.documentElement;
        for (var key in normalized) {
          if (Object.prototype.hasOwnProperty.call(normalized, key)) {
            root.style.setProperty(key, normalized[key]);
          }
        }
      } catch (innerErr) {}
    }
  } catch (err) {}
})();`;
