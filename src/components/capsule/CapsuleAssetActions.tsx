"use client";

import * as React from "react";
import { UploadSimple, Brain } from "@phosphor-icons/react/dist/ssr";

import styles from "./CapsuleCustomizer.module.css";
import { Button } from "@/components/ui/button";
import { useCapsuleCustomizerMemory, useCapsuleCustomizerUploads } from "./hooks/capsuleCustomizerContext";

export function CapsuleAssetActions() {
  const uploads = useCapsuleCustomizerUploads();
  const memory = useCapsuleCustomizerMemory();

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
