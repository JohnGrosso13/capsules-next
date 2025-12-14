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
  const raw = text.trim();
  const query = raw.toLowerCase();
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
  const hasNavCue = hasNavVerb || /(page|tab|view|screen)/.test(query);
  const settingsContext = /\b(settings?|preferences?|prefs?)\b/.test(query);
  const allowSettingsCue = () => settingsContext || hasNavCue;

  type RouteConfig = {
    regex: RegExp;
    path: string;
    label: string;
    allowWithoutCue?: () => boolean;
    requiresSettingsContext?: boolean;
  };

  const settingsRoutes: RouteConfig[] = [
    {
      regex: /\b(billing|payment|payments|payouts|invoices?|subscription|subscriptions?)\b/,
      path: "/settings?tab=billing",
      label: "Settings \u2013 Billing",
      allowWithoutCue: allowSettingsCue,
      requiresSettingsContext: true,
    },
    {
      regex: /\b(notifications?|alerts?|emails?)\b/,
      path: "/settings?tab=notifications",
      label: "Settings \u2013 Notifications",
      allowWithoutCue: allowSettingsCue,
      requiresSettingsContext: true,
    },
    {
      regex: /\b(voice|audio|mic|microphone)\b/,
      path: "/settings?tab=voice",
      label: "Settings \u2013 Voice",
      allowWithoutCue: allowSettingsCue,
      requiresSettingsContext: true,
    },
    {
      regex: /\b(appearance|theme|style|vibe|color|colour)\b/,
      path: "/settings?tab=appearance",
      label: "Settings \u2013 Appearance",
      allowWithoutCue: allowSettingsCue,
      requiresSettingsContext: true,
    },
    {
      regex: /\b(connections?|integrations?|linked\s+accounts?|oauth|apps?)\b/,
      path: "/settings?tab=connections",
      label: "Settings \u2013 Connections",
      allowWithoutCue: allowSettingsCue,
      requiresSettingsContext: true,
    },
    {
      regex: /\b(composer|prompt|editor)\b/,
      path: "/settings?tab=composer",
      label: "Settings \u2013 Composer",
      allowWithoutCue: allowSettingsCue,
      requiresSettingsContext: true,
    },
    {
      regex: /\b(accessibility|a11y|contrast|screen\s*reader)\b/,
      path: "/settings?tab=accessibility",
      label: "Settings \u2013 Accessibility",
      allowWithoutCue: allowSettingsCue,
      requiresSettingsContext: true,
    },
    {
      regex: /\b(security|privacy|auth|login|password|2fa|two[\s-]?factor|mfa)\b/,
      path: "/settings?tab=security",
      label: "Settings \u2013 Security",
      allowWithoutCue: allowSettingsCue,
      requiresSettingsContext: true,
    },
    {
      regex: /\b(account|profile)\b/,
      path: "/settings?tab=account",
      label: "Settings \u2013 Account",
      allowWithoutCue: allowSettingsCue,
      requiresSettingsContext: true,
    },
    {
      regex: /\b(capsules?|spaces?|communities)\b/,
      path: "/settings?tab=capsules",
      label: "Settings \u2013 Capsules",
      allowWithoutCue: allowSettingsCue,
      requiresSettingsContext: true,
    },
  ];

  const routes: RouteConfig[] = [
    { regex: /\b(home(\s*page)?|landing)\b/, path: "/home", label: "Home" },
    { regex: /\b(explore|discover|browse|search)\b/, path: "/explore", label: "Explore" },
    { regex: /\bcreate(\s*(page|tab))?\b/, path: "/create", label: "Create" },
    {
      regex: /\b(memory|memories|library|archive|uploads?|assets?)\b/,
      path: "/memory",
      label: "Memory",
    },
    {
      regex: /\b(market|marketplace|store|shop|merch)\b/,
      path: "/market",
      label: "Market",
    },
    {
      regex: /\b(friends?|connections?|friend\s+requests?)\b/,
      path: "/friends",
      label: "Friends",
    },
    {
      regex: /\b(settings?|preferences?)\b/,
      path: "/settings",
      label: "Settings",
      allowWithoutCue: allowSettingsCue,
      requiresSettingsContext: true,
    },
    {
      regex: /\b(profile|my\s+profile|profile\s+page|profile\s+tab)\b/,
      path: "/profile/me",
      label: "Profile",
    },
    {
      regex: /\b(orders?|purchases?|order\s+history|receipts?)\b/,
      path: "/create/mystore/orders",
      label: "Store orders",
    },
  ];

  const orderedRoutes: RouteConfig[] = [...settingsRoutes, ...routes];

  for (const route of orderedRoutes) {
    if (!route.regex.test(query)) continue;
    if (route.requiresSettingsContext && !settingsContext) continue;
    const allow = route.allowWithoutCue?.() ?? false;
    if (hasNavCue || allow) {
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
