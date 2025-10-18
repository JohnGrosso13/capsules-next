"use client";

import * as React from "react";
import styles from "../../ai-composer.module.css";

type PreviewColumnProps = {
  title?: string;
  subtitle?: string | null;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
};

export function PreviewColumn({
  title = "Preview",
  subtitle,
  meta,
  actions,
  children,
}: PreviewColumnProps) {
  return (
    <section className={styles.previewSection}>
      <header className={styles.previewHeader}>
        <div className={styles.previewHeaderGroup}>
          <span className={styles.previewTitle}>{title}</span>
          {subtitle ? <span className={styles.previewSubtitle}>{subtitle}</span> : null}
        </div>
        {meta || actions ? (
          <div className={styles.previewHeaderMeta}>
            {meta}
            {actions}
          </div>
        ) : null}
      </header>
      <div className={styles.previewBody}>{children}</div>
    </section>
  );
}
