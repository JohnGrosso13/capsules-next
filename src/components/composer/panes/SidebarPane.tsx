"use client";

import * as React from "react";
import {
  SidebarSimple,
  ChatsTeardrop,
  FileText,
  FolderSimple,
  Brain,
  X,
} from "@phosphor-icons/react/dist/ssr";

import styles from "../styles";

export type SidebarListItem = {
  id: string;
  title: string;
  subtitle?: string;
  onClick(): void;
  active?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
};

export type SidebarSectionProps = {
  title: string;
  description?: string;
  items: SidebarListItem[];
  emptyMessage: string;
  itemIcon?: React.ReactNode;
  thumbClassName?: string;
  actionLabel?: string;
  onAction?: () => void;
  maxVisible?: number;
};

export type SidebarTabKey = "recent" | "drafts" | "projects" | "memories";

export type SidebarTabOption = {
  key: SidebarTabKey;
  label: string;
  renderIcon(selected: boolean): React.ReactNode;
};

export const SIDEBAR_TAB_OPTIONS: SidebarTabOption[] = [
  {
    key: "recent",
    label: "Recent chats",
    renderIcon: (selected) => <ChatsTeardrop size={18} weight={selected ? "fill" : "duotone"} />,
  },
  {
    key: "drafts",
    label: "Saved drafts",
    renderIcon: (selected) => <FileText size={18} weight={selected ? "fill" : "duotone"} />,
  },
  {
    key: "projects",
    label: "Projects",
    renderIcon: (selected) => <FolderSimple size={18} weight={selected ? "fill" : "duotone"} />,
  },
  {
    key: "memories",
    label: "Memories",
    renderIcon: (selected) => <Brain size={18} weight={selected ? "fill" : "duotone"} />,
  },
];

export function SidebarSection({
  title,
  description,
  items,
  emptyMessage,
  itemIcon,
  thumbClassName = "",
  actionLabel,
  onAction,
  maxVisible,
}: SidebarSectionProps) {
  const limit =
    typeof maxVisible === "number" && Number.isFinite(maxVisible) && maxVisible > 0
      ? Math.trunc(maxVisible)
      : null;
  const visibleItems = limit ? items.slice(0, limit) : items;

  return (
    <section className={styles.memorySection}>
      <header className={styles.memoryHeader}>
        <div className={styles.memoryHeaderTop}>
          <span className={styles.memoryTitle}>{title}</span>
          {onAction ? (
            <button type="button" className={styles.memoryLinkBtn} onClick={onAction}>
              {actionLabel ?? "Add"}
            </button>
          ) : null}
        </div>
        {description ? <p className={styles.memorySubtitle}>{description}</p> : null}
      </header>
      {visibleItems.length ? (
        <ol className={styles.memoryList}>
          {visibleItems.map((item) => {
            const cardClass = `${styles.memoryCard}${item.active ? ` ${styles.memoryCardActive}` : ""}`;
            const iconNode = item.icon ?? itemIcon ?? null;
            const thumbClass = `${styles.memoryThumb}${thumbClassName ? ` ${thumbClassName}` : ""}`;
            const subtitle = item.subtitle ? ` – ${item.subtitle}` : "";
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={cardClass}
                  onClick={item.onClick}
                  disabled={item.disabled}
                  title={`${item.title}${subtitle}`}
                  aria-label={`${item.title}${subtitle}`}
                >
                  {iconNode ? <span className={thumbClass}>{iconNode}</span> : null}
                  <span className={styles.memoryMeta}>
                    <span className={styles.memoryName}>{item.title}</span>
                    {item.subtitle ? (
                      <span className={styles.memoryType}>{item.subtitle}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className={styles.memoryEmpty}>{emptyMessage}</div>
      )}
    </section>
  );
}

export type SidebarRailProps = {
  collapsed: boolean;
  activeTab: SidebarTabKey;
  onTabChange(tab: SidebarTabKey): void;
  onToggleCollapse(): void;
  content: React.ReactNode;
  recentModal?: {
    open: boolean;
    items: SidebarListItem[];
    onClose(): void;
  };
};

export function SidebarRail({
  collapsed,
  activeTab,
  onTabChange,
  onToggleCollapse,
  content,
  recentModal,
}: SidebarRailProps) {
  if (collapsed) {
    return (
      <div className={styles.collapsedRail}>
        <button
          type="button"
          className={styles.collapsedRailBtn}
          onClick={onToggleCollapse}
          aria-label="Expand sidebar"
          title="Expand sidebar"
        >
          <SidebarSimple size={18} weight="bold" />
          <span className={styles.srOnly}>Expand sidebar</span>
        </button>
        {SIDEBAR_TAB_OPTIONS.map((tab) => {
          const selected = activeTab === tab.key;
          return (
            <button
              key={`collapsed-${tab.key}`}
              type="button"
              className={styles.collapsedRailBtn}
              data-active={selected ? "true" : undefined}
              onClick={() => onTabChange(tab.key)}
              aria-label={tab.label}
              title={tab.label}
            >
              {tab.renderIcon(selected)}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={styles.memoryRail}>
      <div className={styles.sidebarHeaderRow}>
        <div className={styles.sidebarTabsGroup}>
          <div className={styles.sidebarTabs} role="tablist" aria-label="Composer navigation">
            {SIDEBAR_TAB_OPTIONS.map((tab) => {
              const selected = tab.key === activeTab;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  tabIndex={selected ? 0 : -1}
                  className={`${styles.sidebarTab} ${selected ? styles.sidebarTabActive : ""}`}
                  data-selected={selected ? "true" : undefined}
                  onClick={() => onTabChange(tab.key)}
                  title={tab.label}
                >
                  {tab.renderIcon(selected)}
                  <span className={styles.srOnly}>{tab.label}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className={styles.sidebarCollapseBtn}
            onClick={onToggleCollapse}
            aria-label="Hide sidebar"
          >
            <SidebarSimple size={18} weight="bold" />
            <span className={styles.srOnly}>Hide sidebar</span>
          </button>
        </div>
      </div>
      <div className={styles.sidebarScroll}>{content}</div>

      {recentModal?.open ? (
        <div
          className={styles.sidebarOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="All recent chats"
          onClick={recentModal.onClose}
        >
          <div
            className={styles.sidebarOverlayCard}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.sidebarOverlayHeader}>
              <span className={styles.sidebarOverlayTitle}>Recent chats</span>
              <button
                type="button"
                className={styles.sidebarOverlayClose}
                onClick={recentModal.onClose}
              >
                Close
              </button>
            </div>
            <div className={styles.sidebarOverlayList}>
              <ol className={styles.memoryList}>
                {recentModal.items.map((item) => {
                  const cardClass = `${styles.memoryCard}${
                    item.active ? ` ${styles.memoryCardActive}` : ""
                  }`;
                  const iconNode = item.icon ?? null;
                  const thumbClass = `${styles.memoryThumb} ${styles.memoryThumbChat ?? ""}`;
                  const subtitle = item.subtitle ? ` – ${item.subtitle}` : "";
                  return (
                    <li key={`recent-modal-${item.id}`}>
                      <button
                        type="button"
                        className={cardClass}
                        onClick={item.onClick}
                        disabled={item.disabled}
                        title={`${item.title}${subtitle}`}
                        aria-label={`${item.title}${subtitle}`}
                      >
                        {iconNode ? <span className={thumbClass}>{iconNode}</span> : null}
                        <span className={styles.memoryMeta}>
                          <span className={styles.memoryName}>{item.title}</span>
                          {item.subtitle ? (
                            <span className={styles.memoryType}>{item.subtitle}</span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type MobileMenuSection = {
  title: string;
  items: SidebarListItem[];
  emptyMessage: string;
  actionLabel?: string;
  onAction?: () => void;
};

type MemoriesSection = {
  title: string;
  buttonLabel: string;
  description: string;
  onBrowse(): void;
};

export type MobileSidebarMenuProps = {
  open: boolean;
  onClose(): void;
  closeButtonRef: React.RefObject<HTMLButtonElement | null>;
  onItemSelect?: () => void;
  sections: MobileMenuSection[];
  memoriesSection?: MemoriesSection;
  extraSections?: React.ReactNode;
};

export function MobileSidebarMenu({
  open,
  onClose,
  closeButtonRef,
  onItemSelect,
  sections,
  memoriesSection,
  extraSections,
}: MobileSidebarMenuProps) {
  const handleListItemClick = (item: SidebarListItem) => {
    item.onClick();
    onItemSelect?.();
  };

  const handleSectionAction = (section: MobileMenuSection) => {
    section.onAction?.();
    onItemSelect?.();
  };

  React.useEffect(() => {
    if (!open) return;
    const button = closeButtonRef.current;
    button?.focus();
    return () => {
      button?.blur();
    };
  }, [closeButtonRef, open]);

  if (!open) return null;

  return (
    <div
      id="composer-mobile-menu"
      className={styles.mobileSheet}
      role="dialog"
      aria-modal="true"
      aria-labelledby="composer-mobile-menu-title"
      onClick={onClose}
    >
      <div className={styles.mobileSheetBackdrop} />
      <div
        className={styles.mobileSheetPanel}
        role="document"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.mobileSheetHeader}>
          <span id="composer-mobile-menu-title" className={styles.mobileSheetTitle}>
            Composer menu
          </span>
          <button
            type="button"
            className={styles.mobileSheetClose}
            onClick={onClose}
            ref={closeButtonRef}
            aria-label="Close composer menu"
          >
            <X size={16} weight="bold" />
          </button>
        </div>
        <div className={styles.mobileSheetBody}>
          {sections.map((section) => (
            <section key={section.title} className={styles.mobileSheetSection}>
              <header>
                <span className={styles.mobileSheetSectionTitle}>{section.title}</span>
                {section.actionLabel ? (
                  <button
                    type="button"
                    className={styles.mobileSheetSectionAction}
                    onClick={() => handleSectionAction(section)}
                  >
                    {section.actionLabel}
                  </button>
                ) : null}
              </header>
              {section.items.length ? (
                <ul className={styles.mobileSheetList} role="list">
                  {section.items.map((item) => (
                    <li key={`${section.title}-${item.id}`}>
                      <button
                        type="button"
                        onClick={() => handleListItemClick(item)}
                        disabled={item.disabled}
                        data-active={item.active ? "true" : undefined}
                      >
                        {item.icon ? (
                          <span className={styles.mobileSheetListIcon}>{item.icon}</span>
                        ) : null}
                        <span className={styles.mobileSheetListMeta}>
                          <span className={styles.mobileSheetListTitle}>{item.title}</span>
                          {item.subtitle ? (
                            <span className={styles.mobileSheetListCaption}>{item.subtitle}</span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className={styles.memoryEmpty}>{section.emptyMessage}</div>
              )}
            </section>
          ))}

          {memoriesSection ? (
            <section className={styles.mobileSheetSection}>
              <header>
                <span className={styles.mobileSheetSectionTitle}>{memoriesSection.title}</span>
              </header>
              <ul className={styles.mobileSheetList} role="list">
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      memoriesSection.onBrowse();
                      onItemSelect?.();
                    }}
                  >
                    <span className={styles.mobileSheetListIcon}>
                      <Brain size={18} weight="fill" />
                    </span>
                    <span className={styles.mobileSheetListMeta}>
                      <span className={styles.mobileSheetListTitle}>
                        {memoriesSection.buttonLabel}
                      </span>
                      <span className={styles.mobileSheetListCaption}>
                        {memoriesSection.description}
                      </span>
                    </span>
                  </button>
                </li>
              </ul>
            </section>
          ) : null}

          {extraSections}
        </div>
      </div>
    </div>
  );
}
