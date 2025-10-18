"use client";

import * as React from "react";
import styles from "../../ai-composer.module.css";

type PreviewColumnProps = {
  title?: string;
  children?: React.ReactNode;
};

export function PreviewColumn({ title = "Preview", children }: PreviewColumnProps) {
  return (
    <section className={styles.previewSection}>
      <header className={styles.previewHeader}>
        <span className={styles.previewTitle}>{title}</span>
      </header>
      <div className={styles.previewBody}>{children}</div>
    </section>
  );
}
