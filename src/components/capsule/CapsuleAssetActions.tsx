"use client";

import * as React from "react";
import { UploadSimple, Brain, PaintBrush, Eraser } from "@phosphor-icons/react/dist/ssr";

import styles from "./CapsuleCustomizer.module.css";
import { Button } from "@/components/ui/button";
import {
  useCapsuleCustomizerPreview,
  useCapsuleCustomizerMemory,
  useCapsuleCustomizerUploads,
} from "./hooks/capsuleCustomizerContext";

export function CapsuleAssetActions() {
  const uploads = useCapsuleCustomizerUploads();
  const memory = useCapsuleCustomizerMemory();
  const preview = useCapsuleCustomizerPreview();
  const mask = preview.mask;
  const maskAvailable = Boolean(preview.selected && preview.selected.kind !== "ai");

  return (
    <>
      <div className={styles.previewActions}>
        <Button
          variant="secondary"
          size="sm"
          onClick={uploads.onUploadClick}
          leftIcon={<UploadSimple size={16} weight="bold" />}
        >
          Upload image
        </Button>
        <Button
          ref={memory.buttonRef}
          variant="secondary"
          size="sm"
          onClick={memory.openPicker}
          leftIcon={<Brain size={16} weight="bold" />}
          aria-haspopup="dialog"
          aria-expanded={memory.isPickerOpen}
          aria-controls="memory-picker-dialog"
        >
          Memory
        </Button>
        <Button
          variant={mask.enabled ? "primary" : "secondary"}
          size="sm"
          onClick={() => mask.toggle()}
          leftIcon={<PaintBrush size={16} weight="bold" />}
          disabled={!maskAvailable}
        >
          {mask.enabled ? "Mask on" : "Mask brush"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={mask.clear}
          leftIcon={<Eraser size={16} weight="bold" />}
          disabled={!mask.hasMask}
        >
          Clear mask
        </Button>
      </div>
      <input
        ref={uploads.fileInputRef}
        className={styles.fileInput}
        type="file"
        accept="image/*"
        onChange={uploads.onFileChange}
      />
    </>
  );
}
