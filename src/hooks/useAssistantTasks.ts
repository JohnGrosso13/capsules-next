"use client";

import * as React from "react";

import type { AssistantTaskSummary } from "@/types/assistant";

type UseAssistantTasksOptions = {
  includeCompleted?: boolean;
  pollIntervalMs?: number;
  idlePollIntervalMs?: number;
};

type FetchOptions = {
  signal?: AbortSignal;
  background?: boolean;
};

export function useAssistantTasks(options: UseAssistantTasksOptions = {}) {
  const { includeCompleted = false, pollIntervalMs = 0, idlePollIntervalMs = 0 } = options;
  const [tasks, setTasks] = React.useState<AssistantTaskSummary[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchTasks = React.useCallback(
    async (options?: FetchOptions) => {
      const { signal, background = false } = options ?? {};
      if (!background) {
        setLoading(true);
        setError(null);
      }
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
        setError(null);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load tasks");
      } finally {
        if (!background) {
          setLoading(false);
        }
      }
    },
    [includeCompleted],
  );

  React.useEffect(() => {
    const controller = new AbortController();
    void fetchTasks({ signal: controller.signal });
    return () => controller.abort();
  }, [fetchTasks]);

  const hasActiveTasks = React.useMemo(() => {
    if (!tasks || tasks.length === 0) return false;
    return tasks.some((task) => task.status !== "completed" && task.status !== "partial");
  }, [tasks]);

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!pollIntervalMs && !idlePollIntervalMs) return undefined;
    const interval = hasActiveTasks ? pollIntervalMs : idlePollIntervalMs;
    if (!interval) return undefined;
    const handle = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void fetchTasks({ background: true });
    }, interval);
    return () => window.clearInterval(handle);
  }, [fetchTasks, pollIntervalMs, idlePollIntervalMs, hasActiveTasks]);

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return undefined;
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      void fetchTasks({ background: true });
    };
    window.addEventListener("focus", handleVisibility);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleVisibility);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchTasks]);

  return {
    tasks,
    loading,
    error,
    refresh: () => fetchTasks(),
  };
}
