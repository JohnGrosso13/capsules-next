import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "tests/**/*.{test,spec}.{js,ts,jsx,tsx}",
      "src/**/*.{test,spec}.{js,ts,jsx,tsx}",
    ],
    exclude: [
      "node_modules/**",
      "tests/e2e/**",
      "playwright-report/**",
      "test-results/**",
      "blob-report/**",
    ],
  },
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
});
