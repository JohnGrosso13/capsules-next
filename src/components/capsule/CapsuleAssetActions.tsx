"use client";

import * as React from "react";
import { UploadSimple, Brain } from "@phosphor-icons/react/dist/ssr";

import styles from "./CapsuleBannerCustomizer.module.css";
import { Button } from "@/components/ui/button";

type CapsuleAssetActionsProps = {
  onUploadClick: () => void;
  onOpenMemoryPicker: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  memoryButtonRef: React.RefObject<HTMLButtonElement | null>;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  memoryPickerOpen: boolean;
};

export function CapsuleAssetActions({
  onUploadClick,
  onOpenMemoryPicker,
  fileInputRef,
  memoryButtonRef,
  onFileChange,
  memoryPickerOpen,
}: CapsuleAssetActionsProps) {
  return (
    <>
      <div className={styles.previewActions}>
        <Button
          variant="secondary"
          size="sm"
          onClick={onUploadClick}
          leftIcon={<UploadSimple size={16} weight="bold" />}
        >
          Upload image
        </Button>
        <Button
          ref={memoryButtonRef}
          variant="secondary"
          size="sm"
          onClick={onOpenMemoryPicker}
          leftIcon={<Brain size={16} weight="bold" />}
          aria-haspopup="dialog"
          aria-expanded={memoryPickerOpen}
          aria-controls="memory-picker-dialog"
        >
          Memory
        </Button>
      </div>
      <input
        ref={fileInputRef}
        className={styles.fileInput}
        type="file"
        accept="image/*"
        onChange={onFileChange}
      />
    </>
  );
}
