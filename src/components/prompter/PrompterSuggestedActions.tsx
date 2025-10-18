"use client";

import * as React from "react";
import styles from "@/components/home.module.css";

type Props = {
  actions: string[];
  onSelect: (value: string) => void;
};

export function PrompterSuggestedActions({ actions, onSelect }: Props) {
  if (!actions.length) return null;
  return (
    <div className={styles.chips}>
      {actions.map((action) => (
        <button key={action} className={styles.chip} type="button" onClick={() => onSelect(action)}>
          {action}
        </button>
      ))}
    </div>
  );
}
