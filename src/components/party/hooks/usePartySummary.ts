"use client";

import * as React from "react";

import { partySummarySettingsSchema, type PartySummarySettings } from "@/server/validation/schemas/party";
import type { SummaryLengthHint, SummaryResult } from "@/types/summary";
import type { PartySession } from "@/components/providers/PartyProvider";

import type { PartyTranscriptSegment } from "../partyTypes";

type PartySummaryResponse = {
  status: "ok";
  summary: string;
  highlights: string[];
  nextActions: string[];
  insights: string[];
  hashtags: string[];
  tone: string | null;
  sentiment: string | null;
  wordCount: number | null;
  model: string | null;
  memoryId: string;
  metadata: {
    summary: PartySummarySettings;
  };
};

type UsePartySummaryOptions = {
  session: PartySession | null;
  updateMetadata(
    updater: (metadata: PartySession["metadata"]) => PartySession["metadata"],
  ): void;
};

export function usePartySummary({ session, updateMetadata }: UsePartySummaryOptions) {
  const [summaryError, setSummaryError] = React.useState<string | null>(null);
  const [summaryUpdating, setSummaryUpdating] = React.useState(false);
  const [summaryGenerating, setSummaryGenerating] = React.useState(false);
  const [summaryResult, setSummaryResult] = React.useState<SummaryResult | null>(null);
  const [transcriptSegments, setTranscriptSegments] = React.useState<PartyTranscriptSegment[]>([]);

  const summarySettings = React.useMemo<PartySummarySettings>(() => {
    const raw = session?.metadata.summary;
    const enabled = typeof raw?.enabled === "boolean" ? raw.enabled : false;
    const verbosity: SummaryLengthHint =
      raw?.verbosity === "brief" || raw?.verbosity === "detailed" || raw?.verbosity === "medium"
        ? raw.verbosity
        : "medium";
    const lastGeneratedAt =
      typeof raw?.lastGeneratedAt === "string" ? raw.lastGeneratedAt : undefined;
    const memoryId = typeof raw?.memoryId === "string" ? raw.memoryId : undefined;
    const lastGeneratedBy =
      typeof raw?.lastGeneratedBy === "string" ? raw.lastGeneratedBy : undefined;
    return {
      enabled,
      verbosity,
      lastGeneratedAt,
      memoryId,
      lastGeneratedBy,
    };
  }, [session?.metadata.summary]);

  React.useEffect(() => {
    if (!session) {
      setSummaryResult(null);
      setSummaryError(null);
      setTranscriptSegments([]);
    }
  }, [session?.partyId, session]);

  React.useEffect(() => {
    if (!summarySettings.enabled) {
      setSummaryResult(null);
    }
  }, [summarySettings.enabled]);

  const applySummarySettings = React.useCallback(
    async (patch: { enabled?: boolean; verbosity?: SummaryLengthHint; reset?: boolean }) => {
      if (!session) {
        setSummaryError("Start a party to configure summaries.");
        return;
      }
      setSummaryUpdating(true);
      setSummaryError(null);
      try {
        const response = await fetch(`/api/party/${session.partyId}/summary`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            (payload &&
              typeof payload === "object" &&
              "message" in payload &&
              typeof (payload as { message?: unknown }).message === "string"
              ? (payload as { message?: string }).message
              : null) ?? "Unable to update summary settings.";
          throw new Error(message);
        }
        const parsed = partySummarySettingsSchema.safeParse(payload);
        const nextSummary = parsed.success ? parsed.data : summarySettings;
        updateMetadata((metadata) => ({
          ...metadata,
          summary: nextSummary,
        }));
        if (patch.enabled === false || patch.reset) {
          setTranscriptSegments([]);
          setSummaryResult(null);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to update summary settings.";
        setSummaryError(message);
      } finally {
        setSummaryUpdating(false);
      }
    },
    [session, summarySettings, updateMetadata],
  );

  const handleSummaryToggle = React.useCallback(() => {
    void applySummarySettings({ enabled: !summarySettings.enabled });
  }, [applySummarySettings, summarySettings.enabled]);

  const handleSummaryVerbosityChange = React.useCallback(
    (value: SummaryLengthHint) => {
      if (value === summarySettings.verbosity) return;
      void applySummarySettings({ verbosity: value });
    },
    [applySummarySettings, summarySettings.verbosity],
  );

  const handleSummaryReset = React.useCallback(() => {
    void applySummarySettings({ reset: true });
  }, [applySummarySettings]);

  const handleTranscriptsChange = React.useCallback(
    (segments: PartyTranscriptSegment[]) => {
      setTranscriptSegments(segments);
    },
    [],
  );

  const handleGenerateSummary = React.useCallback(async () => {
    if (!session) {
      setSummaryError("Start a party to generate a summary.");
      return;
    }
    if (!summarySettings.enabled) {
      setSummaryError("Turn on summaries before generating a recap.");
      return;
    }
    if (!transcriptSegments.length) {
      setSummaryError("We're still capturing the conversation. Try again in a moment.");
      return;
    }
    setSummaryGenerating(true);
    setSummaryError(null);
    try {
      const recentSegments = transcriptSegments.slice(-160);
      const segmentsPayload = recentSegments.map((segment) => {
        const payload: {
          id: string;
          text: string;
          speakerId: string | null;
          speakerName: string | null;
          startTime?: number;
          endTime?: number;
          language?: string | null;
          final?: boolean;
        } = {
          id: segment.id,
          text: segment.text,
          speakerId: segment.speakerId,
          speakerName: segment.speakerName,
        };
        if (typeof segment.startTime === "number") {
          payload.startTime = segment.startTime;
        }
        if (typeof segment.endTime === "number") {
          payload.endTime = segment.endTime;
        }
        if (segment.language !== undefined) {
          payload.language = segment.language ?? null;
        }
        if (typeof segment.final === "boolean") {
          payload.final = segment.final;
        }
        return payload;
      });
      const participantMap = new Map<string, string | null>();
      for (const segment of recentSegments) {
        if (segment.speakerId && !participantMap.has(segment.speakerId)) {
          participantMap.set(segment.speakerId, segment.speakerName ?? null);
        }
      }
      const participants =
        participantMap.size > 0
          ? Array.from(participantMap.entries()).map(([id, name]) => ({
              id,
              name,
            }))
          : undefined;

      const response = await fetch(`/api/party/${session.partyId}/summary`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          verbosity: summarySettings.verbosity,
          segments: segmentsPayload,
          participants,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (
        !response.ok ||
        !payload ||
        typeof payload !== "object" ||
        (payload as PartySummaryResponse).status !== "ok"
      ) {
        const message =
          payload &&
          typeof payload === "object" &&
          "message" in payload &&
          typeof (payload as { message?: unknown }).message === "string"
            ? (payload as { message?: string }).message
            : "Unable to generate a party summary.";
        throw new Error(message);
      }
      const summaryPayload = payload as PartySummaryResponse;
      updateMetadata((metadata) => ({
        ...metadata,
        summary: summaryPayload.metadata.summary,
      }));
      setSummaryResult({
        summary: summaryPayload.summary,
        highlights: summaryPayload.highlights,
        nextActions: summaryPayload.nextActions,
        insights: summaryPayload.insights,
        hashtags: summaryPayload.hashtags,
        tone: summaryPayload.tone,
        sentiment: summaryPayload.sentiment,
        postTitle: null,
        postPrompt: null,
        wordCount: summaryPayload.wordCount,
        model: summaryPayload.model,
        source: "party",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to generate a party summary.";
      setSummaryError(message);
    } finally {
      setSummaryGenerating(false);
    }
  }, [session, summarySettings, transcriptSegments, updateMetadata]);

  return {
    summarySettings,
    summaryResult,
    summaryError,
    summaryUpdating,
    summaryGenerating,
    transcriptSegments,
    handleSummaryToggle,
    handleSummaryVerbosityChange,
    handleSummaryReset,
    handleTranscriptsChange,
    handleGenerateSummary,
  };
}
