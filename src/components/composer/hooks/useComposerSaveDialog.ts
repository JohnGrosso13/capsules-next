"use client";

import * as React from "react";
import type { ComposerChatAttachment } from "@/lib/composer/chat-types";
import type { ComposerSaveStatus } from "../types";

export type SaveDialogTarget =
  | { type: "draft" }
  | { type: "attachment"; attachment: ComposerChatAttachment };

export function useComposerSaveDialog(saveStatus: ComposerSaveStatus) {
  const [saveDialogOpen, setSaveDialogOpen] = React.useState(false);
  const [saveDialogTarget, setSaveDialogTarget] = React.useState<SaveDialogTarget | null>(null);
  const [saveTitle, setSaveTitle] = React.useState("");
  const [saveDescription, setSaveDescription] = React.useState("");
  const [saveError, setSaveError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!saveDialogOpen) return;
    if (saveStatus.state === "succeeded") {
      setSaveDialogOpen(false);
      setSaveDialogTarget(null);
      setSaveTitle("");
      setSaveDescription("");
      setSaveError(null);
    } else if (saveStatus.state === "failed" && saveStatus.message) {
      setSaveError(saveStatus.message);
    }
  }, [saveDialogOpen, saveStatus]);

  return {
    saveDialogOpen,
    setSaveDialogOpen,
    saveDialogTarget,
    setSaveDialogTarget,
    saveTitle,
    setSaveTitle,
    saveDescription,
    setSaveDescription,
    saveError,
    setSaveError,
  };
}
