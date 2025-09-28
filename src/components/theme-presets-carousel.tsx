"use client";

import * as React from "react";

import {
  applyThemeVars,
  startPreviewThemeVars,
  endPreviewThemeVars,
} from "@/lib/theme";

import styles from "./theme-presets-carousel.module.css";

type Preset = {
  id: string;
  title: string;
  desc: string;
  vars: Record<string, string>;
};

function useThemePresets(): Preset[] {
  return React.useMemo(() => {
    const make = (id: string, title: string, desc: string, vars: Record<string, string>): Preset => ({
      id,
      title,
      desc,
      vars,
    });

    return [
      make(
        "aurora",
        "Aurora Glow",
        "Vibrant purple-teal gradient with soft glass.",
        {
          "--color-brand": "#8b5cf6",
          "--color-accent": "#22d3ee",
          "--gradient-brand": "linear-gradient(120deg,#8b5cf6 0%,#6366f1 55%,#22d3ee 100%)",
          "--cta-gradient": "linear-gradient(120deg,#7c3aed 0%,#6366f1 55%,#22d3ee 100%)",
          "--app-bg":
            "radial-gradient(1200px 720px at 0% 0%, rgba(139,92,246,0.18), transparent 60%), radial-gradient(1020px 680px at 100% 0%, rgba(34,211,238,0.14), transparent 62%), linear-gradient(90deg, rgba(139,92,246,0.12), rgba(99,102,241,0.06), rgba(5,10,27,0), rgba(34,211,238,0.06), rgba(34,211,238,0.12)), #050a1b",
        },
      ),
      make(
        "noir",
        "Midnight Noir",
        "Deep navy with cool cyan accents and crisp cards.",
        {
          "--color-brand": "#38bdf8",
          "--color-accent": "#7dd3fc",
          "--cta-gradient": "linear-gradient(120deg,#0ea5e9 0%,#38bdf8 55%,#7dd3fc 100%)",
          "--gradient-brand": "linear-gradient(120deg,#1e3a8a 0%,#0ea5e9 55%,#38bdf8 100%)",
          "--glass-bg-1": "rgba(255,255,255,0.08)",
          "--glass-bg-2": "rgba(255,255,255,0.045)",
          "--card-bg-1": "rgba(17, 24, 39, 0.86)",
          "--card-bg-2": "rgba(17, 24, 39, 0.74)",
          "--card-border": "rgba(255,255,255,0.12)",
          "--card-shadow": "0 18px 40px rgba(2,6,23,0.5)",
          "--app-bg":
            "radial-gradient(1000px 640px at 10% 0%, rgba(2,132,199,0.14), transparent 60%), radial-gradient(880px 520px at 90% 0%, rgba(2,6,23,0.5), transparent 62%), linear-gradient(90deg, rgba(15,23,42,0.65), rgba(2,6,23,0.55), rgba(2,6,23,0.6)), #030814",
        },
      ),
      make(
        "sunset",
        "Sunset Pop",
        "Punchy orange-pink gradient with warm highlights.",
        {
          "--color-brand": "#f97316",
          "--color-accent": "#f43f5e",
          "--cta-gradient": "linear-gradient(120deg,#fb923c 0%,#f97316 50%,#f43f5e 100%)",
          "--gradient-brand": "linear-gradient(120deg,#fb7185 0%,#f97316 55%,#f59e0b 100%)",
          "--glass-bg-1": "rgba(255,255,255,0.1)",
          "--glass-bg-2": "rgba(255,255,255,0.06)",
          "--app-bg":
            "radial-gradient(1100px 680px at 0% 0%, rgba(249,115,22,0.16), transparent 62%), radial-gradient(980px 620px at 100% 0%, rgba(244,63,94,0.12), transparent 64%), linear-gradient(90deg, rgba(251,146,60,0.06), rgba(244,63,94,0.06)), #0b0912",
        },
      ),
      make(
        "forest",
        "Forest Mist",
        "Emerald greens and cool teals with soft glass layers.",
        {
          "--color-brand": "#10b981",
          "--color-accent": "#0ea5e9",
          "--cta-gradient": "linear-gradient(120deg,#10b981 0%,#22d3ee 60%,#34d399 100%)",
          "--gradient-brand": "linear-gradient(120deg,#34d399 0%,#10b981 55%,#0ea5e9 100%)",
          "--glass-bg-1": "rgba(255,255,255,0.09)",
          "--glass-bg-2": "rgba(255,255,255,0.045)",
          "--app-bg":
            "radial-gradient(1000px 620px at 0% 0%, rgba(16,185,129,0.14), transparent 62%), radial-gradient(980px 620px at 100% 0%, rgba(14,165,233,0.12), transparent 64%), linear-gradient(90deg, rgba(16,185,129,0.06), rgba(14,165,233,0.06)), #06120f",
        },
      ),
    ];
  }, []);
}

export function ThemePresetsCarousel() {
  const presets = useThemePresets();
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const [menuOpenFor, setMenuOpenFor] = React.useState<string | null>(null);

  const scrollByPage = React.useCallback((dir: 1 | -1) => {
    const el = listRef.current;
    if (!el) return;
    const amount = el.clientWidth || 0;
    el.scrollBy({ left: dir * amount, behavior: "smooth" });
  }, []);

  const buildPreviewStyle = React.useCallback((vars: Record<string, string>) => {
    const style: React.CSSProperties = {};
    Object.entries(vars).forEach(([k, v]) => {
      try {
        (style as unknown as Record<string, string>)[k] = v;
      } catch {}
    });
    return style;
  }, []);

  return (
    <div className={styles.wrap}>
      <p className={styles.lead}>Pick a look to try. Hover to preview, click Apply to keep.</p>
      <div className={styles.carousel}>
        <button
          type="button"
          className={styles.navBtn}
          aria-label="Previous"
          onClick={() => scrollByPage(-1)}
        >
          {"<"}
        </button>
        <div className={styles.track} ref={listRef}>
          {presets.map((preset) => {
            const open = menuOpenFor === preset.id;
            return (
              <div
                key={preset.id}
                className={styles.slide}
                tabIndex={0}
                onMouseEnter={() => startPreviewThemeVars(preset.vars)}
                onMouseLeave={() => endPreviewThemeVars()}
                onFocus={() => startPreviewThemeVars(preset.vars)}
                onBlur={() => endPreviewThemeVars()}
              >
                <div className={styles.swatch} style={buildPreviewStyle(preset.vars)} aria-hidden>
                  <div className={styles.swatchBg} />
                  <div className={styles.swatchCard} />
                </div>
                <h3 className={styles.title}>{preset.title}</h3>
                <p className={styles.desc}>{preset.desc}</p>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.applyBtn}
                    onClick={() => applyThemeVars(preset.vars)}
                  >
                    Apply
                  </button>
                  <div className={styles.menuWrap}>
                    <button
                      type="button"
                      className={styles.moreBtn}
                      aria-haspopup="menu"
                      aria-expanded={open}
                      onClick={() => setMenuOpenFor(open ? null : preset.id)}
                      aria-label={`More actions for ${preset.title}`}
                    >
                      ...
                    </button>
                    {open ? (
                      <div className={styles.menu} role="menu" onMouseLeave={() => setMenuOpenFor(null)}>
                        <button
                          className={styles.menuItem}
                          role="menuitem"
                          onClick={() => {
                            setMenuOpenFor(null);
                            applyThemeVars(preset.vars);
                          }}
                        >
                          Apply
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          className={styles.navBtn}
          aria-label="Next"
          onClick={() => scrollByPage(1)}
        >
          {">"}
        </button>
      </div>
    </div>
  );
}

