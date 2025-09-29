"use client";

import * as React from "react";
import { safeRandomUUID } from "@/lib/random";

import { uploadFileDirect } from "@/lib/uploads/direct-client";

const DEFAULT_MAX_SIZE = 2 * 1024 * 1024 * 1024; // 2 GB

export type LocalAttachment = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  status: "idle" | "uploading" | "ready" | "error";
  url: string | null;
  thumbUrl?: string | null;
  error?: string;
  progress: number;
  key?: string;
  sessionId?: string | null;
};

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") resolve(result);
      else reject(new Error("Unsupported file format."));
    };
    reader.readAsDataURL(file);
  });
}

async function captureVideoThumbnail(file: File, atSeconds = 0.3): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = url;
    video.muted = true;
    (video as HTMLVideoElement & { playsInline?: boolean }).playsInline = true;
    const cleanup = () => URL.revokeObjectURL(url);
    const onError = () => {
      cleanup();
      reject(new Error("Couldn't read video"));
    };
    video.onerror = onError;
    video.onloadeddata = async () => {
      try {
        if (!Number.isFinite(atSeconds) || atSeconds < 0) atSeconds = 0;
        video.currentTime = Math.min(atSeconds, (video.duration || atSeconds) - 0.01);
      } catch {
        // ignore seek errors
      }
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        const w = video.videoWidth || 640;
        const h = video.videoHeight || 360;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas not supported");
        ctx.drawImage(video, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        cleanup();
        resolve(dataUrl);
      } catch (err) {
        cleanup();
        reject(err instanceof Error ? err : new Error("Thumbnail failed"));
      }
    };
  });
}

export function useAttachmentUpload(maxSizeBytes = DEFAULT_MAX_SIZE) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [attachment, setAttachment] = React.useState<LocalAttachment | null>(null);

  const readyAttachment =
    attachment && attachment.status === "ready" && attachment.url ? attachment : null;
  const uploading = attachment?.status === "uploading";

  const clearAttachment = React.useCallback(() => {
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleAttachClick = React.useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleAttachmentSelect = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      if (event.target.value) event.target.value = "";
      if (!file) return;

      const id = safeRandomUUID();
      const mimeType = file.type || "application/octet-stream";

      if (!mimeType.startsWith("image/") && !mimeType.startsWith("video/")) {
        setAttachment({
          id,
          name: file.name,
          size: file.size,
          mimeType,
          status: "error",
          url: null,
          error: "Only image or video attachments are supported right now.",
          progress: 0,
        });
        return;
      }

      if (file.size > maxSizeBytes) {
        const maxMB = Math.round(maxSizeBytes / (1024 * 1024));
        setAttachment({
          id,
          name: file.name,
          size: file.size,
          mimeType,
          status: "error",
          url: null,
          error: `File is too large (max ${maxMB.toLocaleString()} MB).`,
          progress: 0,
        });
        return;
      }

      setAttachment({
        id,
        name: file.name,
        size: file.size,
        mimeType,
        status: "uploading",
        url: null,
        thumbUrl: null,
        progress: 0,
      });

      try {
        let result = null as Awaited<ReturnType<typeof uploadFileDirect>> | null;
        let directError: Error | null = null;
        try {
          result = await uploadFileDirect(file, {
            kind: mimeType.startsWith("video/") ? "video" : "image",
            metadata: {
              original_filename: file.name,
              mime_type: mimeType,
              file_size: file.size,
              source: "attachment",
            },
            onProgress: ({ uploadedBytes, totalBytes }) => {
              setAttachment((prev) =>
                prev && prev.id === id
                  ? { ...prev, progress: totalBytes ? uploadedBytes / totalBytes : 0 }
                  : prev,
              );
            },
          });
        } catch (error) {
          directError = error instanceof Error ? error : new Error(String(error));
          console.warn("direct upload failed, falling back to base64", directError);
        }

        if (!result) {
          const dataUrl = await readFileAsDataUrl(file);
          const base64 = dataUrl.split(",").pop() ?? "";
          const fallbackResponse = await fetch("/api/upload_base64", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename: file.name,
              content_type: mimeType,
              data_base64: base64,
            }),
          });
          if (!fallbackResponse.ok) {
            const msg = await fallbackResponse.text().catch(() => "");
            throw new Error(msg || directError?.message || "Upload failed");
          }
          const fallbackJson = (await fallbackResponse.json()) as {
            url: string;
            key?: string;
          };
          result = {
            url: fallbackJson.url,
            key: fallbackJson.key ?? "",
            sessionId: null,
            uploadId: fallbackJson.key ?? `base64-${id}`,
          };
        }

        if (!result) {
          throw directError ?? new Error("Upload failed");
        }

        let thumbUrl: string | null = null;
        if (mimeType.startsWith("video/")) {
          try {
            const thumbDataUrl = await captureVideoThumbnail(file, 0.3);
            const thumbBase64 = thumbDataUrl.split(",").pop() ?? "";
            if (thumbBase64) {
              const thumbRes = await fetch("/api/upload_base64", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  filename: `thumb-${file.name.replace(/\.[^.]+$/, "")}.jpg`,
                  content_type: "image/jpeg",
                  data_base64: thumbBase64,
                }),
              });
              if (thumbRes.ok) {
                const json = (await thumbRes.json()) as { url?: string };
                thumbUrl = json?.url ?? thumbDataUrl;
              } else {
                thumbUrl = thumbDataUrl;
              }
            }
          } catch (thumbError) {
            console.warn("thumbnail extract failed", thumbError);
          }
        }

        setAttachment((prev) =>
          prev && prev.id === id
            ? {
                ...prev,
                status: "ready",
                url: result.url,
                thumbUrl: thumbUrl ?? prev.thumbUrl ?? null,
                progress: 1,
                key: result.key,
                sessionId: result.sessionId,
              }
            : prev,
        );
      } catch (error) {
        console.error("Attachment upload failed", error);
        const message = error instanceof Error ? error.message : "Upload failed";
        setAttachment((prev) =>
          prev && prev.id === id
            ? { ...prev, status: "error", url: null, error: message, progress: 0 }
            : prev,
        );
      }
    },
    [maxSizeBytes],
  );

  return {
    fileInputRef,
    attachment,
    readyAttachment,
    uploading,
    clearAttachment,
    handleAttachClick,
    handleAttachmentSelect,
  } as const;
}
