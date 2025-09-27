import plugin from "tailwindcss/plugin";
import type { Config } from "tailwindcss";

const config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}", "./docs/**/*.{md,mdx}", "./*.mdx"],
  darkMode: ["selector", "[data-theme='dark']"],
  theme: {
    extend: {
      colors: {
        background: "var(--surface-app)",
        surface: {
          muted: "var(--surface-muted)",
          elevated: "var(--surface-elevated)",
          overlay: "var(--surface-overlay)",
        },
        border: {
          DEFAULT: "var(--color-border)",
          strong: "var(--color-border-strong)",
        },
        fg: {
          DEFAULT: "var(--color-fg)",
          muted: "var(--color-fg-muted)",
          subtle: "var(--color-fg-subtle)",
        },
        brand: {
          DEFAULT: "var(--color-brand)",
          strong: "var(--color-brand-strong)",
          foreground: "var(--color-brand-foreground)",
          muted: "var(--color-brand-muted)",
        },
        accent: "var(--color-accent)",
        info: "var(--color-info)",
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        danger: "var(--color-danger)",
      },
      borderRadius: {
        xs: "var(--radius-xs)",
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
        pill: "var(--radius-pill)",
      },
      fontFamily: {
        sans: "var(--font-sans)",
        display: "var(--font-display)",
        mono: "var(--font-mono)",
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        xl: "var(--shadow-xl)",
        glow: "var(--shadow-glow)",
      },
      backgroundImage: {
        "brand-gradient": "var(--gradient-brand)",
      },
      transitionTimingFunction: {
        "emphasized-in": "cubic-bezier(0.3, 0, 0.8, 0.15)",
        "emphasized-out": "cubic-bezier(0.05, 0.7, 0.1, 1)",
      },
    },
  },
  plugins: [
    plugin(({ addUtilities }) => {
      addUtilities({
        ".bg-app": {
          background: "var(--surface-app)",
        },
        ".bg-surface-muted": {
          background: "var(--surface-muted)",
        },
        ".bg-surface-elevated": {
          background: "var(--surface-elevated)",
        },
        ".bg-surface-overlay": {
          background: "var(--surface-overlay)",
        },
        ".text-brand-gradient": {
          background: "var(--gradient-brand)",
          "-webkit-background-clip": "text",
          "background-clip": "text",
          color: "transparent",
        },
      });
    }),
  ],
} satisfies Config;

export default config;
