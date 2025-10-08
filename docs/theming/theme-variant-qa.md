# Theme Variant QA

Use this checklist while testing theme changes in the browser to verify the paired light/dark variants behave correctly.

> **Variant reminder:** Themes persist both light and dark variants. "System" reads your OS preference first and falls back to the local clock (re-checks about every 30 minutes).

1. Open `/settings` and use the theme carousel.
   - Toggle the mode buttons between `System`, `Light mode`, and `Dark mode`.
   - Observe that the hero summary card updates to match the active mode (CSS variables on `document.documentElement` should reflect the chosen variant).
2. Hover cards in the carousel and in `/settings/themes`.
   - Each hover should preview the matching mode for the active preference (check `data-theme` on `<html>` to confirm).
   - Ensure exiting the hover restores previously applied values (`data-preview-theme` should be removed).
3. Apply a preset and a saved theme in both views.
   - Confirm both light and dark variants are stored (inspect `localStorage.themeVars`).
   - Reload the page; the header, rail, and preset badges should render with the applied variant.
4. Switch preference to `System` and change the OS theme.
   - Verify Capsules updates automatically and the carousel thumbnails track the new mode.
   - (Optional) Temporarily adjust the system clock or disable OS theme reporting to confirm the time-of-day fallback picks a mode after the next half-hour tick.
5. Generate a theme via AI or heuristic plan.
   - Ensure the applied result populates both variants and appears in the gallery with accurate light/dark previews.
