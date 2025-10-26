# Theme Validation Pipeline

The theme ingestion pipeline protects the app from unsafe values and guarantees accessible output for user-authored themes (including ChatGPT submissions).

## 1. Schema Validation
1. Parse JSON payload against the schema:
   ```json
   {
     "name": "string <= 80",
     "description": "string? <= 240",
     "modes": {
       "light": { "--token-id": "value" },
       "dark": { "--token-id": "value" }
     },
     "metadata": {
       "source": "ui|chatgpt|api",
       "author": "string?"
     }
   }
   ```
2. Reject unknown properties, non-string keys, or values exceeding length limits.
3. Require at least one non-empty variant; if only one variant is provided, mirror it to the other mode.

## 2. Token & Type Guards
- Allowed keys: `src/lib/theme/token-registry.ts` (`THEME_TOKEN_CSS_VARS`)
- Value type checks align with token `valueKind` (color, gradient, dimension, etc.)
- Disallow `url(`, `expression(`, JavaScript expressions, or disallowed units.
- Enforce safe character set (`[A-Za-z0-9#(),.%/_\-:+*'"! ]`).

## 3. Derived Defaults
After normalization, run `stabilizeThemeVars`:
- Ensure `--app-bg` and `--surface-app` exist (derive if missing)
- Fill brand gradient hooks (`--gradient-brand`, `--cta-button-gradient`)
- Normalize glass/CTA/focus tokens for composer safety

## 4. Accessibility Checks
- Run WCAG contrast checks (AA) for:
  - `--color-fg` vs. `--surface-app`
  - `--text-on-brand` vs. `--color-brand`
  - `--color-success|warning|danger` vs. `--surface-elevated`
- Validate focus outlines and chip backgrounds maintain 3:1 contrast.
- Reject payloads failing contrast; surface actionable errors to user/ChatGPT.

## 5. Performance & Budget
- Limit entries per mode to 256 (`MAX_THEME_VAR_ENTRIES`)
- Log payload size; reject themes exceeding 4 KB total
- Track selector budget before applying (via pre-merge metrics)

## 6. Persistence & Telemetry
- Store validated variants via `applyThemeVars` and persist through `writeThemeVariants`
- Record provenance and hash of payload for moderation
- Emit analytics for adoption, validation failures, and manual overrides

## 7. Preview Flow
- Use `startPreviewThemeVars` for hover/preview states
- Revert via `endPreviewThemeVars` on cancel, reset via `clearThemeVars`

## 8. Error Handling
- Return structured errors:
  ```json
  {
    "code": "theme.validation_failed",
    "details": [
      { "token": "--color-brand", "issue": "contrast", "expected": ">= 4.5" }
    ]
  }
  ```
- Provide remediation hints and fallback to the last known good theme.
