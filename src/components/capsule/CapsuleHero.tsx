"use client";

import * as React from "react";
import {
  CaretDown,
  DoorOpen,
  ImageSquare,
  MagicWand,
  PencilSimple,
  ShareFat,
  UserPlus,
  UsersThree,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import capTheme from "@/app/(authenticated)/capsule/capsule.module.css";
import memberStyles from "./CapsuleMembersPanel.module.css";

export type CapsuleHeroSection = "featured" | "events" | "history" | "media" | "files";

export type CapsuleHeroProps = {
  capsuleName: string | null;
  bannerUrl: string | null;
  canCustomize: boolean;
  onCustomize?: () => void;
  onCustomizeTile?: () => void;
  onCustomizeLogo?: () => void;
  primaryAction: {
    label: string;
    disabled: boolean;
    onClick: (() => void) | null;
  };
  followAction?: {
    label: string;
    disabled: boolean;
    onClick: (() => void) | null;
  } | null;
  leaveAction?: {
    label: string;
    disabled: boolean;
    onClick: (() => void) | null;
  } | null;
  membersOpen: boolean;
  activeSection: CapsuleHeroSection;
  onSelectMembers: () => void;
  onSelectEvents: () => void;
  onSelectHistory: () => void;
  onSelectFeatured: () => void;
  onSelectMedia: () => void;
  onSelectFiles: () => void;
  errorMessage?: string | null;
};

const HERO_LINKS = ["Featured", "Members", "History", "Events", "Media", "Files"] as const;

export function CapsuleHero({
  capsuleName,
  bannerUrl,
  canCustomize,
  onCustomize,
  onCustomizeTile,
  onCustomizeLogo,
  primaryAction,
  followAction = null,
  leaveAction = null,
  membersOpen,
  activeSection,
  onSelectMembers,
  onSelectEvents,
  onSelectHistory,
  onSelectFeatured,
  onSelectMedia,
  onSelectFiles,
  errorMessage,
}: CapsuleHeroProps) {
  const _displayName = capsuleName ?? "Customize this capsule";
  const heroBannerStyle = bannerUrl ? { backgroundImage: `url(${bannerUrl})` } : undefined;
  const [customizeMenuOpen, setCustomizeMenuOpen] = React.useState(false);
  const customizeMenuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!customizeMenuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!customizeMenuRef.current) return;
      if (customizeMenuRef.current.contains(event.target as Node)) return;
      setCustomizeMenuOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCustomizeMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [customizeMenuOpen]);

  return (
    <div className={capTheme.heroWrap}>
      <div
        className={capTheme.heroBanner}
        role="img"
        aria-label="Capsule banner preview"
        data-has-banner={bannerUrl ? "true" : undefined}
      >
        {bannerUrl ? (
          <div className={capTheme.heroBannerImage} style={heroBannerStyle} aria-hidden="true" />
        ) : null}
      </div>
      <div className={capTheme.heroActionsRow}>
        {canCustomize ? (
          <div className={capTheme.heroCustomizeGroup} ref={customizeMenuRef}>
            <button
              type="button"
              className={capTheme.heroCustomizeBtn}
              aria-label="Open capsule customization menu"
              onClick={() => {
                setCustomizeMenuOpen((open) => !open);
              }}
              aria-haspopup="menu"
              aria-expanded={customizeMenuOpen}
            >
              <PencilSimple size={16} weight="bold" />
              Customize visuals
              <CaretDown size={12} weight="bold" />
            </button>
            {customizeMenuOpen ? (
              <div className={capTheme.heroCustomizeMenuSurface} role="menu">
                <button
                  type="button"
                  className={capTheme.heroCustomizeMenuItem}
                  aria-label="Customize capsule banner"
                  onClick={() => {
                    onCustomize?.();
                    setCustomizeMenuOpen(false);
                  }}
                  role="menuitem"
                >
                  <PencilSimple size={16} weight="bold" />
                  <span>Customize banner</span>
                </button>
                {onCustomizeTile ? (
                  <button
                    type="button"
                    className={capTheme.heroCustomizeMenuItem}
                    aria-label="Customize promo tile"
                    onClick={() => {
                      onCustomizeTile?.();
                      setCustomizeMenuOpen(false);
                    }}
                    role="menuitem"
                  >
                    <MagicWand size={16} weight="bold" />
                    <span>Customize promo tile</span>
                  </button>
                ) : null}
                {onCustomizeLogo ? (
                  <button
                    type="button"
                    className={capTheme.heroCustomizeMenuItem}
                    aria-label="Customize capsule logo"
                    onClick={() => {
                      onCustomizeLogo?.();
                      setCustomizeMenuOpen(false);
                    }}
                    role="menuitem"
                  >
                    <ImageSquare size={16} weight="bold" />
                    <span>Customize logo</span>
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className={capTheme.heroActions}>
          <button
            type="button"
            className={`${capTheme.heroAction} ${capTheme.heroActionPrimary}`}
            onClick={primaryAction.onClick ?? undefined}
            disabled={primaryAction.disabled}
          >
            <UsersThree size={16} weight="bold" />
            {primaryAction.label}
          </button>
          {followAction ? (
            <button
              type="button"
              className={`${capTheme.heroAction} ${capTheme.heroActionSecondary}`}
              onClick={followAction.onClick ?? undefined}
              disabled={followAction.disabled}
            >
              <UserPlus size={16} weight="bold" />
              {followAction.label}
            </button>
          ) : null}
          {leaveAction ? (
            <button
              type="button"
              className={`${capTheme.heroAction} ${capTheme.heroActionDanger}`}
              onClick={leaveAction.onClick ?? undefined}
              disabled={leaveAction.disabled}
            >
              <DoorOpen size={16} weight="bold" />
              {leaveAction.label}
            </button>
          ) : null}
          <button
            type="button"
            className={`${capTheme.heroAction} ${capTheme.heroActionSecondary}`}
          >
            <ShareFat size={16} weight="bold" />
            Share
          </button>
        </div>
      </div>
      {errorMessage ? (
        <div className={memberStyles.notice}>
          <WarningCircle size={16} weight="bold" />
          <span>{errorMessage}</span>
        </div>
      ) : null}
      <nav className={capTheme.heroTabs} aria-label="Capsule quick links">
        {HERO_LINKS.map((label) => {
          const isMembersLink = label === "Members";
          const isFeaturedLink = label === "Featured";
          const isHistoryLink = label === "History";
          const isEventsLink = label === "Events";
          const isMediaLink = label === "Media";
          const isFilesLink = label === "Files";
          const isActive = (() => {
            if (isMembersLink) return membersOpen;
            if (isHistoryLink) return !membersOpen && activeSection === "history";
            if (isEventsLink) return !membersOpen && activeSection === "events";
            if (isMediaLink) return !membersOpen && activeSection === "media";
            if (isFilesLink) return !membersOpen && activeSection === "files";
            if (isFeaturedLink) return !membersOpen && activeSection === "featured";
            return false;
          })();
          const className = isActive
            ? `${capTheme.heroTab} ${capTheme.heroTabActive}`
            : capTheme.heroTab;
          const handleClick = () => {
            if (isMembersLink) {
              onSelectMembers();
            } else if (isHistoryLink) {
              onSelectHistory();
            } else if (isEventsLink) {
              onSelectEvents();
            } else if (isMediaLink) {
              onSelectMedia();
            } else if (isFilesLink) {
              onSelectFiles();
            } else if (isFeaturedLink) {
              onSelectFeatured();
            } else {
              onSelectFeatured();
            }
          };
          return (
            <button key={label} type="button" className={className} onClick={handleClick}>
              {label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
