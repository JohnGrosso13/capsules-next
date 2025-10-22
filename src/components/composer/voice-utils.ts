"use client";

export function describeVoiceError(code: string | null): string | null {
  if (!code) return null;
  const normalized = code.toLowerCase();
  if (normalized.includes("not-allowed")) {
    return "Microphone access is blocked. Update your browser settings to allow it.";
  }
  if (normalized === "service-not-allowed") {
    return "Microphone access is blocked by your browser.";
  }
  if (normalized === "no-speech") {
    return "Didn't catch that. Try speaking again.";
  }
  if (normalized === "aborted") {
    return null;
  }
  if (normalized === "audio-capture") {
    return "No microphone was detected.";
  }
  if (normalized === "unsupported") {
    return "Voice input isn't supported in this browser.";
  }
  if (normalized === "network") {
    return "Voice input is unavailable right now.";
  }
  if (normalized === "speech-start-error" || normalized === "speech-stop-error") {
    return "Voice input could not be started. Check your microphone and try again.";
  }
  return "Voice input is unavailable right now.";
}

export function truncateVoiceText(text: string, max = 120): string {
  if (text.length <= max) return text;
  if (max <= 3) return "...";
  return `${text.slice(0, max - 3)}...`;
}
