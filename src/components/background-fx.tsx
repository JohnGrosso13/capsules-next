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
  const t0 = React.useRef<number>(Math.random() * 1000);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let raf = 0;
    const baseY = [-0.12, -0.08, 0.07, 0.1];

    const loop = () => {
      const t = (performance.now() - t0.current) / 1000;
      const scroll = window.scrollY || 0;
      const h = window.innerHeight || 1;
      const p = Math.min(1, Math.max(0, scroll / (4 * h)));

      const blobSelector = styles.blob ? `.${styles.blob}` : ".blob";
      const nodes = root.querySelectorAll<HTMLElement>(blobSelector);

      nodes.forEach((el, i) => {
        const offset = baseY[i % baseY.length] ?? 0;
        const dy = offset * scroll + Math.sin(t * (0.16 + i * 0.04)) * 28;
        const dx = Math.cos(t * (0.08 + i * 0.03)) * 22 * (i % 2 === 0 ? 1 : -1);
        el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
        el.style.opacity = String(0.28 + 0.32 * (0.5 + 0.5 * Math.sin(t * 0.25 + i)) + p * 0.25);
      });

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

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
