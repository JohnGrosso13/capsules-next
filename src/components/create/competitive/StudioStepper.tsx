"use client";

import * as React from "react";
import styles from "./StudioStepper.module.css";

export type StepItem = {
  id: string; // anchor id present in the DOM
  title: string;
  subtitle?: string;
};

type StudioStepperProps = {
  items: StepItem[];
};

export function StudioStepper({ items }: StudioStepperProps) {
  const [activeId, setActiveId] = React.useState<string | null>(items[0]?.id ?? null);

  React.useEffect(() => {
    if (!items.length || typeof window === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the most visible entry
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) setActiveId(visible.target.id);
      },
      { rootMargin: "-40% 0px -50% 0px", threshold: [0.2, 0.4, 0.6] },
    );

    const nodes: Element[] = [];
    items.forEach((it) => {
      const el = document.getElementById(it.id);
      if (el) {
        nodes.push(el);
        observer.observe(el);
      }
    });

    return () => {
      nodes.forEach((el) => observer.unobserve(el));
      observer.disconnect();
    };
  }, [items]);

  const jump = React.useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
  }, []);

  return (
    <nav className={styles.stepperShell} aria-label="Builder steps">
      <div className={styles.rail}>
        {items.map((it, i) => {
          const isActive = activeId === it.id;
          return (
            <button
              key={it.id}
              type="button"
              className={`${styles.item} ${isActive ? styles.itemActive : ""}`}
              onClick={() => jump(it.id)}
              aria-current={isActive ? "step" : undefined}
            >
              <span className={styles.indexDot}>{i + 1}</span>
              <span className={styles.titles}>
                <span className={styles.title}>{it.title}</span>
                {it.subtitle ? <span className={styles.subtitle}>{it.subtitle}</span> : null}
              </span>
              <span className={styles.jumpBtn}>Jump</span>
            </button>
          );
        })}
      </div>

      <div className={styles.hStack}>
        {items.map((it) => {
          const isActive = activeId === it.id;
          return (
            <button
              key={it.id}
              type="button"
              className={`${styles.chip} ${isActive ? styles.chipActive : ""}`}
              onClick={() => jump(it.id)}
            >
              {it.title}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
