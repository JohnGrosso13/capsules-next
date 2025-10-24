/**
 * Minimal, literal-first prompt builder for banner generation/editing.
 * Focuses on:
 * - Matching the user's subject literally
 * - 16:9 composition cues suitable for hero banners
 * - Low-noise top third, no text/logos/watermarks
 * - IP-safe handling: avoid copyrighted characters/logos while preserving world cues
 */

export type BannerPromptMode = "generate" | "edit";

function normalize(text: string): string {
  return (text || "").replace(/\s+/g, " ").trim();
}

// Lightweight brand/franchise detection. This is intentionally minimal and easy to extend.
const KNOWN_BRANDS = [
  "overwatch", // Overwatch / Overwatch 2
  "star wars",
  "marvel",
  "dc",
  "pokemon",
  "zelda",
  "mario",
  "halo",
  "fortnite",
  "apex legends",
  "call of duty",
  "league of legends",
  "valorant",
  "counter-strike",
  "dota",
  "world of warcraft",
  "final fantasy",
  "elden ring",
];

export function detectBrandTerm(input: string): string | null {
  const lower = (input || "").toLowerCase();
  for (const brand of KNOWN_BRANDS) {
    if (lower.includes(brand)) return brand;
  }
  return null;
}

// Very small heuristic to decide if the prompt likely asks for characters/logos explicitly.
function _wantsCharactersOrLogos(input: string): boolean {
  const lower = (input || "").toLowerCase();
  return /\b(character|mascot|logo|wordmark|emblem|badge|brand mark|front and center)\b/.test(lower);
}

export function buildLiteralBannerPrompt(options: {
  userPrompt: string;
  capsuleName?: string | null;
  mode?: BannerPromptMode;
}): string {
  const userPrompt = normalize(options.userPrompt);
  const capsuleName = normalize(options.capsuleName || "");
  const mode = options.mode || "generate";

  const brand = detectBrandTerm(userPrompt);
  const ipSafeNote = brand
    ? `No copyrighted characters or brand logos. Evoke the ${brand} world via environment, props, and color language only.`
    : `No copyrighted characters or brand logos.`;

  const subjectLine = brand
    ? `Subject: ${userPrompt} (inspired by ${brand}, without specific characters or logos)`
    : `Subject: ${userPrompt}`;

  const lines: string[] = [];

  lines.push("Create an image that matches the user's subject literally.");
  if (capsuleName) {
    lines.push(`Context: Banner for ${capsuleName}.`);
  }

  lines.push(subjectLine);

  if (mode === "generate") {
    lines.push(
      "Composition: 16:9 wide hero image with a clear focal point and layered depth; reserve gentle negative space near the top for interface.",
    );
  } else {
    lines.push(
      "Edit the supplied image to follow the instruction while keeping overall composition and focal hierarchy. Maintain 16:9 hero framing.",
    );
  }

  lines.push("Constraints: No text, no logos, no watermarks. Keep the top third low-noise.");
  lines.push(ipSafeNote);

  return lines.join("\n");
}

