"use client";

import * as React from "react";

import type { AssistantTaskSummary } from "@/types/assistant";

type UseAssistantTasksOptions = {
  includeCompleted?: boolean;
  pollIntervalMs?: number;
};

export function useAssistantTasks(options: UseAssistantTasksOptions = {}) {
  const { includeCompleted = false, pollIntervalMs = 0 } = options;
  const [tasks, setTasks] = React.useState<AssistantTaskSummary[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchTasks = React.useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (includeCompleted) params.set("includeCompleted", "true");
      try {
        const init: RequestInit = {};
        if (signal) {
          init.signal = signal;
        }
        const response = await fetch(`/api/assistant/tasks?${params.toString()}`, init);
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new Error(text || `Failed to load tasks (${response.status})`);
        }
        const payload = (await response.json().catch(() => null)) as {
          tasks?: AssistantTaskSummary[];
        } | null;
        setTasks(payload?.tasks ?? []);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load tasks");
      } finally {
        setLoading(false);
      }
    },
    [includeCompleted],
  );

  React.useEffect(() => {
    const controller = new AbortController();
    void fetchTasks(controller.signal);
    return () => controller.abort();
  }, [fetchTasks]);

  React.useEffect(() => {
    if (!pollIntervalMs) return;
    const handle = window.setInterval(() => {
      void fetchTasks();
    }, pollIntervalMs);
    return () => window.clearInterval(handle);
  }, [fetchTasks, pollIntervalMs]);

  return {
    tasks,
    loading,
    error,
    refresh: () => fetchTasks(),
  };
}
