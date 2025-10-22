import type { Theme } from "@/lib/theme";

export type ComposerMode = "post" | "image" | "video" | "poll";

const NAV_VERB_RE = /(go|open|navigate|take|bring|show|switch|launch|visit|return|back)/;
const AI_IMAGE_RE = /(image|photo|picture|graphic|art|poster|thumbnail|banner|illustration)/;
const AI_VIDEO_RE = /(video|clip|reel|short|story|trailer)/;
const AI_POLL_RE = /(poll|survey|vote|questionnaire|choices?)/;

export function detectComposerMode(text: string): ComposerMode {
  if (AI_POLL_RE.test(text)) return "poll";
  if (AI_VIDEO_RE.test(text)) return "video";
  if (AI_IMAGE_RE.test(text)) return "image";
  return "post";
}

export type NavigationTarget =
  | { kind: "route"; path: string; label: string }
  | { kind: "theme"; value: Theme; label: string };

export function resolveNavigationTarget(text: string): NavigationTarget | null {
  const query = text.trim().toLowerCase();
  if (!query) return null;

  if (
    /(switch|change|set|turn)\s+(to\s+)?(dark)\s+(mode|theme)/.test(query) ||
    /\bdark\s+(mode|theme)\b/.test(query) ||
    /night\s+mode/.test(query)
  ) {
    return { kind: "theme", value: "dark", label: "Dark mode" };
  }
  if (
    /(switch|change|set|turn)\s+(to\s+)?(light)\s+(mode|theme)/.test(query) ||
    /\blight\s+(mode|theme)\b/.test(query) ||
    /day\s+mode/.test(query)
  ) {
    return { kind: "theme", value: "light", label: "Light mode" };
  }

  const hasNavVerb = NAV_VERB_RE.test(query);
  const routes: Array<{ regex: RegExp; path: string; label: string }> = [
    { regex: /(home(\s*page)?|landing)/, path: "/", label: "Home" },
    { regex: /create(\s*(page|tab))?/, path: "/create", label: "Create" },
    { regex: /capsule(\s*(page|tab))?/, path: "/capsule", label: "Capsule" },
    { regex: /(settings?|preferences?)/, path: "/settings", label: "Settings" },
  ];

  for (const route of routes) {
    if (!route.regex.test(query)) continue;
    if (hasNavVerb || /(page|tab|view|screen)/.test(query)) {
      return { kind: "route", path: route.path, label: route.label };
    }
  }

  return null;
}

export function navHint(target: NavigationTarget | null): string | null {
  if (!target) return null;
  if (target.kind === "route") {
    return `Ready to open ${target.label}`;
  }
  return `Ready to switch to ${target.label}`;
}
