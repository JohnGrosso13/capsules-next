import * as React from "react";

import { Brain, CaretDown, CaretUp, Check } from "@phosphor-icons/react/dist/ssr";

import footerStyles from "../styles/composer-footer.module.css";
import menuStyles from "@/components/ui/context-menu.module.css";
import {
  COMPOSER_IMAGE_QUALITY_OPTIONS,
  titleCaseComposerQuality,
} from "@/lib/composer/image-settings";
import { useCreditUsage } from "@/lib/billing/useCreditUsage";

type ComposerFooterProps = {
  footerHint: string | React.ReactNode;
  loading: boolean;
  attachmentUploading: boolean;
  onSave: () => void;
  onPreviewToggle: () => void;
  previewOpen: boolean;
  onPost: () => void;
  canSave: boolean;
  canPost: boolean;
  saving: boolean;
  smartContextEnabled: boolean;
  contextActive: boolean;
  onToggleContext: () => void;
  imageQuality: (typeof COMPOSER_IMAGE_QUALITY_OPTIONS)[number];
  onQualityChange: (quality: (typeof COMPOSER_IMAGE_QUALITY_OPTIONS)[number]) => void;
};

export function ComposerFooter({
  footerHint,
  loading,
  attachmentUploading,
  onSave,
  onPreviewToggle,
  previewOpen,
  onPost,
  canSave,
  canPost,
  saving,
  smartContextEnabled,
  contextActive,
  onToggleContext,
  imageQuality,
  onQualityChange,
}: ComposerFooterProps) {
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const settingsRef = React.useRef<HTMLDivElement | null>(null);
  const { percentRemaining, loading: creditsLoading, error: creditsError, bypass } = useCreditUsage();

  React.useEffect(() => {
    if (!settingsOpen) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (settingsRef.current && target && !settingsRef.current.contains(target)) {
        setSettingsOpen(false);
      }
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSettingsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);

    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [settingsOpen]);

  const handleToggleSettings = React.useCallback(() => {
    setSettingsOpen((open) => !open);
  }, []);

  const handleToggleContext = React.useCallback(() => {
    onToggleContext();
  }, [onToggleContext]);

  const handleSelectQuality = React.useCallback(
    (quality: (typeof COMPOSER_IMAGE_QUALITY_OPTIONS)[number]) => {
      if (quality === imageQuality) return;
      onQualityChange(quality);
      setSettingsOpen(false);
    },
    [imageQuality, onQualityChange],
  );

  const creditLabel = React.useMemo(() => {
    if (creditsLoading) return "Loading credits…";
    if (creditsError) return "Usage unavailable";
    if (typeof percentRemaining !== "number" || Number.isNaN(percentRemaining)) {
      return "Usage unavailable";
    }
    const clamped = Math.max(0, Math.min(100, Math.round(percentRemaining)));
    if (bypass) return "Dev credits enabled";
    return `${clamped}% left this period`;
  }, [bypass, creditsError, creditsLoading, percentRemaining]);

  const creditPercent = React.useMemo(() => {
    if (bypass) return 100;
    if (typeof percentRemaining !== "number" || Number.isNaN(percentRemaining)) return 0;
    return Math.max(0, Math.min(100, Math.round(percentRemaining)));
  }, [bypass, percentRemaining]);

  return (
    <footer className={footerStyles.panelFooter}>
      <div className={footerStyles.footerLeft}>
        <div className={footerStyles.settingsGroup} ref={settingsRef}>
          <button
            type="button"
            className={footerStyles.settingsToggle}
            onClick={handleToggleSettings}
            aria-haspopup="menu"
            aria-expanded={settingsOpen}
            disabled={loading}
          >
            <span className={footerStyles.settingsIcon} aria-hidden="true">
              <Brain weight={contextActive ? "fill" : "duotone"} />
            </span>
            <span className={footerStyles.settingsLabel}>
              AI settings
              {smartContextEnabled ? " · Context on" : ""}
            </span>
            <span className={footerStyles.settingsCaret} aria-hidden="true">
              {settingsOpen ? <CaretUp weight="bold" /> : <CaretDown weight="bold" />}
            </span>
          </button>
          {settingsOpen ? (
            <div
              className={`${menuStyles.menu} ${footerStyles.settingsMenu}`.trim()}
              role="menu"
            >
              <div className={menuStyles.sectionLabel}>Context</div>
              <button
                type="button"
                className={menuStyles.item}
                role="menuitemcheckbox"
                aria-checked={smartContextEnabled}
                aria-label={smartContextEnabled ? "Turn off context" : "Turn on context"}
                onClick={handleToggleContext}
                disabled={loading}
                aria-disabled={loading}
                data-active={contextActive ? "true" : undefined}
              >
                <Brain weight={contextActive ? "fill" : "duotone"} />
                <span>{smartContextEnabled ? "Context on" : "Context off"}</span>
              </button>

              <div className={menuStyles.separator} aria-hidden="true" />

              <div className={menuStyles.sectionLabel}>Image quality</div>
              {COMPOSER_IMAGE_QUALITY_OPTIONS.map((quality) => (
                <button
                  key={quality}
                  type="button"
                  className={`${menuStyles.item} ${menuStyles.choiceItem}`.trim()}
                  role="menuitemradio"
                  aria-checked={imageQuality === quality}
                  data-active={imageQuality === quality ? "true" : undefined}
                  onClick={() => handleSelectQuality(quality)}
                  disabled={loading}
                  aria-disabled={loading}
                >
                  <span className={menuStyles.itemLabel}>{titleCaseComposerQuality(quality)}</span>
                  {imageQuality === quality ? (
                    <span className={menuStyles.itemCheck} aria-hidden="true">
                      <Check weight="bold" />
                    </span>
                  ) : null}
                </button>
              ))}

              <div className={menuStyles.separator} aria-hidden="true" />

              <div className={menuStyles.sectionLabel}>AI credits</div>
              <div className={footerStyles.creditsBlock}>
                <div
                  className={footerStyles.creditsBar}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={creditPercent}
                >
                  <div
                    className={footerStyles.creditsBarFill}
                    style={{ width: `${creditPercent}%` }}
                  />
                </div>
                <p className={footerStyles.creditsLabel}>{creditLabel}</p>
              </div>
            </div>
          ) : null}
        </div>
        {footerHint ? <p className={footerStyles.footerHint}>{footerHint}</p> : null}
      </div>
      <div className={footerStyles.footerActions}>
        <button
          type="button"
          className={footerStyles.previewToggle}
          onClick={onPreviewToggle}
          aria-pressed={previewOpen}
          disabled={loading || attachmentUploading}
        >
          {previewOpen ? "Hide preview" : "Preview"}
        </button>
        <button
          type="button"
          className={footerStyles.secondaryAction}
          onClick={onSave}
          disabled={!canSave || saving || loading}
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          className={footerStyles.primaryAction}
          onClick={onPost}
          disabled={!canPost || loading || attachmentUploading}
        >
          Post
        </button>
      </div>
    </footer>
  );
}
