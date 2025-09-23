"use client";

import React from "react";

import styles from "./home.module.css";

const defaultChips = [
  "Post an update",
  "Share a photo",
  "Bring feed image",
  "Summarize my feed",
];

type Props = {
  placeholder?: string;
  chips?: string[];
  onGenerate?: (text: string) => void;
};

export function AiPrompterStage({
  placeholder = "Ask your Capsule AI to create anything…",
  chips = defaultChips,
  onGenerate,
}: Props) {
  const [text, setText] = React.useState("");

  function handleGenerate() {
    onGenerate?.(text);
    setText("");
  }

  return (
    <section className={styles.prompterStage} aria-label="AI Prompter">
      <div className={styles.prompter}>
        <div className={styles.promptBar}>
          <input
            className={styles.input}
            placeholder={placeholder}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className={styles.genBtn} type="button" onClick={handleGenerate}>
            <span aria-hidden>✨</span>
            <span className={styles.genLabel}>Generate</span>
          </button>
        </div>
        <div className={styles.chips}>
          {chips.map((c) => (
            <button key={c} className={styles.chip} type="button">
              {c}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

