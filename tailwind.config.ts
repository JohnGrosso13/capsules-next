import plugin from "tailwindcss/plugin";
import type { Config } from "tailwindcss";
import { asCssVar, buildTailwindThemeExtension } from "./src/lib/theme/token-registry";

const config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}", "./docs/**/*.{md,mdx}", "./*.mdx"],
  darkMode: ["selector", "[data-theme='dark']"],
  theme: {
    extend: {
      ...buildTailwindThemeExtension(),
    },
  },
  plugins: [
    plugin(({ addUtilities }) => {
      addUtilities({
        ".bg-app": {
          background: asCssVar("--surface-app"),
        },
        ".bg-surface-muted": {
          background: asCssVar("--surface-muted"),
        },
        ".bg-surface-elevated": {
          background: asCssVar("--surface-elevated"),
        },
        ".bg-surface-overlay": {
          background: asCssVar("--surface-overlay"),
        },
        ".text-brand-gradient": {
          background: asCssVar("--gradient-brand"),
          "-webkit-background-clip": "text",
          "background-clip": "text",
          color: "transparent",
        },
      });
    }),
  ],
} satisfies Config;

export default config;

