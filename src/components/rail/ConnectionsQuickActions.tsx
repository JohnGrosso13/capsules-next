"use client";

import * as React from "react";

import styles from "./connections-quick-actions.module.css";

export type QuickAction = {
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  ariaLabel?: string;
  disabled?: boolean;
  active?: boolean;
  variant?: "default" | "party";
  badge?: React.ReactNode;
};

type ConnectionsQuickActionsProps = {
  actions: QuickAction[];
  compact?: boolean;
  showLabels?: boolean;
};

function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function ConnectionsQuickActions({
  actions,
  compact = false,
  showLabels = false,
}: ConnectionsQuickActionsProps) {
  if (!actions.length) return null;

  const showButtonLabels = showLabels && !compact;

  return (
    <div className={classNames(styles.quickActions, compact && styles.quickActionsCompact)}>
      {actions.map((action) => {
        const buttonClasses = classNames(
          styles.quickActionButton,
          (compact || !showButtonLabels) && styles.quickActionButtonCompact,
          showButtonLabels && styles.quickActionButtonWithLabel,
          action.variant === "party" && styles.quickActionButtonParty,
        );
        const labelClasses = classNames(
          styles.quickActionLabel,
          !showButtonLabels && styles.quickActionLabelHidden,
        );
        return (
          <button
            key={action.key}
            type="button"
            className={buttonClasses}
            onClick={action.onClick}
            disabled={action.disabled}
            aria-label={action.ariaLabel ?? action.label}
            data-active={action.active ? "true" : "false"}
            title={action.label}
          >
            <span className={styles.quickActionIcon} aria-hidden>
              {action.icon}
            </span>
            <span className={labelClasses}>{action.label}</span>
            {action.badge ? <span className={styles.quickActionLive}>{action.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
