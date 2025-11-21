"use client";

import * as React from "react";
import styles from "../styles";

type PreviewColumnProps = {
  title?: string;
  subtitle?: string | null;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  variant?: "default" | "compact";
  hideHeader?: boolean;
};

export function PreviewColumn({
  title = "Preview",
  subtitle,
  meta,
  actions,
  children,
  variant = "default",
  hideHeader = false,
}: PreviewColumnProps) {
  return (
    <section className={styles.previewSection} data-variant={variant}>
      {!hideHeader ? (
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
      ) : null}
      <div className={styles.previewBody}>{children}</div>
    </section>
  );
}
