"use client";

import * as React from "react";
import { Eye } from "@phosphor-icons/react/dist/ssr";

import styles from "../../ai-composer.module.css";

type PreviewColumnProps = {
  title?: string;
  children?: React.ReactNode;
};

export function PreviewColumn({ title = "Preview", children }: PreviewColumnProps) {
  return (
    <>
      <div className={styles.previewHeader}>
        <Eye size={16} weight="bold" />
        <span>{title}</span>
      </div>
      <div className={styles.previewBody}>{children}</div>
    </>
  );
}
