"use client";

import * as React from "react";

export type CapsuleLibraryItem = {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  mimeType: string | null;
  title: string | null;
  description: string | null;
  createdAt: string | null;
  meta: Record<string, unknown> | null;
  viewCount: number | null;
  uploadedBy: string | null;
  postId: string | null;
  storageKey: string | null;
};

type CapsuleLibraryResponse = {
  media: CapsuleLibraryItem[];
  files: CapsuleLibraryItem[];
};

type UseCapsuleLibraryResult = {
  media: CapsuleLibraryItem[];
  files: CapsuleLibraryItem[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useCapsuleLibrary(capsuleId: string | null | undefined): UseCapsuleLibraryResult {
  const [media, setMedia] = React.useState<CapsuleLibraryItem[]>([]);
  const [files, setFiles] = React.useState<CapsuleLibraryItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    if (!capsuleId) {
      setMedia([]);
      setFiles([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/capsules/${encodeURIComponent(capsuleId)}/library`, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        const message = await response.text().catch(() => "");
        throw new Error(message || `Request failed (${response.status})`);
      }
      const payload = (await response.json()) as CapsuleLibraryResponse;
      setMedia(Array.isArray(payload.media) ? payload.media : []);
      setFiles(Array.isArray(payload.files) ? payload.files : []);
    } catch (err) {
      console.error("capsule library fetch failed", err);
      setError(err instanceof Error ? err.message : "Failed to load library");
      setMedia([]);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [capsuleId]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    media,
    files,
    loading,
    error,
    refresh,
  };
}
