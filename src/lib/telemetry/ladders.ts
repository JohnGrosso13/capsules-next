"use client";

type LadderTelemetryEventName =
  | "ladders.wizard.view"
  | "ladders.publish.start"
  | "ladders.autosave.status"
  | "ladders.publish.complete"
  | "ladders.error.surface"
  | "ladders.validation.issue"
  | "ladders.draft.exit"
  | "ladders.draft.generate"
  | "ladders.step.enter"
  | "ladders.step.complete"
  | "ladders.section.first_challenge"
  | "ladders.roster.change"
  | "ladders.filter.change"
  | "ladders.sort.change"
  | "ladders.load_more"
  | "ladders.retry.click";

export type LadderTelemetryEvent = {
  event: LadderTelemetryEventName;
  payload?: Record<string, unknown>;
  capsuleId?: string | null;
  ladderId?: string | null;
  timestamp?: string;
};

const ENDPOINT = "/api/telemetry/ladders";

export async function trackLadderEvent(event: LadderTelemetryEvent): Promise<void> {
  if (typeof window === "undefined") return;
  if (typeof process !== "undefined" && process.env.NODE_ENV === "test") return;
  const payload = {
    ...event,
    timestamp: event.timestamp ?? new Date().toISOString(),
  };
  const body = JSON.stringify(payload);
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(ENDPOINT, blob);
      return;
    }
    if (typeof fetch === "function") {
      await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      });
    }
  } catch (error) {
    console.warn("ladders.telemetry.dispatch_failed", error);
  }
}
