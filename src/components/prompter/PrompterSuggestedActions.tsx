"use client";

import * as React from "react";
import styles from "./prompter.module.css";
import type { PrompterChipOption } from "@/components/prompter/hooks/usePrompterStageController";

type Props = {
  actions: PrompterChipOption[];
  onSelect: (action: PrompterChipOption) => void;
};

export function PrompterSuggestedActions({ actions, onSelect }: Props) {
  if (!actions.length) return null;
  return (
    <div className={styles.chips}>
      {actions.map((action) => (
        <button
          key={action.id ?? action.value ?? action.label}
          className={styles.chip}
          type="button"
          onClick={() => onSelect(action)}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
