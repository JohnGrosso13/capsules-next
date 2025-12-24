"use client";

import * as React from "react";

import { useAttachmentUpload } from "@/hooks/useAttachmentUpload";

export default function UploadHarnessPage() {
  const {
    fileInputRef,
    attachment,
    readyAttachment,
    handleAttachClick,
    handleAttachmentSelect,
    clearAttachment,
  } = useAttachmentUpload(5 * 1024 * 1024, {
    metadata: { surface: "playwright" },
  });

  return (
    <main style={{ padding: "1.5rem", fontFamily: "sans-serif", maxWidth: 640 }}>
      <h1>Playwright Upload Harness</h1>
      <p>Attaches a file with the same pipeline the app uses (R2 multipart via direct uploader).</p>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "1rem" }}>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleAttachmentSelect}
          data-testid="upload-file-input"
        />
        <button type="button" onClick={handleAttachClick} data-testid="upload-attach-button">
          Attach file
        </button>
        <button type="button" onClick={clearAttachment} data-testid="upload-clear-button">
          Clear
        </button>
      </div>
      <dl style={{ marginTop: "1rem", lineHeight: 1.6 }}>
        <div>
          <dt>Status</dt>
          <dd data-testid="upload-status">{attachment?.status ?? "idle"}</dd>
        </div>
        <div>
          <dt>Progress</dt>
          <dd data-testid="upload-progress">
            {attachment ? Math.round((attachment.progress ?? 0) * 100) : 0}%
          </dd>
        </div>
        <div>
          <dt>Phase</dt>
          <dd data-testid="upload-phase">{attachment?.phase ?? "idle"}</dd>
        </div>
        <div>
          <dt>Ready URL</dt>
          <dd data-testid="upload-url">{readyAttachment?.url ?? ""}</dd>
        </div>
        <div>
          <dt>Error</dt>
          <dd data-testid="upload-error">{attachment?.error ?? ""}</dd>
        </div>
      </dl>
    </main>
  );
}
