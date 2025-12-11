import * as React from "react";

import type { ComposerFormState } from "../hooks/useComposerFormReducer";
import footerStyles from "../styles/composer-footer.module.css";

type ComposerFooterProps = {
  footerHint: string | React.ReactNode;
  privacy: ComposerFormState["privacy"];
  onPrivacyChange: (value: ComposerFormState["privacy"]) => void;
  loading: boolean;
  attachmentUploading: boolean;
  onClose: () => void;
  onSave: () => void;
  onPreviewToggle: () => void;
  previewOpen: boolean;
  onPost: () => void;
  canSave: boolean;
  canPost: boolean;
  saving: boolean;
};

export function ComposerFooter({
  footerHint,
  privacy,
  onPrivacyChange,
  loading,
  attachmentUploading,
  onClose,
  onSave,
  onPreviewToggle,
  previewOpen,
  onPost,
  canSave,
  canPost,
  saving,
}: ComposerFooterProps) {
  return (
    <footer className={footerStyles.panelFooter}>
      <div className={footerStyles.footerLeft}>
        {footerHint ? <p className={footerStyles.footerHint}>{footerHint}</p> : null}
        <div className={footerStyles.privacyGroup}>
          <span className={footerStyles.privacyLabel}>Visibility</span>
          <select
            aria-label="Visibility"
            className={footerStyles.privacySelect}
            value={privacy}
            onChange={(event) => onPrivacyChange((event.target.value || "public") as ComposerFormState["privacy"])}
            disabled={loading}
          >
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </div>
      </div>
      <div className={footerStyles.footerActions}>
        <button
          type="button"
          className={footerStyles.previewToggle}
          onClick={onPreviewToggle}
          aria-pressed={previewOpen}
          disabled={loading || attachmentUploading}
        >
          {previewOpen ? "Hide preview" : "Preview"}
        </button>
        <button
          type="button"
          className={footerStyles.secondaryAction}
          onClick={onSave}
          disabled={!canSave || saving || loading}
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          className={footerStyles.primaryAction}
          onClick={onPost}
          disabled={!canPost || loading || attachmentUploading}
        >
          Post
        </button>
        <button type="button" className={footerStyles.cancelAction} onClick={onClose}>
          Close
        </button>
      </div>
    </footer>
  );
}
