"use client";

import * as React from "react";
import styles from "./prompter.module.css";

type Action = { label: string; value: string };

type Props = {
  actions: Action[];
  onSelect: (value: string) => void;
};

export function PrompterSuggestedActions({ actions, onSelect }: Props) {
  if (!actions.length) return null;
  return (
    <div className={styles.chips}>
      {actions.map((action) => (
        <button
          key={action.value}
          className={styles.chip}
          type="button"
          onClick={() => onSelect(action.value)}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
