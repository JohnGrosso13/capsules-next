"use client";

import * as React from "react";
import styles from "@/components/home.module.css";

export function PrompterInputBar({
  inputRef,
  value,
  placeholder,
  onChange,
  buttonLabel,
  buttonClassName,
  buttonDisabled,
  onGenerate,
  dataIntent,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  buttonLabel: string;
  buttonClassName: string;
  buttonDisabled: boolean;
  onGenerate: () => void;
  dataIntent?: string;
}) {
  return (
    <div className={styles.promptBar}>
      {/* Animated brand "waterfall lightning" effect outside the bar */}
      <div className={styles.promptFx} aria-hidden="true">
        <span className={styles.fxStrike} />
        <span className={styles.fxTop} />
        <span className={styles.fxSideL} />
        <span className={styles.fxSideR} />
      </div>
      <input
        className={styles.input}
        placeholder={placeholder}
        ref={inputRef}
        id="ai-prompter-input"
        name="ai_prompter"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        className={buttonClassName}
        type="button"
        onClick={onGenerate}
        disabled={buttonDisabled}
        data-intent={dataIntent}
      >
        <span className={styles.genLabel}>{buttonLabel}</span>
      </button>
    </div>
  );
}
