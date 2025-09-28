"use client";

import React from "react";
import styles from "./background-fx.module.css";

const className = (...keys: Array<keyof typeof styles>): string =>
  keys
    .map((key) => styles[key] ?? "")
    .filter((value) => value.length > 0)
    .join(" ")
    .trim();

export function BackgroundFX() {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  // Static background: remove animation loop to avoid motion.

  return (
    <div className={`${styles.bg ?? ""} background-fx-root`.trim()} aria-hidden ref={rootRef}>
      <div className={className("blob", "purple", "b1")} />
      <div className={className("blob", "indigo", "b2")} />
      <div className={className("blob", "pink", "b3")} />
      <div className={className("blob", "indigo", "b4")} />
      <div className={styles.mist ?? ""} />
    </div>
  );
}
