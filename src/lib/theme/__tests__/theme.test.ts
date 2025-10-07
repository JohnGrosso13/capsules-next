import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { JSDOM } from "jsdom";

type MatchMediaController = {
  matchMedia: (query: string) => MediaQueryList;
  setMode: (mode: "light" | "dark") => void;
};

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
const win = dom.window;

Object.defineProperty(globalThis, "window", {
  configurable: true,
  writable: true,
  value: win,
});
Object.defineProperty(globalThis, "document", {
  configurable: true,
  writable: true,
  value: win.document,
});
Object.defineProperty(globalThis, "CustomEvent", {
  configurable: true,
  writable: true,
  value: win.CustomEvent,
});
Object.defineProperty(globalThis, "DOMStringMap", {
  configurable: true,
  writable: true,
  value: win.DOMStringMap,
});
Object.defineProperty(globalThis, "HTMLElement", {
  configurable: true,
  writable: true,
  value: win.HTMLElement,
});
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  writable: true,
  value: win.navigator,
});
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  writable: true,
  value: win.localStorage,
});
Object.defineProperty(globalThis, "Event", {
  configurable: true,
  writable: true,
  value: win.Event,
});

function createMatchMediaController(initialMode: "light" | "dark"): MatchMediaController {
  let mode = initialMode;
  const darkListeners = new Set<(event: MediaQueryListEvent) => void>();

  const matchMedia = (query: string): MediaQueryList => {
    const isDarkQuery = /\(prefers-color-scheme:\s*dark\)/i.test(query);
    const isLightQuery = /\(prefers-color-scheme:\s*light\)/i.test(query);
    const matches = isDarkQuery ? mode === "dark" : isLightQuery ? mode === "light" : false;

    const stub: MediaQueryList = {
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((event, listener: EventListener) => {
        if (event === "change" && isDarkQuery && typeof listener === "function") {
          darkListeners.add(listener as (event: MediaQueryListEvent) => void);
        }
      }),
      removeEventListener: vi.fn((event, listener: EventListener) => {
        if (event === "change" && isDarkQuery && typeof listener === "function") {
          darkListeners.delete(listener as (event: MediaQueryListEvent) => void);
        }
      }),
      dispatchEvent: vi.fn(),
    };
    return stub;
  };

  function setMode(nextMode: "light" | "dark") {
    if (mode === nextMode) return;
    mode = nextMode;
    const event = {
      matches: nextMode === "dark",
      media: "(prefers-color-scheme: dark)",
    } as MediaQueryListEvent;
    darkListeners.forEach((listener) => {
      listener(event);
    });
  }

  return { matchMedia, setMode };
}

async function loadTheme(initialMode: "light" | "dark" = "light") {
  vi.resetModules();
  const controller = createMatchMediaController(initialMode);
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: controller.matchMedia,
  });
  const mod = await import("@/lib/theme");
  return { theme: mod, controller };
}

describe("theme variants", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    document.documentElement.style.cssText = "";
    const dataset = document.documentElement.dataset;
    Object.keys(dataset).forEach((key) => {
      delete (dataset as Record<string, string>)[key];
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("applies a flat map to both variants and stores it", async () => {
    const { theme } = await loadTheme("light");
    theme.setTheme("light");
    theme.applyThemeVars({ "--card-bg-1": "#ffffff" });

    expect(document.documentElement.style.getPropertyValue("--card-bg-1")).toBe("#ffffff");
    const stored = theme.getStoredThemeVars();
    expect(stored.light?.["--card-bg-1"]).toBe("#ffffff");
    expect(stored.dark?.["--card-bg-1"]).toBe("#ffffff");
  });

  it("removes stale theme vars when applying new variants", async () => {
    const { theme } = await loadTheme("light");
    theme.setTheme("light");
    theme.applyThemeVars({
      light: { "--card-bg-1": "#111111", "--card-bg-2": "#222222" },
      dark: { "--card-bg-1": "#333333", "--card-bg-2": "#444444" },
    });

    expect(document.documentElement.style.getPropertyValue("--card-bg-1")).toBe("#111111");

    theme.applyThemeVars({
      light: { "--card-bg-2": "#555555" },
      dark: { "--card-bg-2": "#666666" },
    });

    expect(document.documentElement.style.getPropertyValue("--card-bg-1")).toBe("");
    expect(document.documentElement.style.getPropertyValue("--card-bg-2")).toBe("#555555");
    const stored = theme.getStoredThemeVars();
    expect(stored.light?.["--card-bg-1"]).toBeUndefined();
    expect(stored.dark?.["--card-bg-1"]).toBeUndefined();
  });

  it("honours system preference when applying variants", async () => {
    const { theme } = await loadTheme("dark");
    theme.setTheme("system");
    theme.applyThemeVars({
      light: { "--card-bg-1": "#f2f2f2" },
      dark: { "--card-bg-1": "#18181b" },
    });

    expect(document.documentElement.dataset.themePreference).toBe("system");
    expect(document.documentElement.style.getPropertyValue("--card-bg-1")).toBe("#18181b");
    const stored = theme.getStoredThemeVars();
    expect(stored.dark?.["--card-bg-1"]).toBe("#18181b");
    expect(stored.light?.["--card-bg-1"]).toBe("#f2f2f2");
  });

  it("reapplies stored variants when system mode changes", async () => {
    const { theme, controller } = await loadTheme("dark");
    theme.setTheme("system");
    theme.applyThemeVars({
      light: { "--card-bg-2": "#bbbbbb" },
      dark: { "--card-bg-2": "#0f172a" },
    });

    expect(document.documentElement.style.getPropertyValue("--card-bg-2")).toBe("#0f172a");

    controller.setMode("light");

    expect(document.documentElement.style.getPropertyValue("--card-bg-2")).toBe("#bbbbbb");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.themePreference).toBe("system");
  });

  it("previews and restores theme vars for the active mode", async () => {
    const { theme } = await loadTheme("light");
    theme.setTheme("light");
    theme.applyThemeVars({
      light: { "--text": "#0b1120" },
      dark: { "--text": "#f1f5f9" },
    });

    theme.startPreviewThemeVars({
      light: { "--text": "#2563eb" },
      dark: { "--text": "#60a5fa" },
    });

    expect(document.documentElement.style.getPropertyValue("--text")).toBe("#2563eb");

    theme.endPreviewThemeVars();

    expect(document.documentElement.style.getPropertyValue("--text")).toBe("#0b1120");
  });

  it("returns clones so callers cannot mutate stored variants", async () => {
    const { theme } = await loadTheme("light");
    theme.setTheme("light");
    theme.applyThemeVars({ "--card-bg-2": "#abcdef" });

    const stored = theme.getStoredThemeVars();
    if (stored.light) {
      stored.light["--card-bg-2"] = "#000000";
    }

    expect(theme.getStoredThemeVars().light?.["--card-bg-2"]).toBe("#abcdef");
  });
});
